/**
 * Data Migration Script: SQLite to Supabase
 * 
 * This script migrates data from the SQLite database to Supabase.
 * It handles:
 * - Column name conversion (camelCase → snake_case)
 * - JSON TEXT → JSONB conversion
 * - Foreign key preservation
 * - Data type conversions
 * 
 * Usage:
 *   node scripts/migrate-data-sqlite-to-supabase.js
 * 
 * Prerequisites:
 *   - SQLite database exists at server/mak_automation.db
 *   - Supabase tables are created (run migration first)
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { keysToSnakeCase } = require('../server/db/supabase');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sqlitePath = path.join(__dirname, '../server/mak_automation.db');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('\nPlease add to your .env file:');
  console.log('SUPABASE_URL=https://your-project.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

if (!require('fs').existsSync(sqlitePath)) {
  console.error(`❌ SQLite database not found: ${sqlitePath}`);
  console.log('\nPlease ensure the SQLite database exists first.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Column mapping: SQLite (camelCase) → Supabase (snake_case)
const columnMappings = {
  users: {
    id: 'id',
    email: 'email',
    password: 'password',
    role: 'role',
    name: 'name',
    createdAt: 'created_at'
  },
  projects: {
    id: 'id',
    projectNumber: 'project_number',
    projectName: 'project_name',
    projectSpec: 'project_spec',
    customerEmail: 'customer_email',
    specStrengthPsi: 'spec_strength_psi',
    specAmbientTempF: 'spec_ambient_temp_f',
    specConcreteTempF: 'spec_concrete_temp_f',
    specSlump: 'spec_slump',
    specAirContentByVolume: 'spec_air_content_by_volume',
    customerEmails: 'customer_emails',
    soilSpecs: 'soil_specs',
    concreteSpecs: 'concrete_specs',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  project_counters: {
    year: 'year',
    nextSeq: 'next_seq',
    updatedAt: 'updated_at'
  },
  workpackages: {
    id: 'id',
    projectId: 'project_id',
    name: 'name',
    type: 'type',
    status: 'status',
    assignedTo: 'assigned_to',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  tasks: {
    id: 'id',
    projectId: 'project_id',
    taskType: 'task_type',
    status: 'status',
    assignedTechnicianId: 'assigned_technician_id',
    dueDate: 'due_date',
    scheduledStartDate: 'scheduled_start_date',
    scheduledEndDate: 'scheduled_end_date',
    locationName: 'location_name',
    locationNotes: 'location_notes',
    engagementNotes: 'engagement_notes',
    rejectionRemarks: 'rejection_remarks',
    resubmissionDueDate: 'resubmission_due_date',
    fieldCompleted: 'field_completed',
    fieldCompletedAt: 'field_completed_at',
    reportSubmitted: 'report_submitted',
    lastEditedByUserId: 'last_edited_by_user_id',
    lastEditedByRole: 'last_edited_by_role',
    lastEditedAt: 'last_edited_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    proctorNo: 'proctor_no'
  }
};

// Tables in dependency order (must migrate in this order)
const migrationOrder = [
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

/**
 * Parse JSON TEXT field to JSONB-compatible format
 */
function parseJsonField(value) {
  if (!value || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      // If not valid JSON, return as string
      return value;
    }
  }
  return value;
}

/**
 * Convert SQLite row to Supabase format
 */
function convertRow(tableName, row) {
  const converted = {};
  
  for (const [sqliteCol, value] of Object.entries(row)) {
    // Use column mapping if available, otherwise convert to snake_case
    const supabaseCol = columnMappings[tableName]?.[sqliteCol] || 
                       sqliteCol.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    // Handle JSON fields
    if (['customer_emails', 'soil_specs', 'concrete_specs', 'cylinders', 
         'proctor_points', 'zav_points', 'passing200', 'test_rows', 'proctors'].includes(supabaseCol)) {
      converted[supabaseCol] = parseJsonField(value);
    } else {
      converted[supabaseCol] = value;
    }
  }
  
  return converted;
}

/**
 * Migrate a single table
 */
async function migrateTable(tableName) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Migrating ${tableName}...`);
    
    const db = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        return reject(err);
      }
    });

    db.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
      if (err) {
        db.close();
        // Table might not exist in SQLite (e.g., project_counters might be empty)
        if (err.message.includes('no such table')) {
          console.log(`  ⚠️  Table ${tableName} does not exist in SQLite (skipping)`);
          return resolve({ table: tableName, count: 0, skipped: true });
        }
        return reject(err);
      }

      if (rows.length === 0) {
        console.log(`  ℹ️  No data to migrate (0 rows)`);
        db.close();
        return resolve({ table: tableName, count: 0 });
      }

      console.log(`  Found ${rows.length} rows`);

      // Convert rows
      const convertedRows = rows.map(row => convertRow(tableName, row));

      // Insert in batches (Supabase has limits)
      const batchSize = 100;
      let inserted = 0;
      let errors = 0;

      for (let i = 0; i < convertedRows.length; i += batchSize) {
        const batch = convertedRows.slice(i, i + batchSize);
        
        try {
          const { data, error } = await supabase
            .from(tableName)
            .insert(batch)
            .select();

          if (error) {
            console.error(`  ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
            errors += batch.length;
          } else {
            inserted += data?.length || batch.length;
            process.stdout.write(`  Progress: ${Math.min(inserted, rows.length)}/${rows.length}\r`);
          }
        } catch (err) {
          console.error(`  ❌ Error:`, err.message);
          errors += batch.length;
        }
      }

      db.close();

      if (errors > 0) {
        console.log(`\n  ⚠️  Completed with ${errors} errors`);
      } else {
        console.log(`\n  ✅ Migrated ${inserted} rows successfully`);
      }

      resolve({ table: tableName, count: inserted, errors });
    });
  });
}

/**
 * Main migration function
 */
async function migrateAll() {
  console.log('🚀 Starting data migration from SQLite to Supabase\n');
  console.log('SQLite DB:', sqlitePath);
  console.log('Supabase URL:', supabaseUrl.replace(/\/$/, ''));
  console.log('');

  const results = [];

  for (const table of migrationOrder) {
    try {
      const result = await migrateTable(table);
      results.push(result);
    } catch (err) {
      console.error(`❌ Failed to migrate ${table}:`, err.message);
      results.push({ table, count: 0, error: err.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Migration Summary:');
  console.log('='.repeat(50));

  const totalRows = results.reduce((sum, r) => sum + (r.count || 0), 0);
  const skipped = results.filter(r => r.skipped).length;
  const errors = results.filter(r => r.error).length;

  results.forEach(r => {
    if (r.skipped) {
      console.log(`  ${r.table}: skipped (table not in SQLite)`);
    } else if (r.error) {
      console.log(`  ${r.table}: ❌ ${r.error}`);
    } else {
      console.log(`  ${r.table}: ✅ ${r.count} rows`);
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`Total rows migrated: ${totalRows}`);
  console.log(`Tables skipped: ${skipped}`);
  console.log(`Tables with errors: ${errors}`);
  console.log('='.repeat(50));

  if (errors === 0) {
    console.log('\n🎉 Data migration completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Verify data: node scripts/verify-supabase-tables.js');
    console.log('  2. Update application code to use Supabase client');
    console.log('  3. Test the application with Supabase\n');
  } else {
    console.log('\n⚠️  Migration completed with errors. Please review above.\n');
  }
}

// Run migration
migrateAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
