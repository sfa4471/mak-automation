'use strict';
/**
 * Run migration 20260613100000_add_billing_fields_to_tasks.sql
 * against the branch DB (uklvgcrzhhtpqtiwrbfw).
 *
 * Usage: node scripts/run-billing-fields-migration.js
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });

const fs   = require('fs');
const path = require('path');

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260613100000_add_billing_fields_to_tasks.sql');

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const dbPassword  = process.env.SUPABASE_DB_PASSWORD;

  if (!supabaseUrl || !dbPassword) {
    console.error('❌ SUPABASE_URL or SUPABASE_DB_PASSWORD not set');
    process.exit(1);
  }

  const ref = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) { console.error('❌ Cannot parse project ref'); process.exit(1); }

  console.log(`\n🎯 Branch DB — ref: ${ref}`);
  console.log(`📄 Migration: ${MIGRATION_FILE}\n`);

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const enc = encodeURIComponent(dbPassword);

  const candidates = [
    `postgresql://postgres.${ref}:${enc}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${enc}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${enc}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
  ];

  const { Client } = require('pg');
  let client, connStr;

  for (const cs of candidates) {
    process.stdout.write(`  Trying ${cs.replace(enc, '***')} … `);
    client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      console.log('✅ connected');
      connStr = cs;
      break;
    } catch (err) {
      console.log(`❌ ${err.message.split('\n')[0]}`);
      try { await client.end(); } catch (_) {}
      client = null;
    }
  }

  if (!client) {
    console.error('\n❌ All connections failed. Run the SQL via Supabase Dashboard → SQL Editor.');
    process.exit(1);
  }

  console.log('\n🔄 Running migration…');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Committed.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    if (err.detail) console.error('   Detail:', err.detail);
    await client.end();
    process.exit(1);
  }

  // Verify columns
  const checks = ['workorder_id', 'clock_in', 'clock_out', 'break_minutes', 'miles'];
  console.log('🔍 Verifying tasks columns…');
  for (const col of checks) {
    const { rows } = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name=$1)`,
      [col]
    );
    console.log(`  ${rows[0].exists ? '✅' : '❌'} tasks.${col}`);
  }

  await client.end();
  console.log('\n🎉 Done.\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
