/**
 * Email service — uses nodemailer with SendGrid SMTP.
 * Requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in env.
 */

const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'admin@sendgrid.app';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'CrestField';
const REPLY_TO = process.env.SENDGRID_REPLY_TO;

function isConfigured() {
  return Boolean(SENDGRID_API_KEY && FROM_EMAIL);
}

function createTransport() {
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: SENDGRID_API_KEY,
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
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
    const transporter = createTransport();
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      replyTo: REPLY_TO || undefined,
      to,
      subject: 'Reset your password',
      text: `You requested a password reset. Open this link to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetLink}">Click here to set a new password</a> (link valid for 1 hour).</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `.trim(),
    });
    console.log('[email] Password reset email sent successfully to', to);
  } catch (err) {
    console.error('[email] SendGrid SMTP error:', err.message);
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
      if (t.due_date) parts.push(`Due: ${t.due_date}`);
      if (t.scheduled_start_date) parts.push(`Field Date: ${t.scheduled_start_date}`);
      if (t.location_name) parts.push(`Location: ${t.location_name}`);
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
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Due Date</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Field Date</th>
            <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;">Location</th>
          </tr>
        </thead>
        <tbody>`;
    for (const t of proj.rows) {
      projectHtml += `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 8px;">${escHtml(t.task_label)}</td>
            <td style="padding:6px 8px;">${escHtml(t.due_date || '—')}</td>
            <td style="padding:6px 8px;">${escHtml(t.scheduled_start_date || '—')}</td>
            <td style="padding:6px 8px;">${escHtml(t.location_name || '—')}</td>
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
    const transporter = createTransport();
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      replyTo: REPLY_TO || undefined,
      to,
      subject,
      text,
      html,
    });
    console.log(`[email] Assignment batch (${n} tasks) sent to ${to}`);
  } catch (err) {
    const code = err.responseCode || err.code || '';
    const detail = err.response || err.message;
    console.error(`[email] SendGrid SMTP error sending assignment batch (${code}):`, detail);
    throw err;
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  isConfigured,
  sendPasswordResetEmail,
  sendTaskAssignmentBatchEmail,
};
