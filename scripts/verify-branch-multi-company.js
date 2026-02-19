/**
 * Step 1: Branch multi-company readiness verification
 *
 * Run with .env.local pointing at the BRANCH DB (uklvgcrzhhtpqtiwrbfw).
 * Usage: node scripts/verify-branch-multi-company.js
 *
 * See BRANCH_MULTI_COMPANY_VERIFICATION.md for the full checklist.
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });

const { supabase, validateConfiguration } = require('../server/db/supabase');

const BRANCH_REF = 'uklvgcrzhhtpqtiwrbfw';

const tenantScopedTables = [
  'users',
  'projects',
  'workpackages',
  'tasks',
  'wp1_data',
  'proctor_data',
  'density_reports',
  'rebar_reports',
  'notifications',
  'task_history',
  'app_settings',
];

const optionalTables = ['password_reset_tokens'];

function ok(msg) {
  console.log('  \u2713', msg);
}

function fail(msg) {
  console.log('  \u2717', msg);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

async function checkTableExists(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) return { exists: false, error: error.message };
  return { exists: true };
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function countNullTenantId(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).is('tenant_id', null);
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function main() {
  section('Step 1: Branch multi-company readiness');

  const url = process.env.SUPABASE_URL || '';
  const isBranch = url.includes(BRANCH_REF);
  if (!isBranch) {
    console.log('\n  \u2717 SUPABASE_URL is not the branch project.');
    console.log('     Current: ' + (url || '(not set)'));
    console.log('     Expected branch ref: ' + BRANCH_REF);
    console.log('     Ensure .env.local exists with branch credentials and run this script again.');
    process.exit(1);
  }
  ok('Using branch DB: ' + url);

  const validation = validateConfiguration(true);
  if (!validation.isValid) {
    console.error('Supabase configuration invalid. Fix .env.local and retry.');
    process.exit(1);
  }

  let allPassed = true;

  // --- 1. Schema: Multi-tenancy tables ---
  section('1. Schema: Multi-tenancy tables');

  const { exists: tenantsExists, error: tenantsErr } = await checkTableExists('tenants');
  if (!tenantsExists) {
    fail('tenants table missing or inaccessible: ' + (tenantsErr || 'unknown'));
    allPassed = false;
  } else {
    ok('tenants table exists');
  }

  const { exists: countersExists, error: countersErr } = await checkTableExists('tenant_project_counters');
  if (!countersExists) {
    fail('tenant_project_counters table missing or inaccessible: ' + (countersErr || 'unknown'));
    allPassed = false;
  } else {
    ok('tenant_project_counters table exists');
  }

  for (const table of tenantScopedTables) {
    const { exists, error } = await checkTableExists(table);
    if (!exists) {
      fail(table + ': missing or error - ' + (error || 'unknown'));
      allPassed = false;
    } else {
      const { count: nulls } = await countNullTenantId(table);
      if (nulls !== null && nulls > 0) {
        fail(table + ': has ' + nulls + ' row(s) with NULL tenant_id (should be 0)');
        allPassed = false;
      } else {
        ok(table + ' exists and tenant_id is NOT NULL (or table empty)');
      }
    }
  }

  for (const table of optionalTables) {
    const { exists } = await checkTableExists(table);
    if (exists) ok(table + ' (optional) exists');
    else console.log('  - ' + table + ' (optional) not present - ok');
  }

  // --- 2. Default tenant and data ---
  section('2. Default tenant and data');

  const { data: tenantRows, error: tenantSelectErr } = await supabase.from('tenants').select('id, name, is_active').eq('id', 1);
  if (tenantSelectErr || !tenantRows || tenantRows.length === 0) {
    fail('Default tenant (id=1) not found: ' + (tenantSelectErr?.message || 'no row'));
    allPassed = false;
  } else {
    const t = tenantRows[0];
    ok('Default tenant id=1: name="' + (t.name || '') + '", is_active=' + t.is_active);
    if (!t.is_active) {
      fail('Default tenant should be active (is_active = true)');
      allPassed = false;
    }
  }

  const { data: counterRows, error: counterErr } = await supabase.from('tenant_project_counters').select('tenant_id, year, next_seq');
  if (!counterErr && counterRows && counterRows.length > 0) {
    ok('tenant_project_counters has ' + counterRows.length + ' row(s) for tenant 1 (or more)');
  } else if (counterRows && counterRows.length === 0) {
    console.log('  - tenant_project_counters is empty (ok if no projects yet)');
  } else {
    fail('Could not read tenant_project_counters: ' + (counterErr?.message || ''));
    allPassed = false;
  }

  // --- 3. Row counts summary ---
  section('3. Row counts (branch)');

  const tablesToCount = ['tenants', 'tenant_project_counters', ...tenantScopedTables];
  for (const table of tablesToCount) {
    const { exists } = await checkTableExists(table);
    if (!exists) continue;
    const { count, error } = await countRows(table);
    if (error) {
      console.log('  ' + table + ': error - ' + error);
      continue;
    }
    console.log('  ' + table + ': ' + count + ' row(s)');
  }

  // --- 4. Optional: tenants columns from later migrations ---
  section('4. Optional: later migration columns on tenants');

  const { data: oneTenant, error: oneTenantErr } = await supabase.from('tenants').select('*').limit(1).single();
  if (!oneTenantErr && oneTenant) {
    const hasApiBaseUrl = 'api_base_url' in oneTenant;
    const hasPeLicenseHolder = 'pe_license_holder' in oneTenant;
    const hasCompanyContactName = 'company_contact_name' in oneTenant;
    if (hasApiBaseUrl) ok('tenants.api_base_url present');
    else console.log('  - tenants.api_base_url not present (run 20250211000000 if needed)');
    if (hasPeLicenseHolder) ok('tenants.pe_license_holder present');
    else console.log('  - tenants.pe_license_holder not present (run 20250217000000 if needed)');
    if (hasCompanyContactName) ok('tenants.company_contact_name present');
    else console.log('  - tenants.company_contact_name not present (run 20250217100000 if needed)');
  }

  // --- Result ---
  section('Result');

  if (allPassed) {
    console.log('\n  All required checks PASSED. Branch is ready for multiple companies.');
    console.log('  You can proceed to Step 2 in BRANCH_TO_MAIN_MIGRATION_PLAN.md (Main DB schema + data migration).\n');
    process.exit(0);
  } else {
    console.log('\n  Some checks FAILED. Fix the branch DB (run missing migrations, backfill tenant_id, etc.)');
    console.log('  then run this script again. See BRANCH_MULTI_COMPANY_VERIFICATION.md for details.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nScript error:', err.message);
  process.exit(1);
});
