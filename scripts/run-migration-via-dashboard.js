/**
 * Run Migration via Supabase Dashboard
 * 
 * This script provides the SQL and opens instructions for running
 * the migration in Supabase Dashboard
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const migrationFile = path.join(__dirname, '../supabase/migrations/20250131000000_initial_schema.sql');

if (!fs.existsSync(migrationFile)) {
  console.error('❌ Migration file not found:', migrationFile);
  process.exit(1);
}

console.log('='.repeat(70));
console.log('🚀 SUPABASE MIGRATION - DASHBOARD METHOD');
console.log('='.repeat(70));
console.log('\n📋 Step-by-Step Instructions:\n');

console.log('STEP 1: Open Supabase Dashboard');
console.log('  → https://supabase.com/dashboard');
console.log('  → Select your project\n');

console.log('STEP 2: Open SQL Editor');
console.log('  → Click "SQL Editor" in left sidebar');
console.log('  → Click "New query"\n');

console.log('STEP 3: Copy the Migration SQL');
console.log('  → The migration file will open automatically');
console.log('  → Or manually open: supabase/migrations/20250131000000_initial_schema.sql');
console.log('  → Select ALL (Ctrl+A) and Copy (Ctrl+C)\n');

console.log('STEP 4: Paste and Execute');
console.log('  → Paste into Supabase SQL Editor');
console.log('  → Click "Run" button (or Ctrl+Enter)\n');

console.log('STEP 5: Verify Tables');
console.log('  → Go to "Table Editor" in left sidebar');
console.log('  → You should see 11 tables created\n');

console.log('='.repeat(70));
console.log('Opening migration file...');
console.log('='.repeat(70));
console.log('\n');

// Try to open the file
const platform = process.platform;
let command;

if (platform === 'win32') {
  command = `start "" "${migrationFile}"`;
} else if (platform === 'darwin') {
  command = `open "${migrationFile}"`;
} else {
  command = `xdg-open "${migrationFile}"`;
}

exec(command, (error) => {
  if (error) {
    console.log('⚠️  Could not open file automatically.');
    console.log(`   Please open manually: ${migrationFile}\n`);
  } else {
    console.log('✅ Migration file opened!\n');
  }
  
  console.log('📝 Migration file location:');
  console.log(`   ${migrationFile}\n`);
  
  console.log('💡 Tip: After running the migration in Supabase Dashboard,');
  console.log('   verify with: npm run supabase:verify\n');
});
