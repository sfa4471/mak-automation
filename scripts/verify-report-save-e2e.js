/**
 * API smoke + cross-role read check for technician report saves.
 * Uses Supabase service role to pick real tasks/users, mints JWT like /api/auth/login,
 * then GET → POST (marker field) → GET as technician and GET as admin.
 *
 * Usage (from repo root, dev server on PORT default 5000):
 *   node scripts/verify-report-save-e2e.js
 *
 * Must use the same Supabase project as the API (see server startup: "Using Supabase:").
 * If the server loads `.env.local` because USE_BRANCH_DB=1, that flag must be set when
 * you run this script too (e.g. put USE_BRANCH_DB=1 in `.env`, or:
 *   PowerShell: $env:USE_BRANCH_DB='1'; node scripts/verify-report-save-e2e.js
 *
 * Env:
 *   E2E_API_BASE — default http://127.0.0.1:5000
 *   JWT_SECRET — must match server (default same as auth middleware)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
// Match server/index.js: branch credentials only when USE_BRANCH_DB is set.
const useBranchDb = process.env.USE_BRANCH_DB === '1' || process.env.USE_BRANCH_DB === 'true';
if (useBranchDb) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });
}

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET || 'mak-lonestar-secret-key-change-in-production';
const API_BASE = (process.env.E2E_API_BASE || 'http://127.0.0.1:5000').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TASK_TYPES = {
  DENSITY: 'DENSITY_MEASUREMENT',
  REBAR: 'REBAR',
  WP1: 'COMPRESSIVE_STRENGTH',
};

async function httpJson(method, url, token, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${url} → ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function buildLoginLikeToken(supabase, userId) {
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email, role, name, tenant_id')
    .eq('id', userId)
    .single();
  if (uErr || !user) throw new Error(`User ${userId}: ${uErr?.message || 'not found'}`);

  let tenantId = user.tenant_id;
  if (tenantId == null) tenantId = 1;

  let tenant = null;
  const { data: tRow } = await supabase.from('tenants').select('id, name, subdomain, api_base_url, is_active').eq('id', tenantId).maybeSingle();
  tenant = tRow;
  const tenantName = tenant?.name || 'Default';
  const tenantSubdomain = tenant?.subdomain ?? null;
  const tenantApiBaseUrl = tenant?.api_base_url ?? null;
  const isLegacyDb = tenant == null;

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: Number(tenantId),
      tenantName,
      tenantSubdomain,
      tenantApiBaseUrl,
      legacyDb: isLegacyDb,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function pickTask(supabase, taskType) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, tenant_id, assigned_technician_id, task_type, status')
    .eq('task_type', taskType)
    .not('assigned_technician_id', 'is', null)
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function adminTokenForTenant(supabase, tenantId) {
  if (tenantId == null) return null;
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .eq('tenant_id', tenantId)
    .limit(1);
  if (!admins?.[0]?.id) return null;
  return buildLoginLikeToken(supabase, admins[0].id);
}

async function runDensity(supabase, marker) {
  const task = await pickTask(supabase, TASK_TYPES.DENSITY);
  if (!task) return { skipped: true, reason: 'No DENSITY_MEASUREMENT task with assigned technician' };

  const techToken = await buildLoginLikeToken(supabase, task.assigned_technician_id);
  const adminToken = await adminTokenForTenant(supabase, task.tenant_id);
  const tid = task.id;
  const urlGet = `${API_BASE}/api/density/task/${tid}`;
  const urlPost = `${API_BASE}/api/density/task/${tid}`;

  const before = await httpJson('GET', urlGet, techToken);
  const payload = { ...before, remarks: marker };
  delete payload.id;
  delete payload.updatedAt;
  delete payload.lastEditedByRole;
  delete payload.lastEditedByName;
  delete payload.lastEditedByUserId;
  await httpJson('POST', urlPost, techToken, payload);

  const afterTech = await httpJson('GET', urlGet, techToken);
  const afterAdmin = adminToken ? await httpJson('GET', urlGet, adminToken) : null;

  const ok = afterTech.remarks === marker && (!afterAdmin || afterAdmin.remarks === marker);
  return {
    taskId: tid,
    ok,
    technicianRemarks: afterTech.remarks,
    adminRemarks: afterAdmin?.remarks ?? null,
  };
}

async function runRebar(supabase, marker) {
  const task = await pickTask(supabase, TASK_TYPES.REBAR);
  if (!task) return { skipped: true, reason: 'No REBAR task with assigned technician' };

  const techToken = await buildLoginLikeToken(supabase, task.assigned_technician_id);
  const adminToken = await adminTokenForTenant(supabase, task.tenant_id);
  const tid = task.id;
  const urlGet = `${API_BASE}/api/rebar/task/${tid}`;
  const urlPost = `${API_BASE}/api/rebar/task/${tid}`;

  const before = await httpJson('GET', urlGet, techToken);
  const payload = { ...before, resultRemarks: marker };
  delete payload.id;
  delete payload.updatedAt;
  await httpJson('POST', urlPost, techToken, payload);

  const afterTech = await httpJson('GET', urlGet, techToken);
  const afterAdmin = adminToken ? await httpJson('GET', urlGet, adminToken) : null;

  const ok = afterTech.resultRemarks === marker && (!afterAdmin || afterAdmin.resultRemarks === marker);
  return {
    taskId: tid,
    ok,
    technicianResultRemarks: afterTech.resultRemarks,
    adminResultRemarks: afterAdmin?.resultRemarks ?? null,
  };
}

async function runWp1(supabase, marker) {
  const task = await pickTask(supabase, TASK_TYPES.WP1);
  if (!task) return { skipped: true, reason: 'No COMPRESSIVE_STRENGTH task with assigned technician' };

  const techToken = await buildLoginLikeToken(supabase, task.assigned_technician_id);
  const adminToken = await adminTokenForTenant(supabase, task.tenant_id);
  const tid = task.id;
  const urlGet = `${API_BASE}/api/wp1/task/${tid}`;
  const urlPost = `${API_BASE}/api/wp1/task/${tid}`;

  const before = await httpJson('GET', urlGet, techToken);
  const payload = { ...before, remarks: marker };
  delete payload.id;
  delete payload.updatedAt;
  delete payload.lastEditedByRole;
  delete payload.lastEditedByName;
  delete payload.lastEditedByUserId;
  delete payload.projectSpecs;
  delete payload.soilSpecs;
  await httpJson('POST', urlPost, techToken, payload);

  const afterTech = await httpJson('GET', urlGet, techToken);
  const afterAdmin = adminToken ? await httpJson('GET', urlGet, adminToken) : null;

  const ok = afterTech.remarks === marker && (!afterAdmin || afterAdmin.remarks === marker);
  return {
    taskId: tid,
    ok,
    technicianRemarks: afterTech.remarks,
    adminRemarks: afterAdmin?.remarks ?? null,
  };
}

async function main() {
  console.log('Report save E2E (API smoke)\n');
  console.log('API_BASE:', API_BASE);
  const localPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(localPath) && !useBranchDb) {
    console.warn(
      'Note: .env.local exists but USE_BRANCH_DB is not 1/true. If `npm run dev` uses the branch DB, set USE_BRANCH_DB=1 so this script queries the same Supabase as the API.\n'
    );
  }
  if (SUPABASE_URL) {
    try {
      console.log('E2E task discovery DB host:', new URL(SUPABASE_URL).hostname);
    } catch (_) {
      console.log('E2E task discovery SUPABASE_URL: (invalid URL)');
    }
  }

  const health = await fetch(`${API_BASE}/health`);
  if (!health.ok) {
    console.error('Server not reachable at', API_BASE, '(GET /health failed). Start npm run dev.');
    process.exit(1);
  }
  console.log('Health: OK\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for this script.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const densityTask = await pickTask(supabase, TASK_TYPES.DENSITY);
  const rebarTask = await pickTask(supabase, TASK_TYPES.REBAR);
  const wp1Task = await pickTask(supabase, TASK_TYPES.WP1);

  if (!densityTask && !rebarTask && !wp1Task) {
    console.error('No tasks with assigned technicians found for density/rebar/wp1.');
    process.exit(1);
  }

  const marker = `E2E_VERIFY_${Date.now()}`;
  console.log('Admin cross-read: per-task tenant (skipped if no admin in that tenant)');
  console.log('Marker:', marker, '\n');

  const results = {
    density: await runDensity(supabase, marker),
    rebar: await runRebar(supabase, marker),
    wp1: await runWp1(supabase, marker),
  };

  let exitCode = 0;
  for (const [name, r] of Object.entries(results)) {
    console.log(`--- ${name.toUpperCase()} ---`);
    if (r.skipped) {
      console.log('SKIPPED:', r.reason);
      continue;
    }
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) exitCode = 1;
  }

  if (exitCode === 0) {
    console.log('\nAll executed checks passed (marker persisted; admin read matches when available).');
    console.log('Note: Debounce race is client-side; validate in UI by typing then immediate Send to Admin.');
  } else {
    console.error('\nOne or more checks failed.');
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
