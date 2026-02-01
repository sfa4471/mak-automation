/**
 * Environment Check and Migration Runner
 * 
 * This script checks the environment and provides guidance for running migrations
 */

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

console.log('\n🔍 Checking Environment Configuration...\n');
console.log('='.repeat(70));

let hasConnection = false;

// Check DATABASE_URL
if (DATABASE_URL && !DATABASE_URL.includes('[PASSWORD]')) {
  console.log('✅ DATABASE_URL is set');
  hasConnection = true;
} else if (DATABASE_URL) {
  console.log('⚠️  DATABASE_URL is set but contains [PASSWORD] placeholder');
} else {
  console.log('❌ DATABASE_URL is not set');
}

// Check SUPABASE_DB_PASSWORD
if (SUPABASE_DB_PASSWORD) {
  console.log('✅ SUPABASE_DB_PASSWORD is set');
  if (SUPABASE_URL) {
    hasConnection = true;
  }
} else {
  console.log('❌ SUPABASE_DB_PASSWORD is not set');
}

// Check SUPABASE_URL
if (SUPABASE_URL) {
  console.log(`✅ SUPABASE_URL is set: ${SUPABASE_URL.replace(/\/$/, '')}`);
} else {
  console.log('❌ SUPABASE_URL is not set');
}

// Check SUPABASE_SERVICE_ROLE_KEY
if (SUPABASE_SERVICE_ROLE_KEY) {
  console.log('✅ SUPABASE_SERVICE_ROLE_KEY is set');
} else {
  console.log('❌ SUPABASE_SERVICE_ROLE_KEY is not set');
}

console.log('\n' + '='.repeat(70));

if (hasConnection) {
  console.log('\n✅ Environment is configured. Running migration...\n');
  require('./execute-and-verify-migration.js');
} else {
  console.log('\n❌ Cannot run migration - missing database connection information\n');
  console.log('📋 To run the migration, you need one of the following:\n');
  
  console.log('Option 1: Set DATABASE_URL (Recommended)');
  console.log('  Get it from: Supabase Dashboard → Settings → Database → Connection string');
  console.log('  Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres');
  console.log('  Add to .env: DATABASE_URL=postgresql://...\n');
  
  console.log('Option 2: Set SUPABASE_DB_PASSWORD');
  console.log('  Get it from: Supabase Dashboard → Settings → Database → Database password');
  console.log('  Add to .env: SUPABASE_DB_PASSWORD=your-password');
  console.log('  (Also requires SUPABASE_URL to be set)\n');
  
  console.log('💡 Quick Setup:');
  console.log('  1. Go to https://supabase.com/dashboard');
  console.log('  2. Select your project');
  console.log('  3. Go to Settings → Database');
  console.log('  4. Copy the "Connection string" (URI format)');
  console.log('  5. Add to .env: DATABASE_URL=<connection-string>\n');
  
  console.log('After setting up, run: npm run supabase:execute-and-verify\n');
  
  process.exit(1);
}
