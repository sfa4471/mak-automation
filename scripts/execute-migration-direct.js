/**
 * Execute Supabase Migration Directly
 * 
 * This script attempts to execute the migration directly using
 * PostgreSQL connection.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env');
  console.log('\nPlease add:');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

const migrationFile = path.join(__dirname, '../supabase/migrations/20250131000000_initial_schema.sql');

if (!fs.existsSync(migrationFile)) {
  console.error('❌ Migration file not found:', migrationFile);
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

console.log('🚀 Attempting to execute migration directly...\n');
console.log('Supabase URL:', supabaseUrl.replace(/\/$/, ''));
console.log('');

// Use pg (PostgreSQL client) to execute SQL directly
async function executeMigration() {
  try {
    const { Client } = require('pg');
  
    // Extract connection details from Supabase URL
    // Supabase URL format: https://[project-ref].supabase.co
    const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    
    if (!urlMatch) {
      throw new Error('Could not parse Supabase URL');
    }
    
    const projectRef = urlMatch[1];
    
    // Get database password from environment
    const dbPassword = process.env.SUPABASE_DB_PASSWORD;
    
    if (!dbPassword) {
      console.log('⚠️  Database password not found in SUPABASE_DB_PASSWORD');
      console.log('   Getting connection string from Supabase...\n');
      console.log('📋 Please use one of these methods:\n');
      console.log('Method 1: Supabase Dashboard (Easiest)');
      console.log('  1. Go to: https://supabase.com/dashboard');
      console.log('  2. Select your project');
      console.log('  3. Go to SQL Editor');
      console.log('  4. Copy and paste the SQL from:');
      console.log(`     ${migrationFile}`);
      console.log('  5. Click "Run"\n');
      
      console.log('Method 2: Get Database Password');
      console.log('  1. Go to Supabase Dashboard → Settings → Database');
      console.log('  2. Copy the database password');
      console.log('  3. Add to .env: SUPABASE_DB_PASSWORD=your-password');
      console.log('  4. Run this script again\n');
      
      process.exit(0);
    }
    
    // Construct connection string
    // Try different connection formats
    const connectionStrings = [
      `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`,
      `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`
    ];
    
    console.log('Connecting to Supabase database...');
    
    let client;
    let connected = false;
    
    for (const connStr of connectionStrings) {
      try {
        client = new Client({
          connectionString: connStr,
          ssl: { rejectUnauthorized: false }
        });
        await client.connect();
        console.log('✅ Connected to database\n');
        connected = true;
        break;
      } catch (err) {
        // Try next connection string
        continue;
      }
    }
    
    if (!connected) {
      throw new Error('Could not connect to database. Please check your password and connection settings.');
    }
    
    // Execute the entire migration SQL as one transaction
    console.log('Executing migration...\n');
    
    try {
      await client.query(migrationSQL);
      console.log('✅ Migration executed successfully!\n');
    } catch (err) {
      // Check if it's just "already exists" errors
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('⚠️  Some objects already exist (this is OK)');
        console.log('   Migration may have been partially run before.\n');
      } else {
        throw err;
      }
    }
    
    await client.end();
    
    console.log('='.repeat(50));
    console.log('✅ Migration completed!');
    console.log('='.repeat(50));
    console.log('\nVerify tables: npm run supabase:verify\n');
    
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('pg')) {
      console.log('⚠️  PostgreSQL client (pg) not installed.');
      console.log('   Installing pg package...\n');
      
      // Try to install pg
      const { execSync } = require('child_process');
      try {
        execSync('npm install pg', { stdio: 'inherit' });
        console.log('\n✅ pg installed. Please run this script again.\n');
        process.exit(0);
      } catch (installErr) {
        console.error('❌ Failed to install pg:', installErr.message);
        console.log('\nPlease install manually: npm install pg\n');
        process.exit(1);
      }
    } else {
      console.error('❌ Error:', err.message);
      console.log('\n📋 Alternative: Use Supabase Dashboard method');
      console.log('   See: RUN_MIGRATION_NOW.md\n');
      process.exit(1);
    }
  }
}

// Run the migration
executeMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
