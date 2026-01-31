const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Adding plasticLimit column to proctor_data table...\n');

db.serialize(() => {
  // Check if column exists
  db.all("PRAGMA table_info(proctor_data)", (err, columns) => {
    if (err) {
      console.error('Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    
    if (columnNames.includes('plasticLimit')) {
      console.log('✅ plasticLimit column already exists in proctor_data table');
      db.close();
      return;
    }

    // Add plasticLimit column
    console.log('Adding plasticLimit column to proctor_data table...');
    db.run(`
      ALTER TABLE proctor_data 
      ADD COLUMN plasticLimit TEXT
    `, (alterErr) => {
      if (alterErr) {
        console.error('Error adding plasticLimit column:', alterErr.message);
        db.close();
        return;
      }
      
      console.log('✅ Added plasticLimit column to proctor_data table');
      console.log('\n✅ Migration completed successfully!');
      db.close();
    });
  });
});
