const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration: Ensuring density_reports table exists with all required columns...\n');

db.serialize(() => {
  // Check if table exists
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='density_reports'", (err, row) => {
    if (err) {
      console.error('Error checking table:', err);
      db.close();
      return;
    }

    if (!row) {
      // Table doesn't exist - create it
      console.log('Creating density_reports table...');
      db.run(`
        CREATE TABLE density_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          taskId INTEGER NOT NULL UNIQUE,
          clientName TEXT,
          datePerformed TEXT,
          structure TEXT,
          structureType TEXT,
          testRows TEXT,
          proctors TEXT,
          densSpecPercent TEXT,
          moistSpecMin TEXT,
          moistSpecMax TEXT,
          gaugeNo TEXT,
          stdDensityCount TEXT,
          stdMoistCount TEXT,
          transDepthIn TEXT,
          methodD2922 INTEGER DEFAULT 1,
          methodD3017 INTEGER DEFAULT 1,
          methodD698 INTEGER DEFAULT 1,
          remarks TEXT,
          techName TEXT,
          technicianId INTEGER,
          timeStr TEXT,
          specDensityPct TEXT,
          proctorTaskId INTEGER,
          proctorOptMoisture TEXT,
          proctorMaxDensity TEXT,
          proctorSoilClassification TEXT,
          proctorSoilClassificationText TEXT,
          proctorDescriptionLabel TEXT,
          lastEditedByRole TEXT,
          lastEditedByUserId INTEGER,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (taskId) REFERENCES tasks(id),
          FOREIGN KEY (technicianId) REFERENCES users(id)
        )
      `, (createErr) => {
        if (createErr) {
          console.error('Error creating table:', createErr);
          db.close();
          return;
        }
        console.log('✅ Created density_reports table');
        db.close();
      });
    } else {
      // Table exists - check for missing columns
      console.log('Table exists, checking for missing columns...');
      db.all("PRAGMA table_info(density_reports)", (err, columns) => {
        if (err) {
          console.error('Error checking columns:', err);
          db.close();
          return;
        }

        const columnNames = columns.map(col => col.name);
        const requiredColumns = {
          'clientName': 'TEXT',
          'datePerformed': 'TEXT',
          'structure': 'TEXT',
          'structureType': 'TEXT'
        };

        const missingColumns = [];
        for (const [colName, colType] of Object.entries(requiredColumns)) {
          if (!columnNames.includes(colName)) {
            missingColumns.push({ name: colName, type: colType });
          }
        }

        if (missingColumns.length === 0) {
          console.log('✅ All required columns exist');
        } else {
          console.log(`Adding ${missingColumns.length} missing column(s)...`);
          let added = 0;
          missingColumns.forEach(({ name, type }) => {
            db.run(`ALTER TABLE density_reports ADD COLUMN ${name} ${type}`, (alterErr) => {
              if (alterErr && !alterErr.message.includes('duplicate column')) {
                console.error(`Error adding column ${name}:`, alterErr);
              } else {
                console.log(`✅ Added column: ${name}`);
                added++;
                if (added === missingColumns.length) {
                  console.log('\n✅ Migration completed successfully!');
                  db.close();
                }
              }
            });
          });
          
          // If no columns needed to be added, close immediately
          if (missingColumns.length === 0) {
            db.close();
          }
        }
      });
    }
  });
});
