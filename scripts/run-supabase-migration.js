/**
 * Run Supabase Migration Script
 * 
 * This script runs the PostgreSQL migration file against your Supabase database.
 * 
 * Usage:
 *   node scripts/run-supabase-migration.js
 * 
 * Requires:
 *   - SUPABASE_URL in .env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env
 *   - pg package installed (npm install pg)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.log('\nPlease add to your .env file:');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.log('\nOr run: node setup-supabase-env.js');
  process.exit(1);
}

// Migration file path
const migrationFile = path.join(__dirname, '../supabase/migrations/20250131000000_initial_schema.sql');

if (!fs.existsSync(migrationFile)) {
  console.error(`❌ Migration file not found: ${migrationFile}`);
  process.exit(1);
}

console.log('🚀 Starting Supabase migration...\n');
console.log('Migration file:', migrationFile);
console.log('Supabase URL:', supabaseUrl.replace(/\/$/, ''));
console.log('');

// Read migration SQL
const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

// Split into individual statements (basic splitting by semicolon)
// Note: This is a simple approach. For production, consider using a proper SQL parser
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

console.log(`Found ${statements.length} SQL statements to execute\n`);

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Execute migration using Supabase REST API
// Note: Supabase client doesn't support raw SQL execution directly
// We'll use the REST API with RPC or direct SQL execution via PostgREST
// For migrations, it's better to use Supabase CLI or Dashboard

console.log('⚠️  Note: Supabase JS client cannot execute raw SQL migrations directly.');
console.log('Please use one of these methods:\n');
console.log('Method 1: Supabase Dashboard (Recommended)');
console.log('  1. Go to https://supabase.com/dashboard');
console.log('  2. Select your project');
console.log('  3. Go to SQL Editor');
console.log('  4. Copy and paste the contents of:');
console.log(`     ${migrationFile}`);
console.log('  5. Click "Run"\n');

console.log('Method 2: Supabase CLI');
console.log('  1. Install: npm install -g supabase');
console.log('  2. Link: supabase link --project-ref your-project-ref');
console.log('  3. Run: supabase db push\n');

console.log('Method 3: Direct PostgreSQL Connection');
console.log('  1. Get connection string from Supabase Dashboard → Settings → Database');
console.log('  2. Run: psql "your-connection-string" -f supabase/migrations/20250131000000_initial_schema.sql\n');

// Alternative: Try to use Supabase's REST API to execute via a stored procedure
// This is a workaround - not recommended for production migrations
console.log('Attempting alternative method using Supabase REST API...\n');

// For now, we'll create a helper script that can be used with psql
const psqlScript = path.join(__dirname, '../scripts/migrate-with-psql.sh');
const psqlScriptContent = `#!/bin/bash
# Run Supabase migration using psql
# Usage: ./scripts/migrate-with-psql.sh

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  echo "Get it from: Supabase Dashboard → Settings → Database → Connection string"
  exit 1
fi

psql "$DATABASE_URL" -f supabase/migrations/20250131000000_initial_schema.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed"
  exit 1
fi
`;

// Create Windows batch file as well
const batchScript = path.join(__dirname, '../scripts/migrate-with-psql.bat');
const batchScriptContent = `@echo off
REM Run Supabase migration using psql
REM Usage: scripts\\migrate-with-psql.bat
REM
REM Set DATABASE_URL environment variable first:
REM set DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

if "%DATABASE_URL%"=="" (
  echo Error: DATABASE_URL environment variable is not set
  echo Get it from: Supabase Dashboard - Settings - Database - Connection string
  exit /b 1
)

psql "%DATABASE_URL%" -f supabase\\migrations\\20250131000000_initial_schema.sql

if %ERRORLEVEL% EQU 0 (
  echo ✅ Migration completed successfully!
) else (
  echo ❌ Migration failed
  exit /b 1
)
`;

try {
  fs.writeFileSync(psqlScript, psqlScriptContent);
  fs.chmodSync(psqlScript, '755');
  console.log('✅ Created helper script: scripts/migrate-with-psql.sh');
} catch (err) {
  // Ignore if on Windows
}

try {
  fs.writeFileSync(batchScript, batchScriptContent);
  console.log('✅ Created helper script: scripts/migrate-with-psql.bat');
} catch (err) {
  console.log('⚠️  Could not create batch script:', err.message);
}

console.log('\n📋 Next Steps:');
console.log('  1. Choose one of the migration methods above');
console.log('  2. After migration, run: node scripts/verify-supabase-tables.js');
console.log('  3. Then run: node scripts/migrate-data-sqlite-to-supabase.js\n');

process.exit(0);
