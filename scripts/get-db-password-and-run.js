/**
 * Get Database Password and Run Migration
 * 
 * This script helps you get the database password and execute the migration
 */

require('dotenv').config();
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('SUPABASE MIGRATION - Get Database Password');
  console.log('='.repeat(70));
  console.log('\nTo execute the migration, we need your database password.\n');
  console.log('📋 How to get your database password:');
  console.log('  1. Go to: https://supabase.com/dashboard');
  console.log('  2. Select your project');
  console.log('  3. Go to: Settings → Database');
  console.log('  4. Under "Connection string", you\'ll see the password');
  console.log('  5. Or click "Reset database password" if needed\n');
  
  const password = await question('Enter your database password (or press Enter to use Dashboard method): ');
  
  if (!password || password.trim() === '') {
    console.log('\n📋 Using Supabase Dashboard method instead:\n');
    console.log('  1. Go to: https://supabase.com/dashboard');
    console.log('  2. Select your project');
    console.log('  3. Go to: SQL Editor');
    console.log('  4. Copy SQL from: supabase/migrations/20250131000000_initial_schema.sql');
    console.log('  5. Paste and Run\n');
    rl.close();
    return;
  }
  
  // Save to .env
  const fs = require('fs');
  const envPath = require('path').join(__dirname, '../.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    // Remove existing SUPABASE_DB_PASSWORD if present
    envContent = envContent.replace(/SUPABASE_DB_PASSWORD=.*\n/g, '');
  }
  
  envContent += `SUPABASE_DB_PASSWORD=${password.trim()}\n`;
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n✅ Password saved to .env');
  console.log('   Executing migration...\n');
  
  rl.close();
  
  // Now run the migration
  require('./execute-migration-direct.js');
}

main().catch(err => {
  console.error('Error:', err);
  rl.close();
  process.exit(1);
});
