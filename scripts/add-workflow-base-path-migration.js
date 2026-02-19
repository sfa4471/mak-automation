/**
 * Add workflow_base_path to app_settings Migration Script
 * 
 * This script adds the workflow_base_path setting to the app_settings table
 * in your Supabase database.
 * 
 * Usage:
 *   node scripts/add-workflow-base-path-migration.js
 * 
 * Requires:
 *   - SUPABASE_URL in .env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env (or DATABASE_URL)
 *   - pg package installed
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

// Get database connection
const getDatabaseUrl = () => {
  // Option 1: Direct DATABASE_URL (preferred)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Option 2: Construct from Supabase URL and service key
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or DATABASE_URL in .env');
  }

  // Extract project reference from Supabase URL
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('Invalid SUPABASE_URL format. Expected: https://[project-ref].supabase.co');
  }

  const projectRef = urlMatch[1];
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;

  if (!dbPassword) {
    console.warn('⚠️  SUPABASE_DB_PASSWORD not set. Will try Supabase client method...');
    return null;
  }

  // Construct connection string
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
};

async function runMigrationWithSupabaseClient() {
  logSection('RUNNING MIGRATION WITH SUPABASE CLIENT');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check if app_settings table exists
  log('\n📋 Checking app_settings table...', 'cyan');
  const { data: existingSettings, error: checkError } = await supabase
    .from('app_settings')
    .select('key')
    .eq('key', 'workflow_base_path')
    .limit(1);

  if (checkError && checkError.code !== 'PGRST116' && checkError.code !== '42P01') {
    // PGRST116 = no rows, 42P01 = table doesn't exist
    throw new Error(`Error checking app_settings: ${checkError.message}`);
  }

  if (existingSettings && existingSettings.length > 0) {
    log('  ✅ workflow_base_path setting already exists', 'green');
    log('\n✅ Migration not needed - setting already exists!', 'green');
    return true;
  }

  // Check if table exists
  const { error: tableCheckError } = await supabase
    .from('app_settings')
    .select('key')
    .limit(1);

  if (tableCheckError && tableCheckError.code === '42P01') {
    log('  ⚠️  app_settings table does not exist. Creating table first...', 'yellow');
    
    // Try to create table using RPC (if available) or direct insert
    // Since we can't run raw SQL, we'll need to use the full migration
    log('\n⚠️  Cannot create table via Supabase client.', 'yellow');
    log('   Please run the full migration: supabase/migrations/20250201000000_add_app_settings.sql', 'yellow');
    log('   Or use the Supabase Dashboard SQL Editor.\n', 'yellow');
    return false;
  }

  // Insert the workflow_base_path setting
  log('\n📝 Adding workflow_base_path setting...', 'cyan');
  const { data: inserted, error: insertError } = await supabase
    .from('app_settings')
    .insert({
      key: 'workflow_base_path',
      value: null,
      description: 'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.'
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      // Unique constraint violation - already exists
      log('  ✅ workflow_base_path setting already exists', 'green');
      return true;
    }
    throw new Error(`Failed to insert workflow_base_path: ${insertError.message}`);
  }

  if (inserted) {
    log(`  ✅ Successfully added workflow_base_path setting (ID: ${inserted.id})`, 'green');
    return true;
  }

  return false;
}

async function runMigrationWithPostgres(pool) {
  logSection('RUNNING MIGRATION WITH POSTGRESQL');

  const migrationSQL = `
    -- Insert workflow_base_path setting if it doesn't exist
    INSERT INTO app_settings (key, value, description) 
    VALUES ('workflow_base_path', NULL, 'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.')
    ON CONFLICT (key) DO NOTHING;
  `;

  try {
    await pool.query(migrationSQL);
    log('  ✅ Migration executed successfully', 'green');
    return true;
  } catch (error) {
    if (error.code === '42P01') {
      // Table doesn't exist - need to run full migration
      log('  ⚠️  app_settings table does not exist', 'yellow');
      log('\n   Please run the full migration first:', 'yellow');
      log('   supabase/migrations/20250201000000_add_app_settings.sql', 'cyan');
      return false;
    }
    if (error.code === '23505') {
      // Already exists
      log('  ✅ workflow_base_path setting already exists', 'green');
      return true;
    }
    throw error;
  }
}

async function verifyMigration(supabase) {
  logSection('VERIFYING MIGRATION');

  try {
    const { data: setting, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('key', 'workflow_base_path')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        log('  ❌ workflow_base_path setting not found', 'red');
        return false;
      }
      throw error;
    }

    if (setting) {
      log('  ✅ workflow_base_path setting found', 'green');
      log(`     ID: ${setting.id}`, 'cyan');
      log(`     Value: ${setting.value || '(null)'}`, 'cyan');
      log(`     Description: ${setting.description}`, 'cyan');
      return true;
    }

    return false;
  } catch (error) {
    log(`  ❌ Verification error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  console.log();
  log('🚀 Adding workflow_base_path to app_settings', 'bright');
  log('   Migration Script\n', 'cyan');

  let pool = null;
  let supabase = null;

  try {
    // Try to get Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey);
    }

    // Try to get PostgreSQL connection
    const databaseUrl = getDatabaseUrl();
    
    if (databaseUrl) {
      log('📡 Connecting to PostgreSQL database...', 'cyan');
      try {
        pool = new Pool({
          connectionString: databaseUrl,
          ssl: {
            rejectUnauthorized: false
          },
          max: 1,
          connectionTimeoutMillis: 10000
        });

        await pool.query('SELECT NOW()');
        log('✅ Database connection successful\n', 'green');

        // Run migration with PostgreSQL
        const success = await runMigrationWithPostgres(pool);
        if (success) {
          // Verify with Supabase client
          if (supabase) {
            await verifyMigration(supabase);
          }
          log('\n✅ Migration completed successfully!', 'green');
          process.exit(0);
        } else {
          log('\n⚠️  Migration may need full app_settings table creation', 'yellow');
          process.exit(1);
        }
      } catch (connectionError) {
        log('⚠️  PostgreSQL connection failed, trying Supabase client method...', 'yellow');
        log(`   Error: ${connectionError.message}\n`, 'yellow');
      }
    }

    // Fallback to Supabase client method
    if (supabase) {
      log('📡 Using Supabase client method...', 'cyan');
      const success = await runMigrationWithSupabaseClient();
      
      if (success) {
        await verifyMigration(supabase);
        log('\n✅ Migration completed successfully!', 'green');
        process.exit(0);
      } else {
        log('\n⚠️  Migration requires full app_settings table', 'yellow');
        log('\n📋 Next Steps:', 'cyan');
        log('  1. Go to Supabase Dashboard → SQL Editor', 'cyan');
        log('  2. Run the full migration:', 'cyan');
        log('     supabase/migrations/20250201000000_add_app_settings.sql', 'cyan');
        log('  3. Then run this script again\n', 'cyan');
        process.exit(1);
      }
    } else {
      log('❌ Cannot run migration:', 'red');
      log('   Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 'red');
      log('\n📋 Alternative: Run migration manually', 'cyan');
      log('  1. Go to Supabase Dashboard → SQL Editor', 'cyan');
      log('  2. Run this SQL:', 'cyan');
      log('     INSERT INTO app_settings (key, value, description)', 'cyan');
      log('     VALUES (\'workflow_base_path\', NULL, \'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.\')', 'cyan');
      log('     ON CONFLICT (key) DO NOTHING;\n', 'cyan');
      process.exit(1);
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      log('\n📡 Database connection closed', 'cyan');
    }
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
