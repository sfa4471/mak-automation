/**
 * Email service — uses SendGrid HTTP API (v3/mail/send).
 * Requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in env.
 * Uses Node.js built-in https — no extra packages needed.
 */

const https = require('https');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'admin@sendgrid.app';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'CrestField';
const REPLY_TO = process.env.SENDGRID_REPLY_TO;

function isConfigured() {
  return Boolean(SENDGRID_API_KEY && FROM_EMAIL);
}

function sendGridRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'api.sendgrid.com',
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`SendGrid API ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('SendGrid API request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Send password reset email.
 */
async function sendPasswordResetEmail(to, resetLink) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping password reset email to', to);
    return;
  }

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject: 'Reset your password',
      content: [
        {
          type: 'text/plain',
          value: `You requested a password reset. Open this link to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
        },
        {
          type: 'text/html',
          value: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to set a new password</a> (link valid for 1 hour).</p><p>If you didn't request this, you can ignore this email.</p>`,
        },
      ],
    });
    console.log('[email] Password reset email sent successfully to', to);
  } catch (err) {
    console.error('[email] SendGrid API error:', err.message);
    throw err;
  }
}

/**
 * Send a consolidated task-assignment email to a technician.
 * @param {string} to - Recipient email
 * @param {Array} tasks - Array of pending_notifications rows (unsent, all for this tech)
 */
async function sendTaskAssignmentBatchEmail(to, tasks) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping assignment batch email to', to);
    return;
  }
  if (!tasks || tasks.length === 0) return;

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardLink = appUrl ? `${appUrl}/technician-dashboard` : null;
  const assignedBy = tasks[0].assigned_by_name || 'Admin';
  const n = tasks.length;

  // Group tasks by project
  const projectMap = new Map();
  for (const t of tasks) {
    const key = t.project_id;
    if (!projectMap.has(key)) {
      projectMap.set(key, { number: t.project_number, name: t.project_name, rows: [] });
    }
    projectMap.get(key).rows.push(t);
  }

  const projectCount = projectMap.size;
  const subjectProject =
    projectCount === 1
      ? `${tasks[0].project_number || 'Project'} — ${tasks[0].project_name || ''}`
      : `${projectCount} Projects`;
  const subject = `New Task Assignment${n > 1 ? 's' : ''} — ${subjectProject}`.trim();

  // Plain text body
  let text = `Hello,\n\n${assignedBy} has assigned you ${n} new task${n > 1 ? 's' : ''}:\n\n`;
  for (const [, proj] of projectMap) {
    text += `PROJECT: ${proj.number || ''} — ${proj.name || ''}\n`;
    for (const t of proj.rows) {
      const parts = [`  • ${t.task_label}`];
      if (t.scheduled_start_date) parts.push(`Field Date: ${t.scheduled_start_date}`);
      if (t.scheduled_start_time) parts.push(`Time: ${formatTime(t.scheduled_start_time)}`);
      if (t.location_name) parts.push(`Location: ${t.location_name}`);
      if (t.engagement_notes) parts.push(`Task Details: ${t.engagement_notes}`);
      text += parts.join(' | ') + '\n';
    }
    text += '\n';
  }
  if (dashboardLink) text += `View your dashboard: ${dashboardLink}\n\n`;
  text += 'This is an automated notification from CrestField.';

  // HTML body
  let projectHtml = '';
  for (const [, proj] of projectMap) {
    projectHtml += `
      <h3 style="margin:18px 0 6px;color:#2c5282;font-size:15px;">
        ${escHtml(proj.number || '')}${proj.name ? ` — ${escHtml(proj.name)}` : ''}
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#edf2f7;color:#4a5568;">
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Task</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Field Date</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Time</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Location</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Task Details</th>
          </tr>
        </thead>
        <tbody>`;
    for (const t of proj.rows) {
      projectHtml += `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;">${escHtml(t.task_label)}</td>
            <td style="padding:6px 8px;">${escHtml(t.scheduled_start_date || '—')}</td>
            <td style="padding:6px 8px;">${escHtml(t.scheduled_start_time ? formatTime(t.scheduled_start_time) : '—')}</td>
            <td style="padding:6px 8px;">${escHtml(t.location_name || '—')}</td>
            <td style="padding:6px 8px;">${escHtml(t.engagement_notes || '—')}</td>
          </tr>`;
    }
    projectHtml += `
        </tbody>
      </table>`;
  }

  const dashBtn = dashboardLink
    ? `<p style="margin-top:24px;">
        <a href="${dashboardLink}"
           style="background:#2b6cb0;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">
          View Your Dashboard
        </a>
       </p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#2d3748;">
      <div style="background:#2b6cb0;padding:18px 24px;">
        <span style="color:#fff;font-size:18px;font-weight:bold;">CrestField</span>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 12px;">Hello,</p>
        <p style="margin:0 0 18px;">
          <strong>${escHtml(assignedBy)}</strong> has assigned you
          <strong>${n} new task${n > 1 ? 's' : ''}</strong>:
        </p>
        ${projectHtml}
        ${dashBtn}
        <p style="margin-top:32px;font-size:12px;color:#718096;">
          This is an automated notification from CrestField.
        </p>
      </div>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    });
    console.log(`[email] Assignment batch (${n} tasks) sent to ${to}`);
  } catch (err) {
    console.error('[email] SendGrid API error sending assignment batch:', err.message);
    throw err;
  }
}

// "14:30" → "2:30 PM"
function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send a workorder dispatch email to a technician.
 * @param {string} to - Recipient email
 * @param {Object} workorder - Workorder row (workorder_number, scheduled_date, site_location, project_number, project_name)
 * @param {Array} tasks - Array of task objects ({ task_type, task_label, location_name, engagement_notes })
 * @param {string} assignedByName - Name of admin who created the dispatch
 */
async function sendWorkorderDispatchEmail(to, workorder, tasks, assignedByName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping workorder dispatch email to', to);
    return;
  }
  if (!workorder) return;

  const appUrl       = (process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardLink = appUrl ? `${appUrl}/technician/dashboard` : null;
  const assigner     = assignedByName || 'Admin';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate   = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woTime   = workorder.scheduled_time   || workorder.scheduledTime   || '';
  const woSite   = workorder.site_location    || workorder.siteLocation    || '—';
  const projNum  = workorder.project_number   || workorder.projectNumber   || '';
  const projName = workorder.project_name     || workorder.projectName     || '';

  const timePart = woTime ? ` · ${formatTime(woTime)}` : '';
  const subject  = `Field Work Order ${woNumber}${woDate ? ' · ' + woDate : ''}${timePart}`;

  const taskList = tasks || [];
  const hasLocation = taskList.some(t => t.location_name || t.locationName);
  const hasNotes    = taskList.some(t => t.engagement_notes || t.engagementNotes);

  // ── Plain text ──────────────────────────────────────────────────────────
  const projLine = `${projNum}${projName ? ' — ' + projName : ''}`;
  let text = `FIELD WORK ORDER — ${woNumber}\n`;
  text += '='.repeat(40) + '\n\n';
  text += `Dispatched by: ${assigner}\n\n`;
  text += `PROJECT:     ${projLine}\n`;
  text += `DATE:        ${fmtDate(woDate)}\n`;
  if (woTime) text += `REPORT TIME: ${formatTime(woTime)}  ← be on-site by this time\n`;
  text += `SITE:        ${woSite}\n`;
  if (taskList.length > 0) {
    text += '\nTASKS:\n';
    text += '-'.repeat(40) + '\n';
    taskList.forEach((t, i) => {
      const label = t.task_label || t.taskLabel || t.task_type || t.taskType || '';
      const loc   = t.location_name || t.locationName || '';
      const notes = t.engagement_notes || t.engagementNotes || '';
      text += `  ${i + 1}.  ${label}`;
      if (loc)   text += `\n       Location: ${loc}`;
      if (notes) text += `\n       Notes:    ${notes}`;
      text += '\n';
    });
  }
  if (dashboardLink) text += `\nView your dashboard: ${dashboardLink}\n`;
  text += '\nThis is an automated notification from CrestField.';

  // ── HTML ────────────────────────────────────────────────────────────────
  // Task table rows
  let taskBodyRows = '';
  taskList.forEach((t, i) => {
    const label = escHtml(t.task_label || t.taskLabel || t.task_type || t.taskType || '');
    const loc   = escHtml(t.location_name || t.locationName || '');
    const notes = escHtml(t.engagement_notes || t.engagementNotes || '');
    const bg    = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    taskBodyRows += `
      <tr style="background:${bg};">
        <td style="padding:9px 10px;color:#9ca3af;font-size:12px;width:28px;border-bottom:1px solid #f3f4f6;">${i + 1}</td>
        <td style="padding:9px 10px;font-weight:600;font-size:13px;border-bottom:1px solid #f3f4f6;">${label}</td>
        ${hasLocation ? `<td style="padding:9px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${loc || '<span style="color:#d1d5db;">—</span>'}</td>` : ''}
        ${hasNotes    ? `<td style="padding:9px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${notes || '<span style="color:#d1d5db;">—</span>'}</td>` : ''}
      </tr>`;
  });

  const taskTableHtml = taskList.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">#</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Test Type</th>
          ${hasLocation ? '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Location</th>' : ''}
          ${hasNotes    ? '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Notes</th>' : ''}
        </tr>
      </thead>
      <tbody>${taskBodyRows}</tbody>
    </table>` : '';

  const dashBtn = dashboardLink
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
        <tr><td>
          <a href="${dashboardLink}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:11px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
            View Dashboard
          </a>
        </td></tr>
      </table>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#f3f4f6;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:18px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">CrestField</div>
                  <div style="color:#93c5fd;font-size:11px;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Field Work Order</div>
                </td>
                <td style="text-align:right;">
                  <div style="color:#ffffff;font-size:20px;font-weight:700;">${escHtml(woNumber)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#374151;">
              <strong>${escHtml(assigner)}</strong> has dispatched you for a site visit.
            </p>

            <!-- Dispatch info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #f3f4f6;">
              <tr>
                <td style="padding:8px 0;color:#6b7280;width:110px;font-size:13px;border-bottom:1px solid #f9fafb;vertical-align:top;">Project</td>
                <td style="padding:8px 0;font-weight:600;border-bottom:1px solid #f9fafb;">${escHtml(projNum)}${projName ? ' — ' + escHtml(projName) : ''}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f9fafb;">Date</td>
                <td style="padding:8px 0;border-bottom:1px solid #f9fafb;">${escHtml(fmtDate(woDate))}</td>
              </tr>
              ${woTime ? `
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f9fafb;">Report Time</td>
                <td style="padding:8px 0;border-bottom:1px solid #f9fafb;">
                  <span style="background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:15px;padding:3px 10px;border-radius:4px;">${escHtml(formatTime(woTime))}</span>
                  <span style="color:#6b7280;font-size:12px;margin-left:8px;">be on-site by this time</span>
                </td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;">Site</td>
                <td style="padding:8px 0;">${escHtml(woSite)}</td>
              </tr>
            </table>

            ${taskTableHtml}
            ${dashBtn}

            <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
              This is an automated notification from CrestField.
            </p>
          </td>
        </tr>
      </table>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    });
    console.log(`[email] Workorder dispatch email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid API error sending dispatch email:', err.message);
    throw err;
  }
}

/**
 * Send a "workorder reopened" email to a technician.
 * @param {string} to - Tech's email
 * @param {Object} workorder - Workorder row
 * @param {string} techName - Tech's display name
 * @param {string|null} note - Optional note from admin
 * @param {string} adminName - Name of admin who reopened
 */
async function sendWorkorderReopenEmail(to, workorder, techName, note, adminName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping reopen email to', to);
    return;
  }
  if (!workorder) return;

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardLink = appUrl ? `${appUrl}/technician/dashboard` : null;
  const assigner = adminName || 'Admin';
  const tech = techName || 'Technician';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate   = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woTime   = workorder.scheduled_time   || workorder.scheduledTime   || '';
  const woSite   = workorder.site_location    || workorder.siteLocation    || '—';
  const projNum  = workorder.project_number   || workorder.projectNumber   || '';
  const projName = workorder.project_name     || workorder.projectName     || '';

  const timePart = woTime ? ` · Report at ${formatTime(woTime)}` : '';
  const subject  = `Workorder Reopened — ${woNumber}${woDate ? ' · ' + woDate : ''}${timePart}`;

  let text = `Hello ${tech},\n\n${assigner} has reopened a workorder that was previously marked as "Could Not Access".\n\n`;
  text += `The site is now accessible — please proceed with the work as scheduled.\n\n`;
  text += `PROJECT:   ${projNum}${projName ? ' — ' + projName : ''}\n`;
  text += `WORKORDER: ${woNumber}\n`;
  text += `DATE:      ${fmtDate(woDate)}\n`;
  if (woTime) text += `TIME:      ${formatTime(woTime)}\n`;
  text += `SITE:      ${woSite}\n`;
  if (note) text += `\nNOTE FROM ADMIN:\n${note}\n`;
  if (dashboardLink) text += `\nView your dashboard: ${dashboardLink}\n`;
  text += '\nThis is an automated notification from CrestField.';

  const dashBtn = dashboardLink
    ? `<p style="margin-top:24px;"><a href="${dashboardLink}" style="background:#2b6cb0;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">View Dashboard</a></p>`
    : '';

  const noteHtml = note
    ? `<div style="margin:18px 0;padding:12px 16px;background:#fef9c3;border-left:4px solid #f59e0b;border-radius:4px;font-size:14px;"><strong>Note from ${escHtml(assigner)}:</strong><br>${escHtml(note)}</div>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3748;">
      <div style="background:#2b6cb0;padding:18px 24px;">
        <span style="color:#fff;font-size:18px;font-weight:bold;">CrestField</span>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 6px;">Hello ${escHtml(tech)},</p>
        <p style="margin:0 0 18px;">A workorder previously marked as <strong>Could Not Access</strong> has been reopened by <strong>${escHtml(assigner)}</strong>. The site is now accessible — please proceed with the work.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:110px;">Project</td><td style="padding:6px 0;font-weight:600;">${escHtml(projNum)}${projName ? ' — ' + escHtml(projName) : ''}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Workorder</td><td style="padding:6px 0;font-weight:600;">${escHtml(woNumber)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;">${escHtml(fmtDate(woDate))}</td></tr>
          ${woTime ? `<tr><td style="padding:6px 0;color:#6b7280;">Report Time</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#1d4ed8;">${escHtml(formatTime(woTime))}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6b7280;">Site</td><td style="padding:6px 0;">${escHtml(woSite)}</td></tr>
        </table>
        ${noteHtml}
        ${dashBtn}
        <p style="margin-top:32px;font-size:12px;color:#718096;">This is an automated notification from CrestField.</p>
      </div>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    });
    console.log(`[email] Reopen email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid error sending reopen email:', err.message);
    throw err;
  }
}

/**
 * Send a "removed from workorder" email to a technician.
 * @param {string} to - Tech's email
 * @param {Object} workorder - Workorder row
 * @param {string} techName - Tech's display name
 * @param {string} adminName - Name of admin who made the change
 */
async function sendWorkorderRemovedFromEmail(to, workorder, techName, adminName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping removed-from email to', to);
    return;
  }
  if (!workorder) return;

  const assigner = adminName || 'Admin';
  const tech     = techName || 'Technician';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate   = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woSite   = workorder.site_location    || workorder.siteLocation    || '—';
  const projNum  = workorder.project_number   || workorder.projectNumber   || '';
  const projName = workorder.project_name     || workorder.projectName     || '';

  const subject = `You've been removed from Field Work Order ${woNumber}`;

  // ── Plain text ──────────────────────────────────────────────────────────
  let text = `Hello ${tech},\n\n`;
  text += `${assigner} has reassigned Field Work Order ${woNumber}. `;
  text += `You are no longer scheduled for this workorder.\n\n`;
  text += `PROJECT: ${projNum}${projName ? ' — ' + projName : ''}\n`;
  text += `DATE:    ${fmtDate(woDate)}\n`;
  text += `SITE:    ${woSite}\n\n`;
  text += 'This is an automated notification from CrestField.';

  // ── HTML ────────────────────────────────────────────────────────────────
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#f3f4f6;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#1e3a5f;padding:18px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">CrestField</div>
                  <div style="color:#93c5fd;font-size:11px;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Field Work Order</div>
                </td>
                <td style="text-align:right;">
                  <div style="color:#ffffff;font-size:20px;font-weight:700;">${escHtml(woNumber)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hello ${escHtml(tech)},</p>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;">
              <strong>${escHtml(assigner)}</strong> has reassigned Field Work Order <strong>${escHtml(woNumber)}</strong>.
              You are no longer scheduled for this workorder.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #f3f4f6;">
              <tr>
                <td style="padding:8px 0;color:#6b7280;width:110px;font-size:13px;border-bottom:1px solid #f9fafb;vertical-align:top;">Project</td>
                <td style="padding:8px 0;font-weight:600;border-bottom:1px solid #f9fafb;">${escHtml(projNum)}${projName ? ' — ' + escHtml(projName) : ''}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f9fafb;">Date</td>
                <td style="padding:8px 0;border-bottom:1px solid #f9fafb;">${escHtml(fmtDate(woDate))}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;">Site</td>
                <td style="padding:8px 0;">${escHtml(woSite)}</td>
              </tr>
            </table>

            <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
              This is an automated notification from CrestField.
            </p>
          </td>
        </tr>
      </table>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    });
    console.log(`[email] Removed-from email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid error sending removed-from email:', err.message);
    throw err;
  }
}

/**
 * Send a "workorder updated" email to a technician.
 * @param {string} to - Tech's email
 * @param {Object} workorder - Workorder row (workorder_number, scheduled_date, scheduled_time, site_location, project_number, project_name)
 * @param {Array} tasks - Array of task objects ({ task_type, task_label, location_name, engagement_notes })
 * @param {string} adminName - Name of admin who made the update
 */
async function sendWorkorderUpdatedEmail(to, workorder, tasks, adminName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping updated email to', to);
    return;
  }
  if (!workorder) return;

  const appUrl        = (process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardLink = appUrl ? `${appUrl}/technician/dashboard` : null;
  const assigner      = adminName || 'Admin';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate   = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woTime   = workorder.scheduled_time   || workorder.scheduledTime   || '';
  const woSite   = workorder.site_location    || workorder.siteLocation    || '—';
  const projNum  = workorder.project_number   || workorder.projectNumber   || '';
  const projName = workorder.project_name     || workorder.projectName     || '';

  const subject = `Updated: Field Work Order ${woNumber}${woDate ? ' · ' + woDate : ''}`;

  const taskList    = tasks || [];
  const hasLocation = taskList.some(t => t.location_name || t.locationName);
  const hasNotes    = taskList.some(t => t.engagement_notes || t.engagementNotes);

  // ── Plain text ──────────────────────────────────────────────────────────
  const projLine = `${projNum}${projName ? ' — ' + projName : ''}`;
  let text = `UPDATED: FIELD WORK ORDER — ${woNumber}\n`;
  text += '='.repeat(40) + '\n\n';
  text += `${assigner} has updated the details for your upcoming workorder.\n\n`;
  text += `PROJECT:     ${projLine}\n`;
  text += `DATE:        ${fmtDate(woDate)}\n`;
  if (woTime) text += `REPORT TIME: ${formatTime(woTime)}  ← be on-site by this time\n`;
  text += `SITE:        ${woSite}\n`;
  if (taskList.length > 0) {
    text += '\nTASKS:\n';
    text += '-'.repeat(40) + '\n';
    taskList.forEach((t, i) => {
      const label = t.task_label || t.taskLabel || t.task_type || t.taskType || '';
      const loc   = t.location_name || t.locationName || '';
      const notes = t.engagement_notes || t.engagementNotes || '';
      text += `  ${i + 1}.  ${label}`;
      if (loc)   text += `\n       Location: ${loc}`;
      if (notes) text += `\n       Notes:    ${notes}`;
      text += '\n';
    });
  }
  if (dashboardLink) text += `\nView your dashboard: ${dashboardLink}\n`;
  text += '\nThis is an automated notification from CrestField.';

  // ── HTML ────────────────────────────────────────────────────────────────
  let taskBodyRows = '';
  taskList.forEach((t, i) => {
    const label = escHtml(t.task_label || t.taskLabel || t.task_type || t.taskType || '');
    const loc   = escHtml(t.location_name || t.locationName || '');
    const notes = escHtml(t.engagement_notes || t.engagementNotes || '');
    const bg    = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    taskBodyRows += `
      <tr style="background:${bg};">
        <td style="padding:9px 10px;color:#9ca3af;font-size:12px;width:28px;border-bottom:1px solid #f3f4f6;">${i + 1}</td>
        <td style="padding:9px 10px;font-weight:600;font-size:13px;border-bottom:1px solid #f3f4f6;">${label}</td>
        ${hasLocation ? `<td style="padding:9px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${loc || '<span style="color:#d1d5db;">—</span>'}</td>` : ''}
        ${hasNotes    ? `<td style="padding:9px 10px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${notes || '<span style="color:#d1d5db;">—</span>'}</td>` : ''}
      </tr>`;
  });

  const taskTableHtml = taskList.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">#</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Test Type</th>
          ${hasLocation ? '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Location</th>' : ''}
          ${hasNotes    ? '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Notes</th>' : ''}
        </tr>
      </thead>
      <tbody>${taskBodyRows}</tbody>
    </table>` : '';

  const dashBtn = dashboardLink
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
        <tr><td>
          <a href="${dashboardLink}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:11px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
            View Dashboard
          </a>
        </td></tr>
      </table>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#f3f4f6;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:18px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">CrestField</div>
                  <div style="color:#93c5fd;font-size:11px;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Field Work Order</div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <div style="display:inline-block;background:#d97706;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;border-radius:3px;margin-bottom:4px;">Updated</div>
                  <div style="color:#ffffff;font-size:20px;font-weight:700;">${escHtml(woNumber)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#374151;">
              <strong>${escHtml(assigner)}</strong> has updated the details for your upcoming workorder. Please review the information below.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #f3f4f6;">
              <tr>
                <td style="padding:8px 0;color:#6b7280;width:110px;font-size:13px;border-bottom:1px solid #f9fafb;vertical-align:top;">Project</td>
                <td style="padding:8px 0;font-weight:600;border-bottom:1px solid #f9fafb;">${escHtml(projNum)}${projName ? ' — ' + escHtml(projName) : ''}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f9fafb;">Date</td>
                <td style="padding:8px 0;border-bottom:1px solid #f9fafb;">${escHtml(fmtDate(woDate))}</td>
              </tr>
              ${woTime ? `
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f9fafb;">Report Time</td>
                <td style="padding:8px 0;border-bottom:1px solid #f9fafb;">
                  <span style="background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:15px;padding:3px 10px;border-radius:4px;">${escHtml(formatTime(woTime))}</span>
                  <span style="color:#6b7280;font-size:12px;margin-left:8px;">be on-site by this time</span>
                </td>
              </tr>` : ''}
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;">Site</td>
                <td style="padding:8px 0;">${escHtml(woSite)}</td>
              </tr>
            </table>

            ${taskTableHtml}
            ${dashBtn}

            <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
              This is an automated notification from CrestField.
            </p>
          </td>
        </tr>
      </table>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    });
    console.log(`[email] Updated email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid error sending updated email:', err.message);
    throw err;
  }
}

/**
 * Send a "workorder cancelled" email to a technician.
 * @param {string} to - Tech's email
 * @param {Object} workorder - Workorder row
 * @param {string} techName - Tech's display name
 * @param {string} adminName - Name of admin who cancelled
 */
async function sendWorkorderCancelledEmail(to, workorder, techName, adminName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping cancelled email to', to);
    return;
  }
  if (!workorder) return;

  const assigner = adminName || 'Admin';
  const tech     = techName || 'Technician';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate   = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woSite   = workorder.site_location    || workorder.siteLocation    || '—';

  const subject = `Field Work Order ${woNumber} has been cancelled`;

  // ── Plain text ──────────────────────────────────────────────────────────
  let text = `Hello ${tech},\n\n`;
  text += `${assigner} has cancelled Field Work Order ${woNumber} scheduled for ${fmtDate(woDate)} at ${woSite}. `;
  text += `You do not need to report to this site. Please contact your supervisor if you have questions.\n\n`;
  text += 'This is an automated notification from CrestField.';

  // ── HTML ────────────────────────────────────────────────────────────────
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#f3f4f6;padding:24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:18px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">CrestField</div>
                  <div style="color:#93c5fd;font-size:11px;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Field Work Order</div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <div style="display:inline-block;background:#dc2626;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;border-radius:3px;margin-bottom:4px;">Cancelled</div>
                  <div style="color:#ffffff;font-size:20px;font-weight:700;">${escHtml(woNumber)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hello ${escHtml(tech)},</p>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;">
              <strong>${escHtml(assigner)}</strong> has cancelled Field Work Order <strong>${escHtml(woNumber)}</strong>
              scheduled for <strong>${escHtml(fmtDate(woDate))}</strong> at <strong>${escHtml(woSite)}</strong>.
            </p>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;">
              You do not need to report to this site. Please contact your supervisor if you have questions.
            </p>
            <p style="margin-top:32px;font-size:12px;color:#9ca3af;">
              This is an automated notification from CrestField.
            </p>
          </td>
        </tr>
      </table>
    </div>`.trim();

  try {
    await sendGridRequest({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      ...(REPLY_TO ? { reply_to: { email: REPLY_TO } } : {}),
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html',  value: html },
      ],
    });
    console.log(`[email] Cancelled email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid error sending cancelled email:', err.message);
    throw err;
  }
}

module.exports = {
  isConfigured,
  sendPasswordResetEmail,
  sendTaskAssignmentBatchEmail,
  sendWorkorderDispatchEmail,
  sendWorkorderReopenEmail,
  sendWorkorderRemovedFromEmail,
  sendWorkorderUpdatedEmail,
  sendWorkorderCancelledEmail,
};
