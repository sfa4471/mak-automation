/**
 * Run dev_full_schema.sql on the database pointed to by .env.local (dev Supabase).
 * Use after creating a new Dev Supabase project and filling .env.local.
 *
 * Requires: SUPABASE_URL + SUPABASE_DB_PASSWORD in .env.local (or DATABASE_URL).
 * Get DB password: Supabase Dashboard → Settings → Database → Database password.
 *
 * Usage: node scripts/run-dev-full-schema.js
 *    or: npm run dev:run-schema
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or DATABASE_URL. Set them in .env.local (dev project).');
  }
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('Invalid SUPABASE_URL. Expected: https://[project-ref].supabase.co');
  }
  const projectRef = urlMatch[1];
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    throw new Error(
      'Missing SUPABASE_DB_PASSWORD. Get it from Supabase Dashboard → Settings → Database → Database password, then add to .env.local.'
    );
  }
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function main() {
  console.log('Dev schema runner — uses .env.local (dev Supabase)\n');

  let connectionString;
  try {
    connectionString = getDatabaseUrl();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '..', 'supabase', 'dev_full_schema.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('Not found:', sqlPath);
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to dev DB. Running dev_full_schema.sql ...');
    await client.query(sql);
    console.log('Done. Dev schema (base + multi-tenancy) applied.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
