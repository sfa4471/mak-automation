/**
 * Run the density_reports multi-specs migration (Phase 2).
 * Adds dens_specs and moist_specs JSONB columns and backfills from legacy.
 *
 * Usage: node scripts/run-density-multi-specs-migration.js
 * Requires: .env with SUPABASE_URL and either DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_DB_PASSWORD for direct pg)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or DATABASE_URL in .env');
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) throw new Error('Invalid SUPABASE_URL format');
  const projectRef = urlMatch[1];
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.error('For direct SQL migration set one of these in .env:');
    console.error('  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres');
    console.error('  or SUPABASE_DB_PASSWORD=your-database-password');
    console.error('Get the connection string or password from: Supabase Dashboard → Settings → Database');
    console.error('\nAlternatively, run the SQL manually in Supabase Dashboard → SQL Editor:');
    console.error('  File: supabase/migrations/20250219000000_density_multi_specs.sql');
    process.exit(1);
  }
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function main() {
  const migrationFile = path.join(__dirname, '../supabase/migrations/20250219000000_density_multi_specs.sql');
  if (!fs.existsSync(migrationFile)) {
    console.error('Migration file not found:', migrationFile);
    process.exit(1);
  }
  const sql = fs.readFileSync(migrationFile, 'utf8');
  let pool;
  try {
    const databaseUrl = getDatabaseUrl();
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    console.log('Running density multi-specs migration...');
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
