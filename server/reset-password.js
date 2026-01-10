const db = require('./database');
const bcrypt = require('bcryptjs');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node server/reset-password.js <email> <new-password>');
  process.exit(1);
}

// Hash the new password
const hashedPassword = bcrypt.hashSync(newPassword, 10);

// Update the password
db.run(
  'UPDATE users SET password = ? WHERE email = ?',
  [hashedPassword, email],
  function(err) {
    if (err) {
      console.error('Error resetting password:', err);
      process.exit(1);
    }
    
    if (this.changes === 0) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Password reset successfully for ${email}`);
    process.exit(0);
  }
);

