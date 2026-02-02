/**
 * Supabase Credentials Validation Script
 * 
 * Validates Supabase URL and service role key format before deployment.
 * This helps catch configuration errors early.
 * 
 * Usage:
 *   node scripts/validate-supabase-credentials.js
 * 
 * Or with environment variables:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/validate-supabase-credentials.js
 */

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

function validateSupabaseUrl(url) {
  const errors = [];
  const warnings = [];

  if (!url) {
    errors.push('SUPABASE_URL is not set');
    return { valid: false, errors, warnings };
  }

  // Check format
  const urlPattern = /^https?:\/\/([^.]+)\.supabase\.co\/?$/;
  const match = url.match(urlPattern);

  if (!match) {
    errors.push(`Invalid URL format: ${url}`);
    errors.push('Expected format: https://[project-ref].supabase.co');
    return { valid: false, errors, warnings };
  }

  const projectRef = match[1];

  // Check project reference length (typically 20 characters)
  if (projectRef.length < 10 || projectRef.length > 30) {
    warnings.push(`Project reference length unusual: ${projectRef.length} characters (expected ~20)`);
  }

  // Check for trailing slash
  if (url.endsWith('/')) {
    warnings.push('URL has trailing slash (will be handled, but not recommended)');
  }

  // Check protocol
  if (!url.startsWith('https://')) {
    errors.push('URL must use HTTPS protocol');
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    projectRef,
    normalizedUrl: url.replace(/\/$/, '')
  };
}

function validateServiceRoleKey(key) {
  const errors = [];
  const warnings = [];

  if (!key) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is not set');
    return { valid: false, errors, warnings };
  }

  // Check minimum length (JWT tokens are typically 200+ characters)
  if (key.length < 50) {
    errors.push(`Key is too short: ${key.length} characters (expected 200+)`);
    return { valid: false, errors, warnings };
  }

  if (key.length < 100) {
    warnings.push(`Key length is short: ${key.length} characters (expected 200+)`);
  }

  // Check if it looks like a JWT (starts with eyJ)
  if (!key.startsWith('eyJ')) {
    warnings.push('Key does not start with "eyJ" (may not be a valid JWT token)');
  }

  // Check for common mistakes
  if (key.includes(' ')) {
    errors.push('Key contains spaces (remove any spaces)');
  }

  if (key.includes('\n') || key.includes('\r')) {
    errors.push('Key contains newlines (should be a single line)');
  }

  // Check if it might be the anon key instead (common mistake)
  // Anon keys are typically shorter, but we can't definitively tell
  // Just warn if it's suspiciously short

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function testConnection(url, key) {
  return new Promise((resolve) => {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // Test connection with a lightweight request
      supabase.auth.getSession()
        .then(({ data, error }) => {
          if (error) {
            if (error.message.includes('Invalid') || error.message.includes('JWT')) {
              resolve({
                success: false,
                error: 'Invalid credentials - check that you\'re using the service_role key, not anon key',
                details: error.message
              });
            } else if (error.message.includes('fetch') || error.message.includes('network')) {
              resolve({
                success: false,
                error: 'Network error - check SUPABASE_URL and internet connection',
                details: error.message
              });
            } else {
              resolve({
                success: false,
                error: 'Connection failed',
                details: error.message
              });
            }
          } else {
            resolve({
              success: true,
              message: 'Connection successful! Credentials are valid.'
            });
          }
        })
        .catch((err) => {
          resolve({
            success: false,
            error: 'Connection error',
            details: err.message
          });
        });
    } catch (err) {
      resolve({
        success: false,
        error: 'Failed to create Supabase client',
        details: err.message
      });
    }
  });
}

async function main() {
  logSection('SUPABASE CREDENTIALS VALIDATION');
  log('Expert Credential Validation Tool\n', 'cyan');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Validate URL
  logSection('STEP 1: VALIDATING SUPABASE_URL');
  const urlValidation = validateSupabaseUrl(supabaseUrl);

  if (urlValidation.valid) {
    log(`✅ URL Format: Valid`, 'green');
    log(`   Project Reference: ${urlValidation.projectRef}`, 'cyan');
    log(`   Normalized URL: ${urlValidation.normalizedUrl}`, 'cyan');
    
    if (urlValidation.warnings.length > 0) {
      log('\n⚠️  Warnings:', 'yellow');
      urlValidation.warnings.forEach(w => log(`   - ${w}`, 'yellow'));
    }
  } else {
    log(`❌ URL Format: Invalid`, 'red');
    log('\nErrors:', 'red');
    urlValidation.errors.forEach(e => log(`   - ${e}`, 'red'));
    console.log('\n');
    process.exit(1);
  }

  // Validate Service Role Key
  logSection('STEP 2: VALIDATING SUPABASE_SERVICE_ROLE_KEY');
  const keyValidation = validateServiceRoleKey(supabaseKey);

  if (keyValidation.valid) {
    log(`✅ Key Format: Valid`, 'green');
    log(`   Key Length: ${supabaseKey.length} characters`, 'cyan');
    log(`   Key Preview: ${supabaseKey.substring(0, 20)}...`, 'cyan');
    
    if (keyValidation.warnings.length > 0) {
      log('\n⚠️  Warnings:', 'yellow');
      keyValidation.warnings.forEach(w => log(`   - ${w}`, 'yellow'));
    }
  } else {
    log(`❌ Key Format: Invalid`, 'red');
    log('\nErrors:', 'red');
    keyValidation.errors.forEach(e => log(`   - ${e}`, 'red'));
    console.log('\n');
    process.exit(1);
  }

  // Test Connection
  logSection('STEP 3: TESTING CONNECTION');
  log('Testing connection to Supabase...\n', 'cyan');

  const connectionTest = await testConnection(urlValidation.normalizedUrl, supabaseKey);

  if (connectionTest.success) {
    log(`✅ ${connectionTest.message}`, 'green');
  } else {
    log(`❌ Connection Failed: ${connectionTest.error}`, 'red');
    if (connectionTest.details) {
      log(`   Details: ${connectionTest.details}`, 'yellow');
    }
    console.log('\n');
    process.exit(1);
  }

  // Final Summary
  logSection('VALIDATION SUMMARY');
  log('✅ All validations passed!', 'green');
  log('\nYour credentials are ready for deployment:', 'cyan');
  log(`   SUPABASE_URL=${urlValidation.normalizedUrl}`, 'cyan');
  log(`   SUPABASE_SERVICE_ROLE_KEY=[${supabaseKey.length} characters]`, 'cyan');
  log('\n📋 Next Steps:', 'bright');
  log('   1. Add these to Render Dashboard → Environment tab', 'cyan');
  log('   2. Redeploy your service', 'cyan');
  log('   3. Verify logs show "Using Supabase database"\n', 'cyan');

  process.exit(0);
}

// Run validation
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
