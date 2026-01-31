const db = require('./database');

console.log('Starting migration: Project numbering and specs update...');

db.serialize(() => {
  // Create project_counters table for atomic project number generation
  db.run(`
    CREATE TABLE IF NOT EXISTS project_counters (
      year INTEGER PRIMARY KEY,
      nextSeq INTEGER NOT NULL DEFAULT 1,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating project_counters table:', err);
      process.exit(1);
    }
    console.log('✅ Created project_counters table');
  });

  // Add new columns to projects table (keeping old columns for backward compatibility)
  db.run(`
    ALTER TABLE projects 
    ADD COLUMN customerEmails TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding customerEmails column:', err);
    } else if (!err) {
      console.log('✅ Added customerEmails column');
    }
  });

  db.run(`
    ALTER TABLE projects 
    ADD COLUMN soilSpecs TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding soilSpecs column:', err);
    } else if (!err) {
      console.log('✅ Added soilSpecs column');
    }
  });

  db.run(`
    ALTER TABLE projects 
    ADD COLUMN concreteSpecs TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding concreteSpecs column:', err);
    } else if (!err) {
      console.log('✅ Added concreteSpecs column');
    }
  });

  // Add updatedAt column if it doesn't exist
  // SQLite doesn't support CURRENT_TIMESTAMP in ALTER TABLE, so add without default
  db.run(`
    ALTER TABLE projects 
    ADD COLUMN updatedAt DATETIME
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding updatedAt column:', err);
    } else if (!err) {
      console.log('✅ Added updatedAt column');
      // Set initial value for existing rows
      db.run("UPDATE projects SET updatedAt = createdAt WHERE updatedAt IS NULL", (updateErr) => {
        if (updateErr) {
          console.error('Error setting initial updatedAt values:', updateErr);
        }
      });
    }
  });

  // Migrate existing customerEmail to customerEmails array (if exists and not null)
  db.all('SELECT id, customerEmail FROM projects WHERE customerEmail IS NOT NULL AND customerEmail != ""', [], (err, rows) => {
    if (err) {
      console.error('Error reading projects for migration:', err);
      return;
    }

    if (rows.length > 0) {
      let migrated = 0;
      rows.forEach((row) => {
        const emailsArray = JSON.stringify([row.customerEmail]);
        db.run('UPDATE projects SET customerEmails = ? WHERE id = ?', [emailsArray, row.id], (updateErr) => {
          if (updateErr) {
            console.error(`Error migrating customerEmail for project ${row.id}:`, updateErr);
          } else {
            migrated++;
            if (migrated === rows.length) {
              console.log(`✅ Migrated ${migrated} customerEmail values to customerEmails array`);
              console.log('\n✅ Migration completed successfully!');
              process.exit(0);
            }
          }
        });
      });
    } else {
      console.log('✅ No existing customerEmail values to migrate');
      console.log('\n✅ Migration completed successfully!');
      process.exit(0);
    }
  });
});
