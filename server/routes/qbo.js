'use strict';

const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const {
  makeOAuthClient,
  encodeOAuthState,
  decodeOAuthState,
  getConnection,
  saveConnection,
  deleteConnection,
  pushInvoiceToQbo,
} = require('../services/quickbooks');

const router = express.Router();
const adminAuth = [authenticate, requireTenant, requireAdmin];

// ---------------------------------------------------------------------------
// GET /api/qbo/status — is this tenant connected to QuickBooks?
// ---------------------------------------------------------------------------
router.get('/status', adminAuth, async (req, res) => {
  try {
    const conn = await getConnection(req.tenantId);
    if (!conn) return res.json({ connected: false });
    res.json({
      connected:   true,
      realmId:     conn.realm_id,
      connectedAt: conn.connected_at,
      tokenExpiry: conn.token_expiry,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/qbo/connect — return the Intuit OAuth URL for this tenant
// Frontend redirects the user there: window.location.href = url
// ---------------------------------------------------------------------------
router.get('/connect', adminAuth, (req, res) => {
  try {
    const OAuthClient = require('intuit-oauth');
    const client = makeOAuthClient();
    const state  = encodeOAuthState(req.tenantId);
    const url    = client.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state,
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Callback handler — shared between /api/qbo/callback and /quickbooks/callback
// Intuit redirects here after user authorises. No JWT available; tenant identity
// is recovered from the HMAC-signed state parameter.
// ---------------------------------------------------------------------------
async function callbackHandler(req, res) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  try {
    const { code, state, realmId, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`${appUrl}/admin/settings?qbo=error&reason=${encodeURIComponent(oauthError)}`);
    }
    if (!code || !state || !realmId) {
      return res.redirect(`${appUrl}/admin/settings?qbo=error&reason=missing_params`);
    }

    // Verify state and recover tenantId — throws on forgery or tampering
    const tenantId = decodeOAuthState(state);

    // Exchange the authorization code for tokens
    const client   = makeOAuthClient();
    // Build the full callback URL so intuit-oauth can parse the code param
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host     = req.headers['x-forwarded-host'] || req.get('host');
    const fullUrl  = `${protocol}://${host}${req.url}`;

    const authResponse = await client.createToken(fullUrl);
    const token        = authResponse.getJson();

    await saveConnection(tenantId, {
      realmId:      realmId,
      accessToken:  token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiry:  new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
    });

    res.redirect(`${appUrl}/admin/settings?qbo=connected`);
  } catch (err) {
    const appUrl2 = process.env.APP_URL || 'http://localhost:3000';
    console.error('[QBO callback error]', err.message);
    res.redirect(`${appUrl2}/admin/settings?qbo=error&reason=${encodeURIComponent(err.message)}`);
  }
}

router.get('/callback', callbackHandler);

// ---------------------------------------------------------------------------
// DELETE /api/qbo/disconnect — remove stored tokens for this tenant
// ---------------------------------------------------------------------------
router.delete('/disconnect', adminAuth, async (req, res) => {
  try {
    await deleteConnection(req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/qbo/invoices/:id/push — push an approved invoice to QBO
// ---------------------------------------------------------------------------
router.post('/invoices/:id/push', adminAuth, async (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (!invoiceId) return res.status(400).json({ error: 'Invalid invoice id' });

  try {
    const result = await pushInvoiceToQbo(req.tenantId, invoiceId);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404
      : err.message.includes('not connected')        ? 503
      : err.message.includes('Only approved')        ? 409
      : err.message.includes('already pushed')       ? 409
      : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
module.exports.callbackHandler = callbackHandler;
