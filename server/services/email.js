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
 * @param {Object} workorder - Workorder row (workorder_number, scheduled_date, site_location, description, project_number, project_name)
 * @param {Array} tasks - Array of task objects ({ task_type, task_label, location_name, engagement_notes })
 * @param {string} assignedByName - Name of admin who created the dispatch
 */
async function sendWorkorderDispatchEmail(to, workorder, tasks, assignedByName) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping workorder dispatch email to', to);
    return;
  }
  if (!workorder) return;

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardLink = appUrl ? `${appUrl}/technician/dashboard` : null;
  const assigner = assignedByName || 'Admin';

  const fmtDate = (d) => {
    if (!d) return 'TBD';
    const [y, m, day] = String(d).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const woNumber  = workorder.workorder_number || workorder.workorderNumber || '';
  const woDate    = workorder.scheduled_date   || workorder.scheduledDate   || '';
  const woTime    = workorder.scheduled_time   || workorder.scheduledTime   || '';
  const woSite    = workorder.site_location    || workorder.siteLocation    || '—';
  const projNum   = workorder.project_number   || workorder.projectNumber   || '';
  const projName  = workorder.project_name     || workorder.projectName     || '';
  const woDesc    = workorder.description      || '';

  const timePart  = woTime ? ` · Report at ${formatTime(woTime)}` : '';
  const subject   = `New Dispatch — ${woNumber}${woDate ? ' · ' + woDate : ''}${timePart}`;

  // Plain text
  let text = `Hello,\n\n${assigner} has dispatched you for the following site visit:\n\n`;
  text += `PROJECT:     ${projNum}${projName ? ' — ' + projName : ''}\n`;
  text += `WORKORDER:   ${woNumber}${woDesc ? ' — ' + woDesc : ''}\n`;
  text += `DATE:        ${fmtDate(woDate)}\n`;
  if (woTime) text += `REPORT TIME: ${formatTime(woTime)}  ← be on-site by this time\n`;
  text += `SITE:        ${woSite}\n`;
  if (tasks && tasks.length > 0) {
    text += '\nTASKS:\n';
    for (const t of tasks) {
      const label = t.task_label || t.taskLabel || t.task_type || t.taskType || '';
      const loc   = t.location_name || t.locationName || '';
      text += `  • ${label}${loc ? ' — ' + loc : ''}\n`;
    }
  }
  if (dashboardLink) text += `\nView your dashboard: ${dashboardLink}\n`;
  text += '\nThis is an automated notification from CrestField.';

  // HTML
  let taskRowsHtml = '';
  if (tasks && tasks.length > 0) {
    const items = tasks.map(t => {
      const label = t.task_label || t.taskLabel || t.task_type || t.taskType || '';
      const loc   = t.location_name || t.locationName || '';
      const notes = t.engagement_notes || t.engagementNotes || '';
      return `<li style="margin-bottom:4px;">${escHtml(label)}${loc ? ` <span style="color:#6b7280;">— ${escHtml(loc)}</span>` : ''}${notes ? `<br><span style="color:#9ca3af;font-size:12px;">${escHtml(notes)}</span>` : ''}</li>`;
    }).join('');
    taskRowsHtml = `<p style="margin:16px 0 6px;font-weight:600;">Tasks to perform:</p><ul style="margin:4px 0 0;padding-left:18px;">${items}</ul>`;
  }

  const dashBtn = dashboardLink
    ? `<p style="margin-top:24px;"><a href="${dashboardLink}" style="background:#2b6cb0;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">View Dashboard</a></p>`
    : '';

  const projDisplay = `${escHtml(projNum)}${projName ? ' — ' + escHtml(projName) : ''}`;
  const woDisplay   = `${escHtml(woNumber)}${woDesc ? ' <span style="color:#6b7280;font-weight:400;">— ' + escHtml(woDesc) + '</span>' : ''}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d3748;">
      <div style="background:#2b6cb0;padding:18px 24px;">
        <span style="color:#fff;font-size:18px;font-weight:bold;">CrestField</span>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 12px;">Hello,</p>
        <p style="margin:0 0 18px;"><strong>${escHtml(assigner)}</strong> has dispatched you for a site visit:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:110px;vertical-align:top;">Project</td><td style="padding:6px 0;font-weight:600;">${projDisplay}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">Workorder</td><td style="padding:6px 0;font-weight:600;">${woDisplay}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;">${escHtml(fmtDate(woDate))}</td></tr>
          ${woTime ? `<tr><td style="padding:6px 0;color:#6b7280;">Report Time</td><td style="padding:6px 0;font-weight:700;font-size:16px;color:#1d4ed8;">${escHtml(formatTime(woTime))}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6b7280;">Site</td><td style="padding:6px 0;">${escHtml(woSite)}</td></tr>
        </table>
        ${taskRowsHtml}
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
    console.log(`[email] Workorder dispatch email sent to ${to} for WO ${woNumber}`);
  } catch (err) {
    console.error('[email] SendGrid API error sending dispatch email:', err.message);
    throw err;
  }
}

module.exports = {
  isConfigured,
  sendPasswordResetEmail,
  sendTaskAssignmentBatchEmail,
  sendWorkorderDispatchEmail,
};
