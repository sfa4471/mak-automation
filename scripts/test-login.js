/**
 * Test Login Credentials
 * 
 * This script tests if the admin user can be found and if the password matches.
 * 
 * Usage:
 *   node scripts/test-login.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../server/db');

const adminEmail = 'admin@maklonestar.com';
const adminPassword = 'admin123';

async function testLogin() {
  try {
    console.log('🔍 Testing login credentials...\n');
    
    const isSupabase = db.isSupabase();
    const isSQLite = db.isSQLite();
    
    if (isSupabase) {
      console.log('📊 Using Supabase database\n');
    } else if (isSQLite) {
      console.log('📊 Using SQLite database\n');
    }
    
    console.log(`🔍 Looking for user: ${adminEmail}`);
    
    // Try to get user
    const user = await db.get('users', { email: adminEmail });
    
    if (!user) {
      console.error(`❌ User not found: ${adminEmail}`);
      console.log('\n💡 Run: npm run create-admin');
      process.exit(1);
    }
    
    console.log(`✅ User found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password hash: ${user.password.substring(0, 20)}...`);
    
    // Test password
    console.log(`\n🔐 Testing password: ${adminPassword}`);
    const passwordMatch = bcrypt.compareSync(adminPassword, user.password);
    
    if (passwordMatch) {
      console.log(`✅ Password matches!`);
      console.log(`\n🎉 Login should work with:`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
    } else {
      console.log(`❌ Password does NOT match!`);
      console.log(`\n💡 Run: npm run create-admin`);
      console.log(`   This will reset the password to: ${adminPassword}`);
    }
    
    // Also test with normalized email (as the validator does)
    const { body } = require('express-validator');
    const normalizeEmail = require('express-validator').body('email').normalizeEmail();
    
    // Manual normalization (same as express-validator)
    let normalizedEmail = adminEmail.toLowerCase().trim();
    
    console.log(`\n🔍 Testing with normalized email: ${normalizedEmail}`);
    const normalizedUser = await db.get('users', { email: normalizedEmail });
    
    if (normalizedUser) {
      console.log(`✅ User found with normalized email`);
      const normalizedPasswordMatch = bcrypt.compareSync(adminPassword, normalizedUser.password);
      if (normalizedPasswordMatch) {
        console.log(`✅ Password matches with normalized email!`);
      } else {
        console.log(`❌ Password does NOT match with normalized email!`);
      }
    } else {
      console.log(`⚠️  User NOT found with normalized email`);
      console.log(`   This might be the issue - email normalization mismatch`);
    }
    
    process.exit(passwordMatch ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error testing login:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testLogin();
