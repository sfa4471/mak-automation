const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

console.log('Updating task types in database...');
console.log('1. Renaming COMPRESSIVE_STRENGTH_FIELD_REPORT to COMPRESSIVE_STRENGTH');
console.log('2. Removing PROCTOR_REPORT, DENSITY_MEASUREMENT_REPORT, REBAR_REPORT');

db.serialize(() => {
  // Step 1: Update COMPRESSIVE_STRENGTH_FIELD_REPORT to COMPRESSIVE_STRENGTH
  db.run(
    `UPDATE tasks SET taskType = 'COMPRESSIVE_STRENGTH' WHERE taskType = 'COMPRESSIVE_STRENGTH_FIELD_REPORT'`,
    function(err) {
      if (err) {
        console.error('Error updating COMPRESSIVE_STRENGTH_FIELD_REPORT:', err.message);
      } else {
        console.log(`✓ Updated ${this.changes} task(s) from COMPRESSIVE_STRENGTH_FIELD_REPORT to COMPRESSIVE_STRENGTH`);
      }
    }
  );

  // Step 2: Delete tasks with removed types (optional - you may want to keep them for history)
  // Uncomment the following if you want to delete these tasks:
  /*
  db.run(
    `DELETE FROM tasks WHERE taskType IN ('PROCTOR_REPORT', 'DENSITY_MEASUREMENT_REPORT', 'REBAR_REPORT')`,
    function(err) {
      if (err) {
        console.error('Error deleting removed task types:', err.message);
      } else {
        console.log(`✓ Deleted ${this.changes} task(s) with removed task types`);
      }
    }
  );
  */

  // Note: SQLite doesn't support modifying CHECK constraints on existing tables
  // The constraint in database.js will apply to new tables, but existing tables
  // will continue to work with the old constraint. The application code will
  // enforce the new constraints.

  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('✅ Migration completed successfully!');
      console.log('\nNote: SQLite cannot modify CHECK constraints on existing tables.');
      console.log('The application code will enforce the new task type constraints.');
      console.log('Existing tasks with old types will still work, but new tasks must use the new types.');
    }
  });
});

