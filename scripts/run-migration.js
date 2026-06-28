'use strict';
// Usage: node scripts/run-migration.js <path-to-migration.sql>
// Reads DB credentials from .env.local (SUPABASE_URL + SUPABASE_DB_PASSWORD)
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const migrationFile = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <path-to-migration.sql>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const urlMatch = supabaseUrl && supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
if (!urlMatch || !dbPassword) {
  console.error('Missing SUPABASE_URL or SUPABASE_DB_PASSWORD in .env.local');
  process.exit(1);
}
const projectRef = urlMatch[1];
const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword.replace(/^"|"$/g, ''))}@db.${projectRef}.supabase.co:5432/postgres`;

async function run() {
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const sql = fs.readFileSync(migrationFile, 'utf8');
    console.log('Running:', migrationFile);
    console.log(sql);
    await pool.query(sql);
    console.log('Migration applied successfully.');
  } finally {
    await pool.end();
  }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
