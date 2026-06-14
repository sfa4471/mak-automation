'use strict';
/**
 * Run the invoicing migration (20260613000000_add_invoicing.sql)
 * against the database configured by the environment variables loaded.
 *
 * Usage:
 *   Branch DB : node scripts/run-invoicing-migration.js          (loads .env.local via USE_BRANCH_DB=1)
 *   Main DB   : node scripts/run-invoicing-migration.js --main   (loads .env only)
 */

const useMain = process.argv.includes('--main');

// Load env vars
require('dotenv').config();
if (!useMain) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
}

const fs   = require('fs');
const path = require('path');

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260613000000_add_invoicing.sql');

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const dbPassword  = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL not set');
    process.exit(1);
  }

  const refMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!refMatch) {
    console.error('❌ Could not parse project ref from SUPABASE_URL:', supabaseUrl);
    process.exit(1);
  }

  const ref = refMatch[1];
  console.log(`\n🎯 Target: ${useMain ? 'MAIN' : 'BRANCH'} DB — ref: ${ref}`);
  console.log(`📄 Migration: ${MIGRATION_FILE}\n`);

  if (!dbPassword) {
    console.error('❌ SUPABASE_DB_PASSWORD not set in env file');
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

  // Try multiple connection string formats (pooler preferred, direct fallback)
  // Special chars in password must be percent-encoded
  const encodedPassword = encodeURIComponent(dbPassword);
  const candidates = [
    `postgresql://postgres.${ref}:${encodedPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodedPassword}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodedPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodedPassword}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodedPassword}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${encodedPassword}@db.${ref}.supabase.co:5432/postgres`,
  ];

  let { Client } = require('pg');
  let client;
  let connected = false;

  for (const connStr of candidates) {
    const masked = connStr.replace(encodedPassword, '***');
    process.stdout.write(`  Trying ${masked} … `);
    client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      console.log('✅ connected');
      connected = true;
      break;
    } catch (err) {
      console.log(`❌ ${err.message.split('\n')[0]}`);
      try { await client.end(); } catch (_) {}
    }
  }

  if (!connected) {
    console.error('\n❌ Could not connect to Supabase with any pooler endpoint.');
    console.error('   Run the SQL manually via the Supabase Dashboard → SQL Editor.');
    process.exit(1);
  }

  console.log('\n🔄 Running migration…\n');

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migration committed successfully.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    if (err.detail)  console.error('   Detail:', err.detail);
    if (err.hint)    console.error('   Hint:',   err.hint);
    await client.end();
    process.exit(1);
  }

  await client.end();

  // Quick verification
  console.log('🔍 Verifying new tables…\n');
  const verifyClient = new Client({ connectionString: candidates.find(Boolean), ssl: { rejectUnauthorized: false } });
  // use same conn that worked
  const verifyConn = client.connectionParameters?.connectionString || candidates[0];
  const vc = new Client({ connectionString: verifyConn, ssl: { rejectUnauthorized: false } });
  try {
    await vc.connect();
    const tables = ['rate_sets', 'workorders', 'dispatches', 'invoices', 'invoice_lines'];
    for (const t of tables) {
      const { rows } = await vc.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
        [t]
      );
      console.log(`  ${rows[0].exists ? '✅' : '❌'} ${t}`);
    }
    // Check dispatch_id column on tasks
    const { rows: colRows } = await vc.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'dispatch_id')`,
    );
    console.log(`  ${colRows[0].exists ? '✅' : '❌'} tasks.dispatch_id`);
    await vc.end();
  } catch (_) {}

  console.log('\n🎉 Done. Migration applied to', useMain ? 'MAIN DB' : 'BRANCH DB');
  console.log('   To apply to MAIN DB, run: node scripts/run-invoicing-migration.js --main\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
