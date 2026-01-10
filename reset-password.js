const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

// Get email and new password from command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node reset-password.js <email> <new-password>');
  console.log('Example: node reset-password.js info@thefit925.com newpassword123');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.log('Error: Password must be at least 6 characters long');
  process.exit(1);
}

// Check if user exists
db.get('SELECT id, email, name, role FROM users WHERE email = ?', [email], (err, user) => {
  if (err) {
    console.error('Database error:', err);
    process.exit(1);
  }

  if (!user) {
    console.log(`Error: User with email "${email}" not found`);
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email}) - Role: ${user.role}`);

  // Hash the new password
  const hashedPassword = bcrypt.hashSync(newPassword, 10);

  // Update password
  db.run(
    'UPDATE users SET password = ? WHERE email = ?',
    [hashedPassword, email],
    function(err) {
      if (err) {
        console.error('Error updating password:', err);
        process.exit(1);
      }

      console.log(`\n✅ Password reset successfully!`);
      console.log(`Email: ${email}`);
      console.log(`New Password: ${newPassword}`);
      console.log(`\nYou can now login with these credentials.`);
      
      db.close();
      process.exit(0);
    }
  );
});

