const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Creating task_history table for audit trail...');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    actorRole TEXT NOT NULL,
    actorName TEXT NOT NULL,
    actorUserId INTEGER,
    actionType TEXT NOT NULL CHECK(actionType IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'REASSIGNED', 'STATUS_CHANGED')),
    note TEXT,
    FOREIGN KEY (taskId) REFERENCES tasks(id),
    FOREIGN KEY (actorUserId) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating task_history table:', err.message);
    } else {
      console.log('✓ Created task_history table');
    }
  });

  // Add technicianId to density_reports if it doesn't exist
  db.all("PRAGMA table_info(density_reports)", (err, columns) => {
    if (err) {
      console.error('Error checking density_reports table:', err);
      db.close();
      return;
    }
    
    const columnNames = columns.map(col => col.name);
    if (!columnNames.includes('technicianId')) {
      console.log('Adding technicianId column to density_reports table...');
      db.run('ALTER TABLE density_reports ADD COLUMN technicianId INTEGER', (err) => {
        if (err) {
          console.error('Error adding technicianId column:', err.message);
        } else {
          console.log('✓ Added technicianId column to density_reports');
        }
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err.message);
          } else {
            console.log('✅ Migration completed successfully!');
          }
        });
      });
    } else {
      console.log('✓ technicianId column already exists in density_reports');
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('✅ Migration completed successfully!');
        }
      });
    }
  });
});

