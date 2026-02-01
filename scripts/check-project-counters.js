/**
 * Diagnostic script to check if project_counters table exists
 * Run this to diagnose project creation issues
 */

require('dotenv').config();
const { supabase, isAvailable } = require('../server/db/supabase');

async function checkProjectCounters() {
  console.log('🔍 Checking project_counters table...\n');
  
  if (!isAvailable()) {
    console.log('❌ Supabase is not configured. Using SQLite fallback.');
    console.log('   For SQLite, the table will be created automatically on first use.');
    return;
  }
  
  console.log('✅ Supabase is configured\n');
  
  try {
    // Try to query the table
    const { data, error } = await supabase
      .from('project_counters')
      .select('*')
      .limit(1);
    
    if (error) {
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.log('❌ ERROR: project_counters table does not exist!\n');
        console.log('📋 Solution:');
        console.log('   1. Run the database migration:');
        console.log('      npm run supabase:execute-and-verify\n');
        console.log('   2. Or manually run the migration SQL from:');
        console.log('      supabase/migrations/20250131000000_initial_schema.sql\n');
        return;
      } else {
        console.log('❌ Error querying project_counters table:');
        console.log(`   Code: ${error.code}`);
        console.log(`   Message: ${error.message}\n`);
        return;
      }
    }
    
    console.log('✅ project_counters table exists\n');
    console.log(`   Found ${data ? data.length : 0} counter(s)\n`);
    
    // Check current year counter
    const year = new Date().getFullYear();
    const { data: yearCounter, error: yearError } = await supabase
      .from('project_counters')
      .select('*')
      .eq('year', year)
      .single();
    
    if (yearError && yearError.code === 'PGRST116') {
      console.log(`ℹ️  No counter exists for year ${year} (will be created on first project)\n`);
    } else if (yearError) {
      console.log(`⚠️  Error checking year counter: ${yearError.message}\n`);
    } else {
      console.log(`✅ Counter for year ${year} exists:`);
      console.log(`   Next sequence: ${yearCounter.next_seq}\n`);
    }
    
    console.log('✅ All checks passed! Project creation should work.\n');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

checkProjectCounters()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
