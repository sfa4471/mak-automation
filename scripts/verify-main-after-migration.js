/**
 * Post-migration: Verify main database row counts and spot-checks.
 * Uses MAIN credentials from .env only (do not load .env.local so we hit main).
 *
 * Usage: node scripts/verify-main-after-migration.js
 * (Ensure .env has main SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const MAIN_REF = 'hyjuxclsksbyaimvzulq';
const tables = [
  'tenants', 'tenant_project_counters', 'users', 'projects', 'workpackages',
  'tasks', 'wp1_data', 'proctor_data', 'density_reports', 'rebar_reports',
  'notifications', 'task_history', 'app_settings', 'password_reset_tokens',
];

async function count(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env (use main credentials).');
    process.exit(1);
  }
  if (!url.includes(MAIN_REF)) {
    console.log('Expected main project in .env. Current URL:', url);
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('\n=== Main DB row counts ===');
  console.log('URL:', url);
  console.log('');
  for (const table of tables) {
    const { count: c, error } = await count(supabase, table);
    if (error) {
      console.log('  ' + table + ': (error) ' + error);
      continue;
    }
    console.log('  ' + table + ': ' + c + ' row(s)');
  }

  console.log('\n=== Spot-check (tenant 1) ===');
  const { data: tenant } = await supabase.from('tenants').select('id, name, is_active').eq('id', 1).single();
  if (tenant) console.log('  Tenant 1:', tenant.name, '| is_active:', tenant.is_active);
  else console.log('  Tenant 1: not found');
  const { data: usersSample } = await supabase.from('users').select('id, email, tenant_id').eq('tenant_id', 1).limit(3);
  if (usersSample?.length) console.log('  Users (tenant 1) sample:', usersSample.map(u => u.email).join(', '));
  else console.log('  Users (tenant 1): none');

  console.log('\n=== Next steps ===');
  console.log('  1. Compare counts to branch (run same counts on branch or see dry-run output).');
  console.log('  2. Create admin on main: remove/rename .env.local, then run:');
  console.log('     node scripts/create-admin-user.js admin@maklonestar.com <password> 1');
  console.log('  3. Switch app to main: keep .env.local removed, restart server (npm run dev).');
  console.log('  4. Test login and key flows on main.');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
