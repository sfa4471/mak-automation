const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Fixing workpackages status constraint...\n');

db.serialize(() => {
  // Step 1: Create new table without CHECK constraint
  console.log('Creating new workpackages table without CHECK constraint...');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS workpackages_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      assignedTo INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME,
      FOREIGN KEY (projectId) REFERENCES projects(id),
      FOREIGN KEY (assignedTo) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating new table:', err);
      db.close();
      return;
    }
    console.log('✅ New table created');
    
    // Step 2: Copy data from old table to new table
    console.log('Copying data from old table...');
    db.run(`
      INSERT INTO workpackages_new (id, projectId, name, type, status, assignedTo, createdAt, updatedAt)
      SELECT id, projectId, name, type, status, assignedTo, createdAt, 
             COALESCE(updatedAt, createdAt) as updatedAt
      FROM workpackages
    `, (err) => {
      if (err) {
        console.error('Error copying data:', err);
        db.close();
        return;
      }
      console.log('✅ Data copied');
      
      // Step 3: Drop old table
      console.log('Dropping old table...');
      db.run('DROP TABLE workpackages', (err) => {
        if (err) {
          console.error('Error dropping old table:', err);
          db.close();
          return;
        }
        console.log('✅ Old table dropped');
        
        // Step 4: Rename new table to original name
        console.log('Renaming new table...');
        db.run('ALTER TABLE workpackages_new RENAME TO workpackages', (err) => {
          if (err) {
            console.error('Error renaming table:', err);
            db.close();
            return;
          }
          console.log('✅ Table renamed');
          
          // Step 5: Recreate indexes if any
          console.log('\n✅ Migration complete!');
          console.log('The workpackages table now supports all status values including:');
          console.log('  - IN_PROGRESS_TECH');
          console.log('  - READY_FOR_REVIEW');
          console.log('  - And all original statuses\n');
          
          db.close();
        });
      });
    });
  });
});

