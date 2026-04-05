const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');

/** Base URL for server-to-server calls (same host as this process). */
function getInternalApiBase() {
  const fromEnv = process.env.INTERNAL_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }
  const port = Number(process.env.PORT) || 5000;
  const host = process.env.PDF_LOOPBACK_HOST || '127.0.0.1';
  return `http://${host}:${port}`;
}

function stringifyWithBigInt(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
}

function parseJsonResponse(raw, contentType, statusCode) {
  const ct = contentType || '';
  const looksJson =
    ct.includes('application/json') ||
    ct.includes('+json') ||
    raw.length === 0 ||
    (raw.length > 0 && (raw[0] === 0x7b || raw[0] === 0x5b)); // { or [
  if (!looksJson && raw.length > 0) {
    throw new Error(`Expected JSON but got content-type=${ct} status=${statusCode}`);
  }
  if (!raw.length) return null;
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (e) {
    throw new Error(`Invalid JSON in internal PDF response (status ${statusCode})`);
  }
}

const db = require('../db');
const { supabase } = require('../db/supabase');
const { ensureRebarReportRow } = require('../utils/ensureRebarReportRow');
const emailService = require('../services/email');
const { JWT_SECRET } = require('../middleware/auth');

const AUTO_SEND_KEY = 'auto_send_approved_reports_enabled';
const AUTO_SEND_BODY_KEY = 'auto_send_approved_reports_body_template';

const DEFAULT_AUTO_SEND_BODY_TEMPLATE = [
  'Hello,',
  '',
  'Attached are the approved report(s) for {{clientName}} dated {{date}}.',
  '',
  'Regards,',
  '{{companyName}}'
].join('\n');

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(template, variables) {
  return String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = variables[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function createTenantAdminToken(tenantId) {
  // PDF routes are protected by JWT auth; we mint a short-lived ADMIN token for the tenant.
  const tid = Number(tenantId);
  if (tenantId == null || Number.isNaN(tid)) {
    throw new Error('Internal PDF: invalid tenantId');
  }
  return jwt.sign(
    { id: 0, role: 'ADMIN', tenantId: tid },
    JWT_SECRET,
    { expiresIn: '2 hours' }
  );
}

/**
 * Node's global fetch (undici) can stall or fail when calling the same Express process while
 * handling another request (e.g. bulk-approve → internal PDF). Prefer raw http(s).request with
 * Connection: close for loopback. Browser PDF requests are unaffected.
 */
function shouldPreferNodeHttpForInternalUrl(urlString) {
  if (process.env.PDF_INTERNAL_USE_FETCH === '1' || process.env.PDF_INTERNAL_USE_FETCH === 'true') {
    return false;
  }
  if (process.env.PDF_INTERNAL_USE_NODE_HTTP === '1' || process.env.PDF_INTERNAL_USE_NODE_HTTP === 'true') {
    return true;
  }
  try {
    const u = new URL(urlString);
    const h = (u.hostname || '').toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1';
  } catch {
    return false;
  }
}

function nodeHttpRequestJson(url, method, token, payload, timeoutMs) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Error(`Invalid INTERNAL_API_URL / internal PDF URL: ${url}`);
  }
  const isHttps = u.protocol === 'https:';
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80;
  const hostname = u.hostname;
  const pathWithQuery = `${u.pathname}${u.search}`;
  const httpClient = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path: pathWithQuery,
      method: method || 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload != null ? { 'Content-Type': 'application/json' } : {}),
        Connection: 'close'
      }
    };

    const req = httpClient.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          const statusCode = res.statusCode || 0;
          const parsed = parseJsonResponse(raw, contentType, statusCode);
          if (statusCode < 200 || statusCode >= 300) {
            const message = parsed?.error || parsed?.message || `HTTP ${statusCode}`;
            return reject(new Error(message));
          }
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Internal PDF request timed out after ${timeoutMs}ms`));
    });

    if (payload != null) {
      req.write(payload);
    }
    req.end();
  });
}

async function httpRequestJson({ method, path: pathStr, token, body }) {
  const base = getInternalApiBase();
  const url = `${base}${pathStr.startsWith('/') ? pathStr : `/${pathStr}`}`;
  const timeoutMs = Number(process.env.PDF_INTERNAL_TIMEOUT_MS) || 300000;
  const payload = body != null ? stringifyWithBigInt(body) : null;
  const preferNode = shouldPreferNodeHttpForInternalUrl(url);

  if (typeof fetch === 'function' && !preferNode) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: method || 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload != null ? { 'Content-Type': 'application/json' } : {}),
          Connection: 'close'
        },
        body: payload,
        signal: ac.signal
      });
      const raw = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || '';
      const parsed = parseJsonResponse(raw, contentType, res.status);
      if (!res.ok) {
        const message = parsed?.error || parsed?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      return parsed;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error(`Internal PDF request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return nodeHttpRequestJson(url, method || 'GET', token, payload, timeoutMs);
}

async function getPdfJsonForTask(task, tenantId, token) {
  // tasks from Supabase raw queries use task_type; db.get() rows use taskType (camelCase).
  const taskType = task.task_type || task.taskType;
  const taskIdNum = Number(task.id);
  if (!Number.isFinite(taskIdNum) || taskIdNum < 1) {
    throw new Error('Invalid task id for PDF generation');
  }

  if (taskType === 'DENSITY_MEASUREMENT') {
    return httpRequestJson({ method: 'GET', path: `/api/pdf/density/${taskIdNum}`, token });
  }

  if (taskType === 'REBAR') {
    const seeded = await ensureRebarReportRow(taskIdNum, tenantId);
    if (!seeded) {
      console.error('[getPdfJsonForTask] Could not ensure rebar_reports row for task', taskIdNum);
    }
    return httpRequestJson({ method: 'GET', path: `/api/pdf/rebar/${taskIdNum}`, token });
  }

  if (taskType === 'COMPRESSIVE_STRENGTH') {
    return httpRequestJson({
      method: 'GET',
      path: `/api/pdf/wp1/${taskIdNum}?type=task`,
      token
    });
  }

  if (taskType === 'PROCTOR') {
    // Proctor PDF generator needs proctor_data row (request body).
    let proctorData = await db.get('proctor_data', { taskId: taskIdNum, tenantId });
    if (!proctorData) {
      proctorData = await db.get('proctor_data', { taskId: taskIdNum });
    }
    if (!proctorData) {
      throw new Error('Missing proctor_data for task');
    }

    return httpRequestJson({
      method: 'POST',
      path: `/api/proctor/${taskIdNum}/pdf`,
      token,
      body: proctorData
    });
  }

  throw new Error(`Unsupported task type for auto-send: ${taskType}`);
}

const SUPPORTED_APPROVAL_PDF_TYPES = new Set([
  'DENSITY_MEASUREMENT',
  'REBAR',
  'COMPRESSIVE_STRENGTH',
  'PROCTOR'
]);

/**
 * Generate report PDF via the same HTTP handlers as nightly auto-send, so files land under
 * workflow_base_path / project folder (pdfFileManager). Does not roll back DB on failure.
 */
async function generateAndSaveReportPdfForTask(taskRow, tenantId) {
  const task = {
    id: taskRow.id,
    task_type: taskRow.task_type || taskRow.taskType
  };
  if (!task.id) {
    return { success: false, error: 'Missing task id' };
  }
  if (!task.task_type) {
    return { success: false, error: 'Missing task type' };
  }
  if (!SUPPORTED_APPROVAL_PDF_TYPES.has(task.task_type)) {
    return { skipped: true, taskType: task.task_type };
  }

  const token = createTenantAdminToken(tenantId);
  try {
    // Yield so the same Node process can accept the inbound internal HTTP request cleanly.
    await new Promise((r) => setImmediate(r));
    const pdfJson = await getPdfJsonForTask(task, tenantId, token);
    if (!pdfJson?.success) {
      return {
        success: false,
        error: pdfJson?.error || pdfJson?.message || 'PDF generation failed'
      };
    }
    return {
      success: true,
      saved: !!pdfJson.saved,
      savedPath: pdfJson.savedPath || null,
      fileName: pdfJson.fileName || null,
      saveError: pdfJson.saveError || null
    };
  } catch (err) {
    const message = err?.message || String(err);
    return { success: false, error: message };
  }
}

async function setReportDeliveryStatus({
  tenantId,
  taskId,
  projectId,
  deliveryDate,
  status,
  recipients,
  error,
  sentAt
}) {
  const existing = await db.get('report_deliveries', {
    tenantId,
    taskId,
    deliveryDate
  });

  const data = {
    tenantId,
    taskId,
    projectId,
    deliveryDate,
    status,
    recipients: recipients || [],
    error: error || null,
    sentAt: sentAt || null
  };

  if (existing) {
    // Update only mutable fields; keep stable identity columns as-is.
    const updateData = {
      status: data.status,
      recipients: data.recipients,
      error: data.error,
      sentAt: data.sentAt,
      projectId: data.projectId
    };
    await db.update('report_deliveries', updateData, {
      tenantId,
      taskId,
      deliveryDate
    });
  } else {
    await db.insert('report_deliveries', data);
  }
}

/**
 * Core job function to send approved reports to project clients (nightly).
 *
 * Rules:
 * - Only tenants where auto-send is enabled run.
 * - For each tenant, find APPROVED tasks updated on delivery date.
 * - Group tasks by project, and send ONE email per project/day with all eligible PDFs.
 * - Idempotency: per-task tracking via report_deliveries (tenant_id, task_id, delivery_date).
 */
async function sendApprovedReportsForAllTenants() {
  const summary = {
    skipped: false,
    tenantsProcessed: 0,
    tasksAttempted: 0,
    sent: 0,    // number of task PDFs sent successfully
    failed: 0,  // number of task PDFs that failed
    skippedNoRecipients: 0
  };

  if (!db.isSupabase()) {
    summary.skipped = true;
    return summary;
  }

  // V1: use UTC date for "evening" batch window
  const deliveryDate = new Date().toISOString().slice(0, 10);

  // Only tenants with auto-send enabled
  const settings = await db.all('app_settings', { key: AUTO_SEND_KEY, value: 'true' });

  // Pre-load sendgrid config once
  const sgConfigured = emailService.isConfigured();
  const sgMail = sgConfigured ? require('@sendgrid/mail') : null;
  if (sgMail) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  for (const setting of settings) {
    const tenantId = setting.tenantId;
    if (!tenantId) continue;
    summary.tenantsProcessed += 1;

    const tenant = await db.get('tenants', { id: tenantId });
    const companyName = tenant?.name || tenant?.companyName || 'Company';
    const tenantCompanyEmail = tenant?.companyEmail ?? tenant?.company_email ?? null;

    const bodyTemplateSetting = await db.get('app_settings', { key: AUTO_SEND_BODY_KEY, tenantId });
    const bodyTemplate = bodyTemplateSetting?.value || DEFAULT_AUTO_SEND_BODY_TEMPLATE;

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        *,
        projects:project_id(project_number, project_name, client_name, customer_email, customer_emails)
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'APPROVED')
      .gte('updated_at', `${deliveryDate}T00:00:00.000Z`)
      .lt('updated_at', `${deliveryDate}T23:59:59.999Z`);

    if (tasksError) {
      console.error('Error fetching approved tasks for tenant', tenantId, tasksError);
      continue;
    }

    // Group tasks by project_id so we email the right client with all PDFs for that project/day.
    const tasksByProject = new Map();
    for (const task of tasks || []) {
      const projectId = task.project_id;
      if (!tasksByProject.has(projectId)) tasksByProject.set(projectId, []);
      tasksByProject.get(projectId).push(task);
    }

    const token = createTenantAdminToken(tenantId);

    for (const [projectId, projectTasks] of tasksByProject.entries()) {
      // Ensure we resolve project/recipients from the project join attached to tasks.
      const project = projectTasks[0]?.projects || {};

      const primaryEmail = project.customer_email || null;
      const emailsJson = project.customer_emails || [];
      const extraEmails = Array.isArray(emailsJson) ? emailsJson : [];

      const recipients = [];
      if (primaryEmail) recipients.push(String(primaryEmail).trim());
      for (const e of extraEmails) {
        if (e) recipients.push(String(e).trim());
      }

      const projectNumber = project.project_number || '';
      const clientName = project.client_name || project.project_name || '';

      // Filter tasks already delivered (idempotency)
      const undeliveredTasks = [];
      for (const task of projectTasks) {
        summary.tasksAttempted += 1;
        const existing = await db.get('report_deliveries', {
          tenantId,
          taskId: task.id,
          deliveryDate
        });
        // Retry on FAILED, but never resend a successfully SENT delivery for this task/day.
        if (!existing || existing.status !== 'SENT') undeliveredTasks.push(task);
      }

      if (undeliveredTasks.length === 0) continue;

      if (!recipients || recipients.length === 0) {
        for (const task of undeliveredTasks) {
          await setReportDeliveryStatus({
            tenantId,
            taskId: task.id,
            projectId,
            deliveryDate,
            status: 'SKIPPED',
            recipients: [],
            error: 'No client recipient emails configured on project.',
            sentAt: null
          });
        }
        summary.skippedNoRecipients += undeliveredTasks.length;
        continue;
      }

      // Generate PDFs for each undelivered task in this project group.
      const attachments = [];
      const tasksSentCandidate = [];
      for (const task of undeliveredTasks) {
        try {
          const pdfJson = await getPdfJsonForTask(task, tenantId, token);
          if (!pdfJson?.success) {
            throw new Error(pdfJson?.error || 'PDF generation failed');
          }
          if (!pdfJson.pdfBase64) {
            throw new Error('Missing pdfBase64 in PDF response');
          }

          attachments.push({
            content: pdfJson.pdfBase64,
            filename: pdfJson.fileName || `Report-${task.id}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          });
          tasksSentCandidate.push(task);
        } catch (err) {
          const errorText = err.message || String(err);
          await setReportDeliveryStatus({
            tenantId,
            taskId: task.id,
            projectId,
            deliveryDate,
            status: 'FAILED',
            recipients,
            error: errorText,
            sentAt: null
          });
          summary.failed += 1;
        }
      }

      if (attachments.length === 0) continue;

      const subject = `${companyName} Report(s) ${clientName} ${deliveryDate}`;

      const reportCount = attachments.length;
      const renderedBody = renderTemplate(bodyTemplate, {
        companyName,
        clientName,
        projectNumber,
        date: deliveryDate,
        reportCount
      });

      const text = renderedBody;
      const html = renderedBody
        .split('\n')
        .map(line => escapeHtml(line))
        .join('<br/>');

      let emailStatus = 'SENT';
      let emailErrorText = null;

      try {
        if (!sgConfigured) {
          emailStatus = 'SKIPPED';
          emailErrorText = 'Email service not configured; reports not sent.';
        } else {
          await sgMail.send({
            to: recipients,
            from: {
              email: process.env.SENDGRID_FROM_EMAIL || 'admin@sendgrid.app',
              name: process.env.SENDGRID_FROM_NAME || companyName
            },
            replyTo: tenantCompanyEmail || undefined,
            subject,
            text,
            html,
            attachments
          });
        }
      } catch (err) {
        console.error('[sendApprovedReports] Error sending email for tenant/project', tenantId, projectId, err);
        emailStatus = 'FAILED';
        emailErrorText = err.message || String(err);
      }

      // Mark all successfully generated PDFs for this project/day.
      for (const task of tasksSentCandidate) {
        await setReportDeliveryStatus({
          tenantId,
          taskId: task.id,
          projectId,
          deliveryDate,
          status: emailStatus,
          recipients,
          sentAt: emailStatus === 'SENT' ? new Date().toISOString() : null,
          error: emailErrorText,
        });
        if (emailStatus === 'SENT') summary.sent += 1;
        if (emailStatus === 'FAILED') summary.failed += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  sendApprovedReportsForAllTenants,
  generateAndSaveReportPdfForTask
};

