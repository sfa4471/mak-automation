const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding scheduledStartDate and scheduledEndDate columns to tasks table...');

db.serialize(() => {
  // Add scheduledStartDate column
  db.run('ALTER TABLE tasks ADD COLUMN scheduledStartDate TEXT', (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column scheduledStartDate already exists, skipping...');
      } else {
        console.error('Error adding scheduledStartDate:', err);
      }
    } else {
      console.log('✓ Added scheduledStartDate column');
    }
  });

  // Add scheduledEndDate column
  db.run('ALTER TABLE tasks ADD COLUMN scheduledEndDate TEXT', (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column scheduledEndDate already exists, skipping...');
      } else {
        console.error('Error adding scheduledEndDate:', err);
      }
    } else {
      console.log('✓ Added scheduledEndDate column');
    }
  });

  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Migration completed successfully!');
    }
  });
});

