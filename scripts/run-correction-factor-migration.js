/**
 * Run Correction Factor Migration Script
 * 
 * This script runs the correction factor migration against your Supabase database.
 * 
 * Usage:
 *   node scripts/run-correction-factor-migration.js
 * 
 * Requires:
 *   - SUPABASE_URL in .env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env
 *   - DATABASE_URL or SUPABASE_DB_PASSWORD in .env (for direct PostgreSQL connection)
 *   - pg package installed (npm install pg)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Get database connection
const getDatabaseUrl = () => {
  // Option 1: Direct DATABASE_URL (preferred)
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('[PASSWORD]')) {
    return process.env.DATABASE_URL;
  }

  // Option 2: Construct from Supabase URL and password
  const supabaseUrl = process.env.SUPABASE_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or DATABASE_URL in .env');
  }

  // Extract project reference from Supabase URL
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error('Invalid SUPABASE_URL format. Expected: https://[project-ref].supabase.co');
  }

  const projectRef = urlMatch[1];

  if (!dbPassword) {
    // Try to use Supabase client method instead
    log('⚠️  Database password not found. Attempting alternative method...', 'yellow');
    return null; // Signal to use alternative method
  }

  // Construct connection string
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
};

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

async function runMigrationWithSupabaseClient() {
  log('\n📡 Using Supabase client method...', 'cyan');
  
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read migration SQL
  const migrationFile = path.join(__dirname, '../supabase/migrations/20250202000000_add_proctor_correction_factor.sql');
  const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

  log('⚠️  Supabase JS client cannot execute raw SQL directly.', 'yellow');
  log('\n📋 Please run this migration manually:', 'cyan');
  log('   1. Go to: https://supabase.com/dashboard', 'cyan');
  log('   2. Select your project', 'cyan');
  log('   3. Go to: SQL Editor', 'cyan');
  log('   4. Copy and paste the following SQL:', 'cyan');
  log('\n' + '='.repeat(70), 'cyan');
  console.log(migrationSQL);
  log('='.repeat(70) + '\n', 'cyan');
  log('   5. Click "Run"', 'cyan');
  log('\n   Or add SUPABASE_DB_PASSWORD to .env and run this script again.\n', 'cyan');
  
  // Try to verify if columns already exist
  try {
    const { data, error } = await supabase
      .from('proctor_data')
      .select('corrected_dry_density_pcf, corrected_moisture_content_percent, apply_correction_factor')
      .limit(1);
    
    if (!error) {
      log('✅ Columns already exist! Migration may have been run already.', 'green');
      log('   The correction factor feature should be working.\n', 'green');
      return;
    } else if (error.code === '42703') { // undefined_column
      log('❌ Columns do not exist yet. Please run the migration manually (see above).\n', 'red');
    } else {
      log(`⚠️  Could not verify columns: ${error.message}\n`, 'yellow');
    }
  } catch (err) {
    log(`⚠️  Could not verify columns: ${err.message}\n`, 'yellow');
  }
}

async function runMigration() {
  console.log();
  log('🚀 Running Correction Factor Migration', 'bright');
  log('   Adding correction factor columns to proctor_data table\n', 'cyan');

  let pool;

  try {
    // Get database connection
    log('📡 Connecting to database...', 'cyan');
    const databaseUrl = getDatabaseUrl();
    
    if (!databaseUrl) {
      // Fall back to Supabase client method
      await runMigrationWithSupabaseClient();
      return;
    }
    
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false // Supabase requires SSL
      },
      max: 1,
      connectionTimeoutMillis: 10000
    });

    // Test connection
    await pool.query('SELECT NOW()');
    log('✅ Database connection successful\n', 'green');

    // Read migration file
    const migrationFile = path.join(__dirname, '../supabase/migrations/20250202000000_add_proctor_correction_factor.sql');
    
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found: ${migrationFile}`);
    }

    log(`Reading migration file: ${migrationFile}`, 'cyan');
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

    log('\nExecuting migration...\n', 'cyan');

    // Execute the migration
    try {
      await pool.query(migrationSQL);
      log('✅ Migration executed successfully!', 'green');
    } catch (error) {
      // Check if columns already exist (this is OK)
      if (error.message.includes('already exists') || 
          error.message.includes('duplicate') ||
          error.code === '42701') { // duplicate_column
        log('⚠️  Columns already exist (migration may have been run before)', 'yellow');
        log('   This is OK - columns are already in the database', 'yellow');
      } else {
        throw error;
      }
    }

    // Verify columns were added
    log('\nVerifying columns...', 'cyan');
    
    const verifyQuery = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'proctor_data'
      AND column_name IN ('corrected_dry_density_pcf', 'corrected_moisture_content_percent', 'apply_correction_factor')
      ORDER BY column_name;
    `;

    const verifyResult = await pool.query(verifyQuery);
    
    if (verifyResult.rows.length === 3) {
      log('\n✅ All columns verified:', 'green');
      verifyResult.rows.forEach(row => {
        log(`   - ${row.column_name} (${row.data_type})`, 'green');
      });
    } else {
      log(`\n⚠️  Expected 3 columns, found ${verifyResult.rows.length}:`, 'yellow');
      verifyResult.rows.forEach(row => {
        log(`   - ${row.column_name} (${row.data_type})`, 'yellow');
      });
      
      const expectedColumns = ['corrected_dry_density_pcf', 'corrected_moisture_content_percent', 'apply_correction_factor'];
      const foundColumns = verifyResult.rows.map(r => r.column_name);
      const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));
      
      if (missingColumns.length > 0) {
        log(`\n❌ Missing columns: ${missingColumns.join(', ')}`, 'red');
        throw new Error('Migration verification failed - some columns are missing');
      }
    }

    log('\n🎉 Migration completed successfully!', 'bright');
    log('   The correction factor feature is now ready to use.\n', 'green');

  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, 'red');
    
    if (error.message.includes('password') || error.message.includes('authentication')) {
      log('\n💡 Tip: Make sure you have the correct database password in your .env file:', 'cyan');
      log('   SUPABASE_DB_PASSWORD=your-database-password', 'cyan');
      log('   Get it from: Supabase Dashboard → Settings → Database → Database password\n', 'cyan');
    }
    
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      log('\n📡 Database connection closed', 'cyan');
    }
  }
}

// Run the migration
runMigration().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
