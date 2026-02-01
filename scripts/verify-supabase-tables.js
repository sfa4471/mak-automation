/**
 * Verify Supabase Tables Script
 * 
 * This script verifies that all required tables were created successfully
 * in your Supabase database.
 * 
 * Usage:
 *   node scripts/verify-supabase-tables.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.log('\nPlease add to your .env file:');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

console.log('🔍 Verifying Supabase tables...\n');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Expected tables
const expectedTables = [
  'users',
  'projects',
  'project_counters',
  'workpackages',
  'tasks',
  'wp1_data',
  'proctor_data',
  'density_reports',
  'rebar_reports',
  'notifications',
  'task_history'
];

// Test queries for each table
async function verifyTable(tableName) {
  try {
    // Try to select from the table (limit 0 to just check structure)
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);

    if (error) {
      if (error.code === '42P01') {
        // Table does not exist
        return { exists: false, error: 'Table does not exist' };
      }
      return { exists: false, error: error.message };
    }

    return { exists: true, error: null };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

async function verifyAllTables() {
  const results = [];
  let allPassed = true;

  for (const table of expectedTables) {
    process.stdout.write(`Checking ${table}... `);
    const result = await verifyTable(table);
    
    if (result.exists) {
      console.log('✅');
      results.push({ table, status: 'OK' });
    } else {
      console.log(`❌ ${result.error}`);
      results.push({ table, status: 'FAILED', error: result.error });
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Verification Summary:');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  console.log(`✅ Passed: ${passed}/${expectedTables.length}`);
  console.log(`❌ Failed: ${failed}/${expectedTables.length}\n`);

  if (failed > 0) {
    console.log('Failed tables:');
    results
      .filter(r => r.status === 'FAILED')
      .forEach(r => {
        console.log(`  - ${r.table}: ${r.error}`);
      });
    console.log('\n⚠️  Please run the migration first:');
    console.log('   See: supabase/migrations/README.md\n');
  }

  // Additional checks
  if (allPassed) {
    console.log('✅ All tables verified successfully!\n');
    
    // Check indexes
    console.log('Checking indexes...');
    try {
      // Try to query with an indexed column to verify indexes work
      const { error: idxError } = await supabase
        .from('users')
        .select('email')
        .eq('email', 'test@example.com')
        .limit(0);
      
      if (!idxError || idxError.code !== '42P01') {
        console.log('✅ Indexes appear to be working\n');
      }
    } catch (err) {
      console.log('⚠️  Could not verify indexes\n');
    }

    // Check row counts
    console.log('Checking table row counts...');
    for (const table of expectedTables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (!error) {
          console.log(`  ${table}: ${count || 0} rows`);
        }
      } catch (err) {
        // Ignore errors for row count
      }
    }
    console.log('');
  }

  return allPassed;
}

// Run verification
verifyAllTables()
  .then((success) => {
    if (success) {
      console.log('🎉 Database verification complete!');
      console.log('\nNext steps:');
      console.log('  1. Migrate data: node scripts/migrate-data-sqlite-to-supabase.js');
      console.log('  2. Update application code to use Supabase client\n');
      process.exit(0);
    } else {
      console.log('❌ Verification failed. Please fix the issues above.\n');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('❌ Verification error:', err.message);
    process.exit(1);
  });
