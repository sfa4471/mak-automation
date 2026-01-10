const db = require('./database');

console.log('Starting migration: Adding tasks table columns...');

db.serialize(() => {
  // Add taskId column to wp1_data if it doesn't exist
  db.run(`ALTER TABLE wp1_data ADD COLUMN taskId INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding taskId to wp1_data:', err);
    } else {
      console.log('Added taskId column to wp1_data');
    }
  });

  // Add relatedTaskId column to notifications if it doesn't exist
  db.run(`ALTER TABLE notifications ADD COLUMN relatedTaskId INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding relatedTaskId to notifications:', err);
    } else {
      console.log('Added relatedTaskId column to notifications');
    }
  });

  // Migration complete
  setTimeout(() => {
    console.log('Migration complete!');
    process.exit(0);
  }, 1000);
});

