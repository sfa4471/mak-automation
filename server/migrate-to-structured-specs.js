const db = require('./database');

console.log('Starting migration: Adding structured project specs...');

db.serialize(() => {
  // Add new columns to projects table if they don't exist
  db.run(`ALTER TABLE projects ADD COLUMN specStrengthPsi TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding specStrengthPsi:', err);
    } else {
      console.log('Added specStrengthPsi column');
    }
  });

  db.run(`ALTER TABLE projects ADD COLUMN specAmbientTempF TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding specAmbientTempF:', err);
    } else {
      console.log('Added specAmbientTempF column');
    }
  });

  db.run(`ALTER TABLE projects ADD COLUMN specConcreteTempF TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding specConcreteTempF:', err);
    } else {
      console.log('Added specConcreteTempF column');
    }
  });

  db.run(`ALTER TABLE projects ADD COLUMN specSlump TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding specSlump:', err);
    } else {
      console.log('Added specSlump column');
    }
  });

  db.run(`ALTER TABLE projects ADD COLUMN specAirContentByVolume TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding specAirContentByVolume:', err);
    } else {
      console.log('Added specAirContentByVolume column');
    }
  });

  db.run(`ALTER TABLE projects ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding updatedAt:', err);
    } else {
      console.log('Added updatedAt column');
    }
  });

  // Migration complete
  setTimeout(() => {
    console.log('Migration complete!');
    process.exit(0);
  }, 1000);
});

