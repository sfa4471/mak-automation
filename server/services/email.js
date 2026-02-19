/**
 * Email service (SendGrid). Used for forgot-password and admin invite (branch DB only).
 * Requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in env.
 */

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'admin@sendgrid.app';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'CrestField';
const REPLY_TO = process.env.SENDGRID_REPLY_TO;

function isConfigured() {
  return Boolean(SENDGRID_API_KEY && FROM_EMAIL);
}

/**
 * Send password reset email.
 * @param {string} to - Recipient email
 * @param {string} resetLink - Full URL to reset password page with token
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail(to, resetLink) {
  if (!isConfigured()) {
    console.warn('[email] SendGrid not configured; skipping password reset email to', to);
    return;
  }

  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(SENDGRID_API_KEY);

    const msg = {
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      replyTo: REPLY_TO || undefined,
      subject: 'Reset your password',
      text: `You requested a password reset. Open this link to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetLink}">Click here to set a new password</a> (link valid for 1 hour).</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `.trim(),
    };

    console.log('[email] Sending password reset to', to, 'from', FROM_EMAIL);
    await sgMail.send(msg);
    console.log('[email] Password reset email sent successfully to', to);
  } catch (err) {
    console.error('[email] SendGrid error:', err.message);
    if (err.response) {
      console.error('[email] SendGrid status:', err.response.statusCode);
      console.error('[email] SendGrid body:', err.response.body ? JSON.stringify(err.response.body, null, 2) : 'none');
    }
    throw err;
  }
}

module.exports = {
  isConfigured,
  sendPasswordResetEmail,
};
