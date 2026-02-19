/**
 * Step 2a: Apply all migrations to the MAIN Supabase database.
 *
 * Requires MAIN_SUPABASE_DB_URL in .env (main project's Postgres connection string).
 * Get it from: Supabase Dashboard → Main project → Settings → Database → Connection string (URI).
 *
 * Usage: node scripts/apply-migrations-to-main.js
 *
 * Runs the 10 migration files in supabase/migrations/ in timestamp order.
 * Load .env only (not .env.local) so MAIN_SUPABASE_DB_URL is for main.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const MIGRATION_ORDER = [
  '20250131000000_initial_schema.sql',
  '20250201000000_add_app_settings.sql',
  '20250202000000_add_proctor_correction_factor.sql',
  '20250210000000_add_multi_tenancy.sql',
  '20250211000000_add_tenant_api_base_url.sql',
  '20250216000000_add_project_customer_details.sql',
  '20250216100000_add_password_reset_tokens.sql',
  '20250217000000_add_tenant_pe_and_license_holder.sql',
  '20250217100000_add_tenant_company_contact_name.sql',
  '20250218000000_add_project_drawings.sql',
];

function log(msg) {
  console.log(msg);
}

async function main() {
  const dbUrl = process.env.MAIN_SUPABASE_DB_URL;
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    log('');
    log('MAIN_SUPABASE_DB_URL is not set or invalid in .env');
    log('');
    log('To run migrations on main from this script:');
    log('  1. Open Supabase Dashboard → your MAIN project (hyjuxclsksbyaimvzulq)');
    log('  2. Settings → Database');
    log('  3. Copy "Connection string" → URI (include your database password)');
    log('  4. Add to .env:');
    log('     MAIN_SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres');
    log('');
    log('Alternatively, apply migrations manually:');
    log('  Open Main project → SQL Editor, then run each file in supabase/migrations/ in this order:');
    MIGRATION_ORDER.forEach((f, i) => log('    ' + (i + 1) + '. ' + f));
    log('');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    log('Connected to MAIN database.\n');
  } catch (err) {
    log('Failed to connect to MAIN database: ' + err.message);
    process.exit(1);
  }

  for (let i = 0; i < MIGRATION_ORDER.length; i++) {
    const file = MIGRATION_ORDER[i];
    const filePath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) {
      log('Skip (file missing): ' + file);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    log('Running ' + (i + 1) + '/' + MIGRATION_ORDER.length + ' ' + file + ' ...');
    try {
      await client.query(sql);
      log('  OK');
    } catch (err) {
      log('  Error: ' + err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  log('');
  log('All migrations applied to MAIN. Next: run data migration (migrate-branch-to-main.js).');
  log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
