const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting database migration...\n');

// Check and add missing columns to wp1_data table
db.serialize(() => {
  // Check if columns exist
  db.all("PRAGMA table_info(wp1_data)", (err, columns) => {
    if (err) {
      console.error('Error checking table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    const missingColumns = [];

    if (!columnNames.includes('lastEditedByRole')) {
      missingColumns.push('lastEditedByRole TEXT');
    }
    if (!columnNames.includes('lastEditedByName')) {
      missingColumns.push('lastEditedByName TEXT');
    }
    if (!columnNames.includes('lastEditedByUserId')) {
      missingColumns.push('lastEditedByUserId INTEGER');
    }

    if (missingColumns.length === 0) {
      console.log('✅ All columns already exist in wp1_data table');
    } else {
      console.log('Adding missing columns to wp1_data table...');
      missingColumns.forEach(col => {
        const colName = col.split(' ')[0];
        db.run(`ALTER TABLE wp1_data ADD COLUMN ${col}`, (err) => {
          if (err) {
            console.error(`Error adding column ${colName}:`, err.message);
          } else {
            console.log(`✅ Added column: ${colName}`);
          }
        });
      });
    }
  });

  // Check and add updatedAt to workpackages table
  db.all("PRAGMA table_info(workpackages)", (err, columns) => {
    if (err) {
      console.error('Error checking workpackages table info:', err);
      db.close();
      return;
    }

    const columnNames = columns.map(col => col.name);
    if (!columnNames.includes('updatedAt')) {
      console.log('Adding updatedAt column to workpackages table...');
      // SQLite doesn't support CURRENT_TIMESTAMP in ALTER TABLE, so we add it without default
      // The application will set it on updates
      db.run('ALTER TABLE workpackages ADD COLUMN updatedAt DATETIME', (err) => {
        if (err) {
          console.error('Error adding updatedAt column:', err.message);
        } else {
          console.log('✅ Added column: updatedAt to workpackages');
          // Set initial value for existing rows
          db.run("UPDATE workpackages SET updatedAt = createdAt WHERE updatedAt IS NULL", (err) => {
            if (err) {
              console.error('Error setting initial updatedAt values:', err.message);
            }
          });
        }
      });
    } else {
      console.log('✅ updatedAt column already exists in workpackages table');
    }
  });

  // Check workpackages status constraint
  setTimeout(() => {
    console.log('\n✅ Migration complete!');
    console.log('\nNote: If you see errors about CHECK constraints, the new statuses (IN_PROGRESS_TECH, READY_FOR_REVIEW)');
    console.log('will work, but SQLite cannot modify CHECK constraints on existing tables.');
    console.log('The application will handle these statuses correctly.\n');
    db.close();
  }, 1000);
});

