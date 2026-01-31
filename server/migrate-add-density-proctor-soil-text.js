const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Checking density_reports table for proctorSoilClassificationText column...\n');

db.serialize(() => {
  // Check if column exists
  db.all("PRAGMA table_info(density_reports)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    
    if (columnNames.includes('proctorSoilClassificationText')) {
      console.log('✅ proctorSoilClassificationText column already exists in density_reports table');
      db.close();
      return;
    }

    console.log('📝 Adding proctorSoilClassificationText column to density_reports table...');
    
    db.run(`ALTER TABLE density_reports ADD COLUMN proctorSoilClassificationText TEXT`, (err) => {
      if (err) {
        console.error('❌ Error adding proctorSoilClassificationText column:', err.message);
      } else {
        console.log('✅ Successfully added proctorSoilClassificationText column to density_reports table');
      }
      db.close();
    });
  });
});
