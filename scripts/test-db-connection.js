/**
 * Test Database Connection
 * Tests the database password and connection
 */

require('dotenv').config();
const { Pool } = require('pg');

const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD || '-Z&4h7*CsXE8T7-';
const supabaseUrl = process.env.SUPABASE_URL || 'https://hyjuxclsksbyaimvzulq.supabase.co';

// Extract project reference
const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
if (!urlMatch) {
  console.error('Invalid SUPABASE_URL format');
  process.exit(1);
}

const projectRef = urlMatch[1];
const encodedPassword = encodeURIComponent(password);
const databaseUrl = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;

console.log('Testing database connection...');
console.log('Project Ref:', projectRef);
console.log('Host:', `db.${projectRef}.supabase.co`);
console.log('Password length:', password.length);
console.log('');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000
});

pool.query('SELECT NOW() as current_time, version() as pg_version')
  .then(result => {
    console.log('✅ Connection successful!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    console.log('');
    console.log('✅ Password is correct!');
    return pool.end();
  })
  .then(() => {
    console.log('');
    console.log('You can now run: npm run supabase:execute-and-verify');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Connection failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('');
      console.error('DNS resolution failed. Possible issues:');
      console.error('1. Project might be paused - check Supabase Dashboard');
      console.error('2. Network connectivity issue');
      console.error('3. Hostname format might be incorrect');
    } else if (error.code === '28P01' || error.message.includes('password')) {
      console.error('');
      console.error('❌ Password authentication failed');
      console.error('Please check the password is correct');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('Connection timeout or refused');
      console.error('Check if the database is accessible');
    }
    
    process.exit(1);
  });
