const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Checking proctor_data table for description column...\n');

db.serialize(() => {
  // Check if description column exists
  db.all("PRAGMA table_info(proctor_data)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    
    if (columnNames.includes('description')) {
      console.log('✅ description column already exists in proctor_data table');
      db.close();
      return;
    }

    console.log('📝 Adding description column to proctor_data table...');
    
    db.run(`ALTER TABLE proctor_data ADD COLUMN description TEXT`, (err) => {
      if (err) {
        console.error('❌ Error adding description column:', err.message);
      } else {
        console.log('✅ Successfully added description column to proctor_data table');
      }
      db.close();
    });
  });
});
