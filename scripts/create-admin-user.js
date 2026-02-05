/**
 * Create or Reset Admin User
 * 
 * This script creates the default admin user in the database (Supabase or SQLite).
 * If the admin user already exists, it will reset the password.
 * 
 * Usage:
 *   node scripts/create-admin-user.js
 *   node scripts/create-admin-user.js admin@maklonestar.com admin123
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../server/db');

// Default credentials
const DEFAULT_ADMIN_EMAIL = 'admin@maklonestar.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

// Get credentials from command line or use defaults
const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

async function createAdminUser() {
  try {
    console.log('🔍 Checking database connection...\n');
    
    const isSupabase = db.isSupabase();
    const isSQLite = db.isSQLite();
    
    if (isSupabase) {
      console.log('📊 Using Supabase database\n');
    } else if (isSQLite) {
      console.log('📊 Using SQLite database\n');
    } else {
      console.error('❌ No database connection available');
      process.exit(1);
    }
    
    console.log(`🔍 Checking if admin user exists: ${adminEmail}`);
    
    // Check if admin user exists
    const existingUser = await db.get('users', { email: adminEmail });
    
    if (existingUser) {
      console.log(`✅ Admin user found: ${existingUser.name || adminEmail} (ID: ${existingUser.id})`);
      console.log(`🔄 Resetting password...`);
      
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      await db.update('users', 
        { 
          password: hashedPassword,
          name: existingUser.name || 'Admin User'
        },
        { email: adminEmail }
      );
      
      console.log(`\n✅ Password reset successfully!`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log(`   Role: ${existingUser.role}`);
    } else {
      console.log(`➕ Admin user not found. Creating new admin user...`);
      
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      const newUser = await db.insert('users', {
        email: adminEmail,
        password: hashedPassword,
        role: 'ADMIN',
        name: 'Admin User'
      });
      
      console.log(`\n✅ Admin user created successfully!`);
      console.log(`   ID: ${newUser.id}`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log(`   Role: ADMIN`);
    }
    
    console.log(`\n🎉 You can now login with these credentials.`);
    console.log(`   Frontend: http://localhost:3000`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating admin user:');
    console.error(error.message);
    
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      console.error('\n💡 The user might already exist. Try resetting the password instead.');
    }
    
    process.exit(1);
  }
}

// Run the script
createAdminUser();
