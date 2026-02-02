/**
 * Pre-Deployment Validation Script
 * 
 * Validates configuration before deployment to catch issues early.
 * Checks environment variables, credentials, and code configuration.
 * 
 * Usage:
 *   node scripts/pre-deployment-check.js
 * 
 * This script should be run before deploying to production.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  warnings_list: []
};

function addPass(message) {
  checks.passed++;
  log(`  ✅ ${message}`, 'green');
}

function addFail(message, error = null) {
  checks.failed++;
  checks.errors.push(message);
  log(`  ❌ ${message}`, 'red');
  if (error) {
    log(`     ${error}`, 'yellow');
  }
}

function addWarning(message) {
  checks.warnings++;
  checks.warnings_list.push(message);
  log(`  ⚠️  ${message}`, 'yellow');
}

async function checkEnvironmentVariables() {
  logSection('CHECK 1: ENVIRONMENT VARIABLES');
  
  const requiredVars = {
    'SUPABASE_URL': {
      required: true,
      description: 'Supabase project URL'
    },
    'SUPABASE_SERVICE_ROLE_KEY': {
      required: true,
      description: 'Supabase service role key'
    }
  };

  const optionalVars = {
    'REQUIRE_SUPABASE': {
      description: 'Make Supabase required (prevents SQLite fallback)'
    },
    'JWT_SECRET': {
      description: 'JWT secret for token signing'
    },
    'NODE_ENV': {
      description: 'Node environment (production/development)'
    },
    'PORT': {
      description: 'Server port'
    }
  };

  log('\nRequired Variables:', 'cyan');
  for (const [varName, config] of Object.entries(requiredVars)) {
    const value = process.env[varName];
    if (value) {
      if (varName.includes('KEY') || varName.includes('SECRET')) {
        addPass(`${varName} is set (${value.length} characters)`);
      } else {
        addPass(`${varName} is set: ${value}`);
      }
    } else {
      addFail(`${varName} is not set - ${config.description}`);
    }
  }

  log('\nOptional Variables:', 'cyan');
  for (const [varName, config] of Object.entries(optionalVars)) {
    const value = process.env[varName];
    if (value) {
      addPass(`${varName} is set: ${value}`);
    } else {
      addWarning(`${varName} is not set - ${config.description}`);
    }
  }
}

async function checkSupabaseConfiguration() {
  logSection('CHECK 2: SUPABASE CONFIGURATION');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    addFail('Supabase credentials not configured - cannot validate');
    return;
  }

  // Validate URL format
  const urlPattern = /^https?:\/\/([^.]+)\.supabase\.co\/?$/;
  if (urlPattern.test(supabaseUrl)) {
    addPass('SUPABASE_URL format is valid');
  } else {
    addFail('SUPABASE_URL format is invalid', 'Expected: https://[project-ref].supabase.co');
  }

  // Validate key length
  if (supabaseKey.length >= 100) {
    addPass(`SUPABASE_SERVICE_ROLE_KEY length is valid (${supabaseKey.length} chars)`);
  } else {
    addFail('SUPABASE_SERVICE_ROLE_KEY is too short', `Only ${supabaseKey.length} characters`);
  }

  // Check if key looks like JWT
  if (supabaseKey.startsWith('eyJ')) {
    addPass('SUPABASE_SERVICE_ROLE_KEY format looks correct (JWT token)');
  } else {
    addWarning('SUPABASE_SERVICE_ROLE_KEY does not start with "eyJ" (may not be JWT)');
  }

  // Test connection if possible
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl.replace(/\/$/, ''), supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    log('\n  Testing connection...', 'cyan');
    const { error } = await supabase.auth.getSession();
    
    if (error) {
      if (error.message.includes('Invalid') || error.message.includes('JWT')) {
        addFail('Supabase connection failed - Invalid credentials', error.message);
      } else {
        addWarning('Supabase connection test failed', error.message);
      }
    } else {
      addPass('Supabase connection test successful');
    }
  } catch (err) {
    addWarning('Could not test Supabase connection', err.message);
  }
}

async function checkCodeConfiguration() {
  logSection('CHECK 3: CODE CONFIGURATION');
  
  // Check if server/index.js exists
  const serverIndexPath = path.join(__dirname, '../server/index.js');
  if (fs.existsSync(serverIndexPath)) {
    addPass('server/index.js exists');
    
    // Check if it requires supabase validation
    const content = fs.readFileSync(serverIndexPath, 'utf8');
    if (content.includes('validateConfiguration')) {
      addPass('Supabase validation is configured in server/index.js');
    } else {
      addWarning('Supabase validation not found in server/index.js');
    }
  } else {
    addFail('server/index.js not found');
  }

  // Check if supabase client exists
  const supabaseClientPath = path.join(__dirname, '../server/db/supabase.js');
  if (fs.existsSync(supabaseClientPath)) {
    addPass('server/db/supabase.js exists');
  } else {
    addFail('server/db/supabase.js not found');
  }

  // Check if SQLite fallback exists
  const sqlitePath = path.join(__dirname, '../server/database.js');
  if (fs.existsSync(sqlitePath)) {
    addWarning('SQLite fallback exists (ensure Supabase is configured in production)');
  }
}

async function checkPackageDependencies() {
  logSection('CHECK 4: PACKAGE DEPENDENCIES');
  
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (!fs.existsSync(packageJsonPath)) {
    addFail('package.json not found');
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const requiredPackages = {
    '@supabase/supabase-js': 'Supabase client',
    'express': 'Express server',
    'dotenv': 'Environment variable loading',
    'pg': 'PostgreSQL client (for direct DB access)'
  };

  for (const [pkg, description] of Object.entries(requiredPackages)) {
    if (dependencies[pkg]) {
      addPass(`${pkg} is installed (${dependencies[pkg]})`);
    } else {
      addFail(`${pkg} is not installed - ${description}`);
    }
  }
}

async function checkMigrationFiles() {
  logSection('CHECK 5: MIGRATION FILES');
  
  const migrationsPath = path.join(__dirname, '../supabase/migrations');
  if (fs.existsSync(migrationsPath)) {
    addPass('supabase/migrations directory exists');
    
    const files = fs.readdirSync(migrationsPath);
    const sqlFiles = files.filter(f => f.endsWith('.sql'));
    
    if (sqlFiles.length > 0) {
      addPass(`Found ${sqlFiles.length} migration file(s)`);
      sqlFiles.forEach(file => {
        log(`     - ${file}`, 'cyan');
      });
    } else {
      addWarning('No SQL migration files found');
    }
  } else {
    addWarning('supabase/migrations directory not found');
  }
}

function provideRecommendations() {
  logSection('RECOMMENDATIONS');
  
  if (checks.failed === 0 && checks.warnings === 0) {
    log('✅ All checks passed! Ready for deployment.', 'green');
    log('\n📋 Deployment Checklist:', 'cyan');
    log('   1. ✅ Environment variables configured', 'green');
    log('   2. ✅ Supabase credentials validated', 'green');
    log('   3. ✅ Code configuration verified', 'green');
    log('   4. ✅ Dependencies installed', 'green');
    log('   5. → Add environment variables to Render Dashboard', 'cyan');
    log('   6. → Redeploy service', 'cyan');
    log('   7. → Verify logs show "Using Supabase database"\n', 'cyan');
  } else {
    if (checks.failed > 0) {
      log('❌ Critical issues found - must fix before deployment:', 'red');
      checks.errors.forEach((error, i) => {
        log(`   ${i + 1}. ${error}`, 'red');
      });
    }
    
    if (checks.warnings > 0) {
      log('\n⚠️  Warnings (should review):', 'yellow');
      checks.warnings_list.forEach((warning, i) => {
        log(`   ${i + 1}. ${warning}`, 'yellow');
      });
    }
    
    log('\n📋 Next Steps:', 'cyan');
    if (checks.failed > 0) {
      log('   1. Fix all critical issues above', 'cyan');
      log('   2. Run this script again to verify', 'cyan');
    } else {
      log('   1. Review warnings above', 'cyan');
      log('   2. Add environment variables to Render Dashboard', 'cyan');
      log('   3. Redeploy service', 'cyan');
    }
    console.log();
  }
}

async function main() {
  logSection('PRE-DEPLOYMENT VALIDATION');
  log('Expert Pre-Deployment Check Tool\n', 'cyan');
  log('This script validates your configuration before deployment.\n', 'blue');

  await checkEnvironmentVariables();
  await checkSupabaseConfiguration();
  await checkCodeConfiguration();
  await checkPackageDependencies();
  await checkMigrationFiles();

  // Final Summary
  logSection('VALIDATION SUMMARY');
  
  log(`\nResults:`, 'cyan');
  log(`  ✅ Passed: ${checks.passed}`, 'green');
  log(`  ❌ Failed: ${checks.failed}`, checks.failed > 0 ? 'red' : 'green');
  log(`  ⚠️  Warnings: ${checks.warnings}`, checks.warnings > 0 ? 'yellow' : 'green');

  const totalChecks = checks.passed + checks.failed;
  const successRate = totalChecks > 0 ? (checks.passed / totalChecks * 100).toFixed(1) : 0;
  
  log(`\nSuccess Rate: ${successRate}%`, successRate === 100 ? 'green' : 'yellow');

  provideRecommendations();

  // Exit with appropriate code
  process.exit(checks.failed > 0 ? 1 : 0);
}

// Run checks
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
