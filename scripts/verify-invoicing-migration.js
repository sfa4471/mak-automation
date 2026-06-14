'use strict';
require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
const { Client } = require('pg');

async function main() {
  const url = process.env.SUPABASE_URL;
  const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)[1];
  const pw  = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
  const connStr = `postgresql://postgres.${ref}:${pw}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const checks = [
    { type: 'table',  name: 'rate_sets' },
    { type: 'table',  name: 'workorders' },
    { type: 'table',  name: 'dispatches' },
    { type: 'table',  name: 'invoices' },
    { type: 'table',  name: 'invoice_lines' },
    { type: 'column', name: 'tasks.dispatch_id' },
    { type: 'column', name: 'projects.billing_cadence' },
    { type: 'column', name: 'projects.taxable' },
    { type: 'column', name: 'workorders.billing_status' },
    { type: 'column', name: 'invoices.idempotency_key' },
  ];

  for (const chk of checks) {
    let exists;
    if (chk.type === 'table') {
      const r = await client.query(
        'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=$1 AND table_name=$2)',
        ['public', chk.name]
      );
      exists = r.rows[0].exists;
    } else {
      const [tbl, col] = chk.name.split('.');
      const r = await client.query(
        'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2)',
        [tbl, col]
      );
      exists = r.rows[0].exists;
    }
    console.log(`  ${exists ? '✅' : '❌'} ${chk.name}`);
  }

  await client.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
