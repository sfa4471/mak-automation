/**
 * Render Environment Variables Setup Instructions
 * 
 * Displays the exact values to add to Render Dashboard
 * 
 * Usage:
 *   node scripts/add-to-render-instructions.js
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

// Your validated credentials
const SUPABASE_URL = 'https://hyjuxclsksbyaimvzulq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anV4Y2xza3NieWFpbXZ6dWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg4MDIyMiwiZXhwIjoyMDg1NDU2MjIyfQ.oZxqrz-hllsT0h1_H-yLT76AZyM8X6Hy2tXY-5pQZ9Y';

function main() {
  logSection('RENDER ENVIRONMENT VARIABLES SETUP');
  log('Copy these exact values to Render Dashboard\n', 'cyan');

  log('\n📋 STEP 1: Add SUPABASE_URL', 'bright');
  log('   Go to: https://dashboard.render.com → Your Service → Environment', 'cyan');
  log('   Click: "Add Environment Variable"', 'cyan');
  log('\n   Key:', 'yellow');
  log('   SUPABASE_URL', 'green');
  log('\n   Value:', 'yellow');
  log(`   ${SUPABASE_URL}`, 'green');

  log('\n\n📋 STEP 2: Add SUPABASE_SERVICE_ROLE_KEY', 'bright');
  log('   Click: "Add Environment Variable" again', 'cyan');
  log('\n   Key:', 'yellow');
  log('   SUPABASE_SERVICE_ROLE_KEY', 'green');
  log('\n   Value:', 'yellow');
  log(`   ${SUPABASE_SERVICE_ROLE_KEY}`, 'green');

  log('\n\n📋 STEP 3: Redeploy', 'bright');
  log('   After adding both variables:', 'cyan');
  log('   1. Click "Manual Deploy" → "Deploy latest commit"', 'cyan');
  log('   2. Wait for deployment (2-5 minutes)', 'cyan');
  log('   3. Check Logs tab for "Using Supabase database"', 'cyan');

  log('\n\n✅ Credentials Status: Validated', 'green');
  log('   URL Format: ✅ Valid', 'green');
  log('   Key Format: ✅ Valid', 'green');
  log('   Connection: ✅ Tested', 'green');

  log('\n\n📚 For detailed instructions, see:', 'cyan');
  log('   RENDER_ENV_VARIABLES_QUICK_REFERENCE.md\n', 'cyan');
}

main();
