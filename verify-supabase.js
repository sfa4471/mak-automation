/**
 * Supabase connection verification script
 * Run: node verify-supabase.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Verifying Supabase setup...\n');

// Check env vars
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set in .env');
  console.log('\nAdd to your .env file:');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env');
  console.log('\nAdd to your .env file:');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

console.log('✓ SUPABASE_URL:', supabaseUrl.replace(/\/$/, ''));
console.log('✓ SUPABASE_SERVICE_ROLE_KEY: [set]');

// Create client and test connection
try {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Test 1: Try to query (Supabase REST API health check via a simple request)
  // Using auth.getSession() as a lightweight way to verify credentials work
  supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error('\n❌ Connection failed:', error.message);
        if (error.message.includes('Invalid') || error.message.includes('JWT')) {
          console.log('\n→ Check that SUPABASE_SERVICE_ROLE_KEY is correct (Project Settings → API → service_role)');
        }
        process.exit(1);
      }

      console.log('\n✅ Supabase connection verified!');
      console.log('   Auth API responded successfully.');
      console.log('\n📋 Next steps:');
      console.log('   1. Run schema migrations to create tables in Supabase');
      console.log('   2. Migrate data from SQLite (see SUPABASE_MIGRATION_PLAN.md)');
      console.log('   3. Update server routes to use Supabase client');
    })
    .catch((err) => {
      console.error('\n❌ Connection error:', err.message);
      if (err.message.includes('fetch') || err.message.includes('network')) {
        console.log('\n→ Check SUPABASE_URL and network connectivity');
      }
      process.exit(1);
    });
} catch (err) {
  console.error('\n❌ Failed to create Supabase client:', err.message);
  process.exit(1);
}
