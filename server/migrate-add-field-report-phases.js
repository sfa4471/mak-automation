const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding field/report phase columns to tasks table...');

db.serialize(() => {
  // Check if columns exist
  db.all("PRAGMA table_info(tasks)", (err, columns) => {
    if (err) {
      console.error('Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    const missingColumns = [];

    if (!columnNames.includes('fieldCompleted')) {
      missingColumns.push('fieldCompleted INTEGER DEFAULT 0');
    }
    if (!columnNames.includes('fieldCompletedAt')) {
      missingColumns.push('fieldCompletedAt DATETIME');
    }
    if (!columnNames.includes('reportSubmitted')) {
      missingColumns.push('reportSubmitted INTEGER DEFAULT 0');
    }

    if (missingColumns.length === 0) {
      console.log('✅ All columns already exist in tasks table');
      db.close();
      return;
    }

    console.log('Adding missing columns to tasks table...');
    missingColumns.forEach(col => {
      const colName = col.split(' ')[0];
      db.run(`ALTER TABLE tasks ADD COLUMN ${col}`, (err) => {
        if (err) {
          console.error(`Error adding column ${colName}:`, err.message);
        } else {
          console.log(`✅ Added column: ${colName}`);
        }
      });
    });

    // Wait a bit for async operations to complete
    setTimeout(() => {
      console.log('\n✅ Migration complete!');
      db.close();
    }, 1000);
  });
});
