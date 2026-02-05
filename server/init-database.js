/**
 * Initialize SQLite Database
 * Creates all tables and default users if they don't exist
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

// Default credentials
const DEFAULT_ADMIN_EMAIL = 'admin@maklonestar.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_TECH_EMAIL = 'info@thefit925.com';
const DEFAULT_TECH_PASSWORD = 'yournewpassword123';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const TECH_EMAIL = process.env.TECH_EMAIL || DEFAULT_TECH_EMAIL;
const TECH_PASSWORD = process.env.TECH_PASSWORD || DEFAULT_TECH_PASSWORD;

console.log('Initializing database...');

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
    name TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
      process.exit(1);
    } else {
      console.log('✅ Users table created/verified');
    }
  });

  // Create default admin user if not exists
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'", (err, row) => {
    if (err) {
      console.error('Error checking admin:', err);
      return;
    }
    if (row.count === 0) {
      const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      db.run(
        "INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)",
        [ADMIN_EMAIL, hashedPassword, 'ADMIN', 'Admin User'],
        (err) => {
          if (err) {
            console.error('Error creating admin:', err);
          } else {
            console.log(`✅ Default admin created: ${ADMIN_EMAIL}`);
          }
          db.close();
          console.log('\n✅ Database initialization complete!');
          process.exit(0);
        }
      );
    } else {
      console.log('✅ Admin user already exists');
      db.close();
      console.log('\n✅ Database initialization complete!');
      process.exit(0);
    }
  });
});
