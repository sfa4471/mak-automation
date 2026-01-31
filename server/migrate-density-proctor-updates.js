const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Density and Proctor updates...\n');

db.serialize(() => {
  // Add proctorNo to tasks table (for PROCTOR tasks)
  db.run(`
    ALTER TABLE tasks 
    ADD COLUMN proctorNo INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding proctorNo column to tasks:', err);
    } else if (!err) {
      console.log('✅ Added proctorNo column to tasks table');
      // Create unique index for (projectId, proctorNo) for PROCTOR tasks
      db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_proctor_unique 
        ON tasks(projectId, proctorNo) 
        WHERE taskType = 'PROCTOR' AND proctorNo IS NOT NULL
      `, (indexErr) => {
        if (indexErr && !indexErr.message.includes('already exists')) {
          console.error('Error creating unique index:', indexErr);
        } else if (!indexErr) {
          console.log('✅ Created unique index on (projectId, proctorNo) for PROCTOR tasks');
        }
      });
    } else {
      console.log('✅ proctorNo column already exists in tasks table');
    }
  });

  // Add new fields to density_reports table
  // Structure type (from concrete specs)
  db.run(`
    ALTER TABLE density_reports 
    ADD COLUMN structureType TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding structureType column:', err);
    } else if (!err) {
      console.log('✅ Added structureType column to density_reports');
    }
  });

  // Spec snapshots (copied from project concrete specs)
  db.run(`
    ALTER TABLE density_reports 
    ADD COLUMN specDensityPct TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding specDensityPct column:', err);
    } else if (!err) {
      console.log('✅ Added specDensityPct column to density_reports');
    }
  });

  // Proctor reference and snapshot fields
  db.run(`
    ALTER TABLE density_reports 
    ADD COLUMN proctorTaskId INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding proctorTaskId column:', err);
    } else if (!err) {
      console.log('✅ Added proctorTaskId column to density_reports');
    }
  });

  db.run(`
    ALTER TABLE density_reports 
    ADD COLUMN proctorOptMoisture TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding proctorOptMoisture column:', err);
    } else if (!err) {
      console.log('✅ Added proctorOptMoisture column to density_reports');
    }
  });

  db.run(`
    ALTER TABLE density_reports 
    ADD COLUMN proctorMaxDensity TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding proctorMaxDensity column:', err);
    } else if (!err) {
      console.log('✅ Added proctorMaxDensity column to density_reports');
    }
  });

  // Wait for all ALTER TABLE operations to complete
  setTimeout(() => {
    console.log('\n✅ Migration completed successfully!');
    db.close((closeErr) => {
      if (closeErr) {
        console.error('Error closing database:', closeErr);
        process.exit(1);
      }
      process.exit(0);
    });
  }, 1000);
});
