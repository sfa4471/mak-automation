/**
 * Adds Supabase environment variables to .env file
 * Run: node setup-supabase-env.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env or .env
 * Example: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node setup-supabase-env.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.log('Usage: Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env, then run this script.');
  console.log('Or: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node setup-supabase-env.js');
  process.exit(1);
}

const envPath = path.join(__dirname, '.env');
const supabaseVars = `
# Supabase (added by setup-supabase-env.js)
SUPABASE_URL=${url}
SUPABASE_ANON_KEY=${anonKey || ''}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey}
`;

try {
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('SUPABASE_URL')) {
      console.log('✓ Supabase vars already in .env');
      process.exit(0);
      return;
    }
  }
  fs.appendFileSync(envPath, supabaseVars, 'utf8');
  console.log('✅ Added Supabase vars to .env');
  console.log('\nRun: node verify-supabase.js');
} catch (err) {
  console.error('Could not write to .env:', err.message);
  console.log('\nAdd these lines to your .env file manually:');
  console.log(supabaseVars);
}
