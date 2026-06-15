'use strict';

const crypto = require('crypto');
const { supabase } = require('../db/supabase');

// ---------------------------------------------------------------------------
// Column-level AES-256-GCM encryption
// Key: QBO_TOKEN_ENCRYPTION_KEY — 64 hex chars (32 bytes)
// Ciphertext format: iv:authTag:ciphertext  (each hex-encoded, colon-separated)
// ---------------------------------------------------------------------------

function _key() {
  const hex = process.env.QBO_TOKEN_ENCRYPTION_KEY || '';
  if (hex.length < 64) {
    throw new Error(
      'QBO_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', _key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(ciphertext) {
  const parts = (ciphertext || '').split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const iv  = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const enc = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', _key(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// OAuth state — HMAC-signs tenantId so it can't be forged (CSRF protection)
// Uses JWT_SECRET — no extra env var needed
// ---------------------------------------------------------------------------

function encodeOAuthState(tenantId) {
  const sig = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'insecure-fallback')
    .update(String(tenantId))
    .digest('hex')
    .slice(0, 20);
  return Buffer.from(`${tenantId}:${sig}`).toString('base64url');
}

function decodeOAuthState(state) {
  let decoded;
  try {
    decoded = Buffer.from(state || '', 'base64url').toString('utf8');
  } catch {
    throw new Error('Malformed OAuth state parameter');
  }
  const [tenantIdStr, sig] = decoded.split(':');
  const tenantId = parseInt(tenantIdStr, 10);
  if (!tenantId || isNaN(tenantId)) throw new Error('Invalid state: missing tenantId');
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'insecure-fallback')
    .update(String(tenantId))
    .digest('hex')
    .slice(0, 20);
  if (sig !== expected) throw new Error('Invalid state signature — possible CSRF attempt');
  return tenantId;
}

// ---------------------------------------------------------------------------
// OAuth client factory
// ---------------------------------------------------------------------------

function makeOAuthClient() {
  const OAuthClient = require('intuit-oauth');
  return new OAuthClient({
    clientId:     process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    environment:  process.env.QBO_ENVIRONMENT || 'sandbox',
    redirectUri:  process.env.QBO_REDIRECT_URI,
  });
}

// ---------------------------------------------------------------------------
// Supabase helpers — always filter by tenant_id
// ---------------------------------------------------------------------------

async function getConnection(tenantId) {
  const { data } = await supabase
    .from('tenant_qbo_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data || null;
}

async function saveConnection(tenantId, { realmId, accessToken, refreshToken, tokenExpiry }) {
  const row = {
    realm_id:          realmId,
    access_token_enc:  encrypt(accessToken),
    refresh_token_enc: encrypt(refreshToken),
    token_expiry:      new Date(tokenExpiry).toISOString(),
    updated_at:        new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('tenant_qbo_connections')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existing) {
    await supabase.from('tenant_qbo_connections').update(row).eq('tenant_id', tenantId);
  } else {
    await supabase.from('tenant_qbo_connections').insert({ ...row, tenant_id: tenantId });
  }
}

async function deleteConnection(tenantId) {
  await supabase.from('tenant_qbo_connections').delete().eq('tenant_id', tenantId);
}

async function _cacheServiceItem(tenantId, serviceItemId) {
  await supabase
    .from('tenant_qbo_connections')
    .update({ service_item_id: serviceItemId, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
}

// ---------------------------------------------------------------------------
// QBO API helper — promisifies node-quickbooks callbacks and normalises errors
// ---------------------------------------------------------------------------

function qboCall(method, ...args) {
  return new Promise((resolve, reject) => {
    method(...args, (err, data) => {
      if (err) {
        const fault  = err?.Fault?.Error?.[0];
        const detail = fault?.Detail || fault?.Message || err?.message || String(err);
        reject(new Error(`QuickBooks API error: ${detail}`));
      } else {
        resolve(data);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// QBO client — auto-refreshes expired tokens
// ---------------------------------------------------------------------------

async function getValidClient(tenantId) {
  const QuickBooks = require('node-quickbooks');
  const conn = await getConnection(tenantId);
  if (!conn) {
    throw new Error(
      'QuickBooks is not connected for this tenant. ' +
      'Go to Settings → Connect QuickBooks.'
    );
  }

  let accessToken  = decrypt(conn.access_token_enc);
  let refreshToken = decrypt(conn.refresh_token_enc);
  let expiry       = new Date(conn.token_expiry);

  // Refresh proactively if within 5 minutes of expiry
  if (Date.now() > expiry.getTime() - 5 * 60 * 1000) {
    const client = makeOAuthClient();
    client.setToken({ access_token: accessToken, refresh_token: refreshToken });
    const refreshed  = await client.refresh();
    const newToken   = refreshed.getJson();
    accessToken      = newToken.access_token;
    if (newToken.refresh_token) refreshToken = newToken.refresh_token;
    expiry           = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);
    await saveConnection(tenantId, {
      realmId:      conn.realm_id,
      accessToken,
      refreshToken,
      tokenExpiry:  expiry.toISOString(),
    });
  }

  const isSandbox = (process.env.QBO_ENVIRONMENT || 'sandbox') !== 'production';
  const qbo = new QuickBooks(
    process.env.QBO_CLIENT_ID,
    process.env.QBO_CLIENT_SECRET,
    accessToken,
    false,          // tokenSecret — not used in OAuth 2.0
    conn.realm_id,
    isSandbox,
    false,          // debug
    null,           // minorversion (use latest)
    '2.0',          // oauthversion
    refreshToken,
  );

  return { qbo, conn };
}

// ---------------------------------------------------------------------------
// Find or create QBO Customer for a project
// ---------------------------------------------------------------------------

async function findOrCreateCustomer(qbo, project) {
  if (project.qbo_customer_id) return project.qbo_customer_id;

  const displayName = project.client_name || project.project_name || `Project ${project.id}`;

  const result = await qboCall(
    qbo.findCustomers.bind(qbo),
    [{ field: 'DisplayName', value: displayName, operator: '=' }],
  );
  const existing = result?.QueryResponse?.Customer;
  if (existing && existing.length > 0) {
    const customerId = existing[0].Id;
    await supabase.from('projects').update({ qbo_customer_id: customerId }).eq('id', project.id);
    return customerId;
  }

  const customer   = await qboCall(qbo.createCustomer.bind(qbo), { DisplayName: displayName });
  const customerId = customer.Id;
  await supabase.from('projects').update({ qbo_customer_id: customerId }).eq('id', project.id);
  return customerId;
}

// ---------------------------------------------------------------------------
// Find or create QBO Service Item for invoice lines
// Preference order: cached ID → "Geotechnical Services" → "Services" → create new
// ---------------------------------------------------------------------------

async function findOrCreateServiceItem(qbo, tenantId, conn) {
  if (conn.service_item_id) return conn.service_item_id;

  const findItems = qbo.findItems.bind(qbo);

  // Try our named item first
  const geoResult = await qboCall(findItems, [
    { field: 'Name', value: 'Geotechnical Services', operator: '=' },
  ]);
  const geoItems = geoResult?.QueryResponse?.Item;
  if (geoItems && geoItems.length > 0) {
    await _cacheServiceItem(tenantId, geoItems[0].Id);
    return geoItems[0].Id;
  }

  // Fallback to "Services" (common QBO default)
  const svcResult = await qboCall(findItems, [
    { field: 'Name', value: 'Services', operator: '=' },
  ]);
  const svcItems = svcResult?.QueryResponse?.Item;
  if (svcItems && svcItems.length > 0) {
    await _cacheServiceItem(tenantId, svcItems[0].Id);
    return svcItems[0].Id;
  }

  // Create a new service item using the first income account found
  const acctResult = await qboCall(qbo.findAccounts.bind(qbo), [
    { field: 'AccountType', value: 'Income', operator: '=' },
  ]);
  const accounts = acctResult?.QueryResponse?.Account;
  if (!accounts || accounts.length === 0) {
    throw new Error(
      'No income account found in QuickBooks. ' +
      'Please create an income account in QuickBooks before pushing invoices.'
    );
  }
  const incomeAccount = accounts[0];
  const newItem = await qboCall(qbo.createItem.bind(qbo), {
    Name: 'Geotechnical Services',
    Type: 'Service',
    IncomeAccountRef: { value: incomeAccount.Id, name: incomeAccount.Name },
  });
  await _cacheServiceItem(tenantId, newItem.Id);
  return newItem.Id;
}

// ---------------------------------------------------------------------------
// Source type labels (server-side mirror of client sourceTypeLabel)
// ---------------------------------------------------------------------------

function sourceTypeLabel(type) {
  const map = {
    cylinder:     'Cylinder Breaks',
    tech_time:    'Technician Time',
    tech_ot:      'Technician Overtime',
    trip:         'Trip Charge',
    proctor:      'Proctor Test',
    atterberg:    'Atterberg Limits (PI)',
    sieve200:     '#200 Sieve Wash',
    nuclear_day:  'Nuclear Gauge Day',
    density_test: 'Density Tests',
  };
  return map[type] || type;
}

// ---------------------------------------------------------------------------
// Main: push an approved invoice to QuickBooks
// ---------------------------------------------------------------------------

async function pushInvoiceToQbo(tenantId, invoiceId) {
  // Load invoice with lines (scoped to tenant)
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*, invoice_lines(*)')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();

  if (invErr || !invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'approved') {
    throw new Error('Only approved invoices can be pushed to QuickBooks.');
  }
  if (invoice.qbo_invoice_id) {
    throw new Error(
      `Invoice already pushed to QuickBooks (${invoice.qbo_invoice_number}).`
    );
  }

  // Load project (scoped to tenant)
  const { data: project } = await supabase
    .from('projects')
    .select('id, project_name, project_number, client_name, qbo_customer_id')
    .eq('id', invoice.project_id)
    .eq('tenant_id', tenantId)
    .single();

  if (!project) throw new Error('Project not found');

  // Load tenant name for the DocNumber prefix
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single();

  const { qbo, conn } = await getValidClient(tenantId);

  const [customerId, itemId] = await Promise.all([
    findOrCreateCustomer(qbo, project),
    findOrCreateServiceItem(qbo, tenantId, conn),
  ]);

  const lines = (invoice.invoice_lines || []).map(line => ({
    Amount:     line.amount_cents / 100,
    DetailType: 'SalesItemLineDetail',
    Description: line.description || sourceTypeLabel(line.source_type),
    SalesItemLineDetail: {
      ItemRef:    { value: itemId },
      Qty:        Number(line.qty),
      UnitPrice:  line.unit_rate_cents / 100,
    },
  }));

  if (lines.length === 0) {
    throw new Error('Invoice has no line items to push.');
  }

  // DocNumber format: COMPANYNAME-{id}  (uppercase, spaces removed, max 21 chars total)
  const companySlug = (tenant?.name || 'INV')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);
  const docNumber = `${companySlug}-${invoiceId}`;
  const txnDate   = (invoice.generated_at || new Date().toISOString()).slice(0, 10);

  const qboInvoice = await qboCall(qbo.createInvoice.bind(qbo), {
    DocNumber:    docNumber,
    TxnDate:      txnDate,
    CustomerRef:  { value: customerId },
    PrivateNote:  invoice.notes || `MakAutomation Invoice #${invoiceId}`,
    Line:         lines,
  });

  const qboInvoiceId     = qboInvoice.Id;
  const qboInvoiceNumber = qboInvoice.DocNumber || docNumber;

  await supabase.from('invoices').update({
    status:             'pushed',
    qbo_invoice_id:     qboInvoiceId,
    qbo_invoice_number: qboInvoiceNumber,
    pushed_at:          new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  }).eq('id', invoiceId).eq('tenant_id', tenantId);

  await supabase.from('workorders')
    .update({ billing_status: 'billed', updated_at: new Date().toISOString() })
    .eq('invoiced_on_invoice_id', invoiceId);

  return { qboInvoiceId, qboInvoiceNumber };
}

module.exports = {
  encrypt,
  decrypt,
  encodeOAuthState,
  decodeOAuthState,
  makeOAuthClient,
  getConnection,
  saveConnection,
  deleteConnection,
  getValidClient,
  pushInvoiceToQbo,
};
