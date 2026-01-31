const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Checking density_reports table for proctor snapshot fields...\n');

db.serialize(() => {
  // Check if columns exist
  db.all("PRAGMA table_info(density_reports)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    const missingColumns = [];
    
    if (!columnNames.includes('proctorSoilClassification')) {
      missingColumns.push({ name: 'proctorSoilClassification', sql: 'proctorSoilClassification TEXT' });
    }
    if (!columnNames.includes('proctorDescriptionLabel')) {
      missingColumns.push({ name: 'proctorDescriptionLabel', sql: 'proctorDescriptionLabel TEXT' });
    }

    if (missingColumns.length === 0) {
      console.log('✅ All proctor snapshot columns already exist in density_reports table');
      db.close();
      return;
    }

    console.log(`📝 Adding ${missingColumns.length} missing column(s) to density_reports table...`);
    
    missingColumns.forEach((col) => {
      db.run(`ALTER TABLE density_reports ADD COLUMN ${col.sql}`, (err) => {
        if (err) {
          console.error(`❌ Error adding ${col.name} column:`, err.message);
        } else {
          console.log(`✅ Successfully added ${col.name} column to density_reports table`);
        }
      });
    });
    
    // Close after all operations complete
    setTimeout(() => {
      db.close();
      console.log('\n✅ Migration complete!');
    }, 1000);
  });
});
