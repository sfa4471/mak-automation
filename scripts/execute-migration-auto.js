/**
 * Auto-execute Supabase Migration
 * Attempts to execute migration using available credentials
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const migrationFile = path.join(__dirname, '../supabase/migrations/20250131000000_initial_schema.sql');
const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Could not parse Supabase URL');
  process.exit(1);
}

console.log('🚀 Attempting to execute migration automatically...\n');
console.log('Project:', projectRef);
console.log('');

// Try to use Supabase REST API to execute SQL
// Note: Supabase doesn't support arbitrary SQL execution via REST API
// We need to use direct PostgreSQL connection

async function tryDirectConnection() {
  const { Client } = require('pg');
  
  // Try to get password from environment or prompt
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  
  if (!dbPassword) {
    console.log('⚠️  Database password required for direct connection.');
    console.log('\n📋 Please use Supabase Dashboard method:\n');
    console.log('  1. Go to: https://supabase.com/dashboard');
    console.log('  2. Select your project');
    console.log('  3. Go to: SQL Editor');
    console.log('  4. Copy SQL from: supabase/migrations/20250131000000_initial_schema.sql');
    console.log('  5. Paste and Run\n');
    console.log('Or get database password and add to .env:');
    console.log('  SUPABASE_DB_PASSWORD=your-password\n');
    return;
  }
  
  // Try connection strings
  const connections = [
    `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`
  ];
  
  for (const connStr of connections) {
    try {
      console.log('Attempting connection...');
      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
      });
      
      await client.connect();
      console.log('✅ Connected!\n');
      console.log('Executing migration...\n');
      
      await client.query(migrationSQL);
      
      await client.end();
      
      console.log('='.repeat(50));
      console.log('✅ Migration completed successfully!');
      console.log('='.repeat(50));
      console.log('\nVerify tables: npm run supabase:verify\n');
      return;
      
    } catch (err) {
      if (err.message.includes('password') || err.message.includes('authentication')) {
        console.log('❌ Authentication failed. Please check your database password.\n');
        continue;
      } else if (err.message.includes('ECONNREFUSED') || err.message.includes('timeout')) {
        console.log('❌ Connection failed. Trying next connection method...\n');
        continue;
      } else {
        // Check if it's just "already exists" which is OK
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log('⚠️  Some objects already exist (migration may have been run before)');
          console.log('   This is OK - verifying tables...\n');
          
          // Verify by checking if tables exist
          try {
            const { rows } = await client.query(`
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = 'public' 
              ORDER BY table_name
            `);
            
            const expectedTables = ['users', 'projects', 'project_counters', 'workpackages', 
                                   'tasks', 'wp1_data', 'proctor_data', 'density_reports', 
                                   'rebar_reports', 'notifications', 'task_history'];
            
            const foundTables = rows.map(r => r.table_name);
            const missing = expectedTables.filter(t => !foundTables.includes(t));
            
            if (missing.length === 0) {
              console.log('✅ All tables exist!');
              console.log(`   Found ${foundTables.length} tables\n`);
            } else {
              console.log(`⚠️  Missing tables: ${missing.join(', ')}`);
              console.log('   Please run the full migration\n');
            }
            
            await client.end();
            return;
          } catch (verifyErr) {
            console.error('Error verifying:', verifyErr.message);
          }
        } else {
          console.error('❌ Error:', err.message);
          console.log('\nPlease use Supabase Dashboard method instead.\n');
        }
        await client.end();
        return;
      }
    }
  }
  
  console.log('❌ Could not connect to database.');
  console.log('   Please use Supabase Dashboard method.\n');
}

tryDirectConnection().catch(err => {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.log('Installing pg package...');
    const { execSync } = require('child_process');
    execSync('npm install pg', { stdio: 'inherit' });
    console.log('\n✅ Installed. Please run this script again.\n');
  } else {
    console.error('Error:', err.message);
  }
});
