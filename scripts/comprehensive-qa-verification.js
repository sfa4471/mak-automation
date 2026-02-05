/**
 * Comprehensive QA Verification Script
 * 
 * Expert QA Engineer (20+ years experience) - Full Stack Verification
 * 
 * This script performs comprehensive QA verification for:
 * 1. Backend API endpoints and routes
 * 2. Frontend configuration and API integration
 * 3. Supabase database configuration and integrity
 * 4. Deployment readiness
 * 
 * Usage:
 *   node scripts/comprehensive-qa-verification.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// QA Results
const qaResults = {
  backend: { passed: 0, failed: 0, warnings: 0, issues: [] },
  frontend: { passed: 0, failed: 0, warnings: 0, issues: [] },
  supabase: { passed: 0, failed: 0, warnings: 0, issues: [] },
  deployment: { passed: 0, failed: 0, warnings: 0, issues: [] },
};

// ============================================================================
// BACKEND VERIFICATION
// ============================================================================

function verifyBackend() {
  logSection('BACKEND VERIFICATION');
  log('Acting as Expert Backend QA Engineer', 'cyan');
  console.log('');

  // 1. Check server/index.js exists
  const serverIndexPath = path.join(__dirname, '../server/index.js');
  if (!fs.existsSync(serverIndexPath)) {
    logError('server/index.js not found');
    qaResults.backend.failed++;
    qaResults.backend.issues.push({
      severity: 'CRITICAL',
      issue: 'server/index.js missing',
      recommendation: 'Main server file is required'
    });
    return;
  }
  logSuccess('server/index.js exists');
  qaResults.backend.passed++;

  // 2. Check all route files exist
  const requiredRoutes = [
    'auth.js',
    'projects.js',
    'workpackages.js',
    'tasks.js',
    'wp1.js',
    'density.js',
    'rebar.js',
    'proctor.js',
    'pdf.js',
    'notifications.js',
    'settings.js'
  ];

  const routesPath = path.join(__dirname, '../server/routes');
  const missingRoutes = [];

  requiredRoutes.forEach(route => {
    const routePath = path.join(routesPath, route);
    if (!fs.existsSync(routePath)) {
      missingRoutes.push(route);
      qaResults.backend.failed++;
      qaResults.backend.issues.push({
        severity: 'HIGH',
        issue: `Route file missing: ${route}`,
        recommendation: `Create server/routes/${route}`
      });
    } else {
      logSuccess(`Route file exists: ${route}`);
      qaResults.backend.passed++;
    }
  });

  if (missingRoutes.length > 0) {
    logError(`Missing ${missingRoutes.length} route file(s): ${missingRoutes.join(', ')}`);
  }

  // 3. Check server/index.js route registrations
  try {
    const serverIndexContent = fs.readFileSync(serverIndexPath, 'utf8');
    
    requiredRoutes.forEach(route => {
      const routeName = route.replace('.js', '');
      const apiPath = routeName === 'notifications' ? '/api/notifications' : `/api/${routeName}`;
      
      if (serverIndexContent.includes(`/api/${routeName}`) || 
          (routeName === 'notifications' && serverIndexContent.includes('/api/notifications'))) {
        logSuccess(`Route registered: ${apiPath}`);
        qaResults.backend.passed++;
      } else {
        logWarning(`Route not registered in server/index.js: ${apiPath}`);
        qaResults.backend.warnings++;
        qaResults.backend.issues.push({
          severity: 'MEDIUM',
          issue: `Route not registered: ${apiPath}`,
          recommendation: `Add app.use('${apiPath}', require('./routes/${routeName}')); to server/index.js`
        });
      }
    });
  } catch (err) {
    logError(`Error reading server/index.js: ${err.message}`);
    qaResults.backend.failed++;
  }

  // 4. Check package.json dependencies
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const requiredDeps = ['express', 'cors', '@supabase/supabase-js', 'bcryptjs', 'jsonwebtoken'];
      
      requiredDeps.forEach(dep => {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
          logSuccess(`Dependency installed: ${dep}`);
          qaResults.backend.passed++;
        } else {
          logError(`Missing dependency: ${dep}`);
          qaResults.backend.failed++;
          qaResults.backend.issues.push({
            severity: 'HIGH',
            issue: `Missing dependency: ${dep}`,
            recommendation: `Run: npm install ${dep}`
          });
        }
      });
    } catch (err) {
      logError(`Error reading package.json: ${err.message}`);
      qaResults.backend.failed++;
    }
  }

  // 5. Check Supabase configuration module
  const supabaseModulePath = path.join(__dirname, '../server/db/supabase.js');
  if (fs.existsSync(supabaseModulePath)) {
    logSuccess('Supabase configuration module exists');
    qaResults.backend.passed++;
  } else {
    logError('Supabase configuration module missing: server/db/supabase.js');
    qaResults.backend.failed++;
    qaResults.backend.issues.push({
      severity: 'CRITICAL',
      issue: 'Supabase module missing',
      recommendation: 'Create server/db/supabase.js'
    });
  }
}

// ============================================================================
// FRONTEND VERIFICATION
// ============================================================================

function verifyFrontend() {
  logSection('FRONTEND VERIFICATION');
  log('Acting as Expert Frontend QA Engineer', 'cyan');
  console.log('');

  // 1. Check client/package.json
  const clientPackageJsonPath = path.join(__dirname, '../client/package.json');
  if (!fs.existsSync(clientPackageJsonPath)) {
    logError('client/package.json not found');
    qaResults.frontend.failed++;
    return;
  }
  logSuccess('client/package.json exists');
  qaResults.frontend.passed++;

  // 2. Check for hardcoded IP addresses
  const clientSrcPath = path.join(__dirname, '../client/src');
  const hardcodedIPs = [];
  
  function checkFileForHardcodedIPs(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ipRegex = /192\.168\.\d+\.\d+/g;
      const matches = content.match(ipRegex);
      
      if (matches) {
        const uniqueIPs = [...new Set(matches)];
        hardcodedIPs.push({
          file: path.relative(clientSrcPath, filePath),
          ips: uniqueIPs
        });
      }
    } catch (err) {
      // Skip if file can't be read
    }
  }

  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.includes('node_modules')) {
        walkDir(filePath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) {
        checkFileForHardcodedIPs(filePath);
      }
    });
  }

  walkDir(clientSrcPath);

  if (hardcodedIPs.length > 0) {
    logError(`Found ${hardcodedIPs.length} file(s) with hardcoded IP addresses`);
    hardcodedIPs.forEach(item => {
      logError(`  ${item.file}: ${item.ips.join(', ')}`);
      qaResults.frontend.failed++;
      qaResults.frontend.issues.push({
        severity: 'HIGH',
        issue: `Hardcoded IP in ${item.file}`,
        recommendation: 'Replace with environment variable or use centralized api.ts'
      });
    });
  } else {
    logSuccess('No hardcoded IP addresses found');
    qaResults.frontend.passed++;
  }

  // 3. Check API configuration
  const apiTsPath = path.join(__dirname, '../client/src/api/api.ts');
  if (fs.existsSync(apiTsPath)) {
    logSuccess('API configuration file exists (api.ts)');
    qaResults.frontend.passed++;
    
    // Check if it uses environment variables
    try {
      const apiContent = fs.readFileSync(apiTsPath, 'utf8');
      if (apiContent.includes('REACT_APP_API_BASE_URL') || apiContent.includes('REACT_APP_API_URL')) {
        logSuccess('API configuration uses environment variables');
        qaResults.frontend.passed++;
      } else {
        logWarning('API configuration may not use environment variables');
        qaResults.frontend.warnings++;
      }
    } catch (err) {
      logError(`Error reading api.ts: ${err.message}`);
      qaResults.frontend.failed++;
    }
  } else {
    logError('API configuration file missing: client/src/api/api.ts');
    qaResults.frontend.failed++;
    qaResults.frontend.issues.push({
      severity: 'HIGH',
      issue: 'API configuration file missing',
      recommendation: 'Create client/src/api/api.ts with centralized API configuration'
    });
  }

  // 4. Check key frontend files
  const keyFrontendFiles = [
    'src/App.tsx',
    'src/index.tsx',
    'src/api/auth.ts',
    'src/api/projects.ts',
    'src/api/tasks.ts',
  ];

  keyFrontendFiles.forEach(file => {
    const filePath = path.join(__dirname, '../client', file);
    if (fs.existsSync(filePath)) {
      logSuccess(`Frontend file exists: ${file}`);
      qaResults.frontend.passed++;
    } else {
      logError(`Frontend file missing: ${file}`);
      qaResults.frontend.failed++;
      qaResults.frontend.issues.push({
        severity: 'HIGH',
        issue: `Missing file: ${file}`,
        recommendation: `Create client/${file}`
      });
    }
  });

  // 5. Check build configuration
  const clientPackageJson = JSON.parse(fs.readFileSync(clientPackageJsonPath, 'utf8'));
  if (clientPackageJson.scripts && clientPackageJson.scripts.build) {
    logSuccess('Build script configured');
    qaResults.frontend.passed++;
  } else {
    logError('Build script missing in package.json');
    qaResults.frontend.failed++;
  }
}

// ============================================================================
// SUPABASE VERIFICATION
// ============================================================================

async function verifySupabase() {
  logSection('SUPABASE VERIFICATION');
  log('Acting as Expert Database QA Engineer', 'cyan');
  console.log('');

  // 1. Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    logWarning('Supabase environment variables not set');
    logInfo('Application will fall back to SQLite if available');
    qaResults.supabase.warnings++;
    qaResults.supabase.issues.push({
      severity: 'MEDIUM',
      issue: 'Supabase not configured',
      recommendation: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for production'
    });
    return;
  }

  logSuccess('Supabase environment variables configured');
  qaResults.supabase.passed++;

  // 2. Validate URL format
  if (!supabaseUrl.match(/^https?:\/\/[^.]+\.supabase\.co/)) {
    logError(`Invalid SUPABASE_URL format: ${supabaseUrl}`);
    qaResults.supabase.failed++;
    qaResults.supabase.issues.push({
      severity: 'HIGH',
      issue: 'Invalid Supabase URL format',
      recommendation: 'Expected format: https://[project-ref].supabase.co'
    });
    return;
  }
  logSuccess('Supabase URL format valid');
  qaResults.supabase.passed++;

  // 3. Test connection
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    logSuccess('Supabase connection successful');
    qaResults.supabase.passed++;
  } catch (err) {
    logError(`Supabase connection failed: ${err.message}`);
    qaResults.supabase.failed++;
    qaResults.supabase.issues.push({
      severity: 'CRITICAL',
      issue: 'Cannot connect to Supabase',
      error: err.message,
      recommendation: 'Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct'
    });
    return;
  }

  // 4. Check required tables
  const requiredTables = ['users', 'projects', 'tasks', 'workpackages', 'app_settings'];
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(0);
      
      if (error) {
        if (error.code === '42P01') {
          logError(`Table missing: ${table}`);
          qaResults.supabase.failed++;
          qaResults.supabase.issues.push({
            severity: 'HIGH',
            issue: `Table '${table}' does not exist`,
            recommendation: 'Run database migrations: npm run supabase:execute-and-verify'
          });
        } else {
          logWarning(`Table ${table}: ${error.message}`);
          qaResults.supabase.warnings++;
        }
      } else {
        logSuccess(`Table exists: ${table}`);
        qaResults.supabase.passed++;
      }
    } catch (err) {
      logError(`Error checking table ${table}: ${err.message}`);
      qaResults.supabase.failed++;
    }
  }

  // 5. Check migrations
  const migrationsPath = path.join(__dirname, '../supabase/migrations');
  if (fs.existsSync(migrationsPath)) {
    const migrations = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    if (migrations.length > 0) {
      logSuccess(`Found ${migrations.length} migration file(s)`);
      qaResults.supabase.passed++;
      migrations.forEach(migration => {
        logInfo(`  - ${migration}`);
      });
    } else {
      logWarning('No migration files found');
      qaResults.supabase.warnings++;
    }
  } else {
    logWarning('Migrations directory not found');
    qaResults.supabase.warnings++;
  }
}

// ============================================================================
// DEPLOYMENT VERIFICATION
// ============================================================================

function verifyDeployment() {
  logSection('DEPLOYMENT READINESS VERIFICATION');
  log('Acting as Expert DevOps QA Engineer', 'cyan');
  console.log('');

  // 1. Check vercel.json
  const vercelJsonPath = path.join(__dirname, '../vercel.json');
  if (fs.existsSync(vercelJsonPath)) {
    logSuccess('vercel.json exists');
    qaResults.deployment.passed++;
    
    try {
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      if (vercelJson.buildCommand) {
        logSuccess('Vercel build command configured');
        qaResults.deployment.passed++;
      }
    } catch (err) {
      logWarning(`Error reading vercel.json: ${err.message}`);
      qaResults.deployment.warnings++;
    }
  } else {
    logWarning('vercel.json not found (optional for Vercel deployment)');
    qaResults.deployment.warnings++;
  }

  // 2. Check .gitignore
  const gitignorePath = path.join(__dirname, '../.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (gitignoreContent.includes('.env')) {
      logSuccess('.env is in .gitignore');
      qaResults.deployment.passed++;
    } else {
      logWarning('.env not in .gitignore (security risk)');
      qaResults.deployment.warnings++;
      qaResults.deployment.issues.push({
        severity: 'HIGH',
        issue: '.env not in .gitignore',
        recommendation: 'Add .env to .gitignore to prevent committing secrets'
      });
    }
  }

  // 3. Check for .env.example
  const envExamplePath = path.join(__dirname, '../.env.example');
  if (fs.existsSync(envExamplePath)) {
    logSuccess('.env.example exists (good practice)');
    qaResults.deployment.passed++;
  } else {
    logWarning('.env.example not found');
    qaResults.deployment.warnings++;
  }

  // 4. Check package.json scripts
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const requiredScripts = ['build', 'install-all'];
      
      requiredScripts.forEach(script => {
        if (packageJson.scripts && packageJson.scripts[script]) {
          logSuccess(`Script exists: ${script}`);
          qaResults.deployment.passed++;
        } else {
          logWarning(`Script missing: ${script}`);
          qaResults.deployment.warnings++;
        }
      });
    } catch (err) {
      logError(`Error reading package.json: ${err.message}`);
      qaResults.deployment.failed++;
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════════════════╗', 'bright');
  log('║                    COMPREHENSIVE QA VERIFICATION                              ║', 'bright');
  log('║              Expert QA Engineer (20+ years experience)                       ║', 'bright');
  log('╚══════════════════════════════════════════════════════════════════════════════╝', 'bright');
  console.log('');

  // Run all verifications
  verifyBackend();
  verifyFrontend();
  await verifySupabase();
  verifyDeployment();

  // Final Summary
  logSection('QA VERIFICATION SUMMARY');
  
  const totalPassed = qaResults.backend.passed + qaResults.frontend.passed + 
                      qaResults.supabase.passed + qaResults.deployment.passed;
  const totalFailed = qaResults.backend.failed + qaResults.frontend.failed + 
                     qaResults.supabase.failed + qaResults.deployment.failed;
  const totalWarnings = qaResults.backend.warnings + qaResults.frontend.warnings + 
                       qaResults.supabase.warnings + qaResults.deployment.warnings;

  console.log('\n📊 RESULTS BY CATEGORY:');
  console.log('─'.repeat(80));
  log(`Backend:    ✅ ${qaResults.backend.passed} passed, ❌ ${qaResults.backend.failed} failed, ⚠️  ${qaResults.backend.warnings} warnings`);
  log(`Frontend:   ✅ ${qaResults.frontend.passed} passed, ❌ ${qaResults.frontend.failed} failed, ⚠️  ${qaResults.frontend.warnings} warnings`);
  log(`Supabase:   ✅ ${qaResults.supabase.passed} passed, ❌ ${qaResults.supabase.failed} failed, ⚠️  ${qaResults.supabase.warnings} warnings`);
  log(`Deployment: ✅ ${qaResults.deployment.passed} passed, ❌ ${qaResults.deployment.failed} failed, ⚠️  ${qaResults.deployment.warnings} warnings`);
  
  console.log('\n📈 OVERALL STATISTICS:');
  console.log('─'.repeat(80));
  log(`Total Passed:   ${totalPassed}`, 'green');
  log(`Total Failed:   ${totalFailed}`, totalFailed > 0 ? 'red' : 'green');
  log(`Total Warnings: ${totalWarnings}`, totalWarnings > 0 ? 'yellow' : 'green');

  // Collect all issues
  const allIssues = [
    ...qaResults.backend.issues,
    ...qaResults.frontend.issues,
    ...qaResults.supabase.issues,
    ...qaResults.deployment.issues,
  ];

  if (allIssues.length > 0) {
    console.log('\n🚨 ISSUES FOUND:');
    console.log('─'.repeat(80));
    
    const criticalIssues = allIssues.filter(i => i.severity === 'CRITICAL');
    const highIssues = allIssues.filter(i => i.severity === 'HIGH');
    const mediumIssues = allIssues.filter(i => i.severity === 'MEDIUM');
    
    if (criticalIssues.length > 0) {
      log(`\n🔴 CRITICAL ISSUES (${criticalIssues.length}):`, 'red');
      criticalIssues.forEach((issue, idx) => {
        log(`  ${idx + 1}. ${issue.issue}`, 'red');
        if (issue.recommendation) {
          log(`     💡 ${issue.recommendation}`, 'cyan');
        }
      });
    }
    
    if (highIssues.length > 0) {
      log(`\n🟡 HIGH PRIORITY ISSUES (${highIssues.length}):`, 'yellow');
      highIssues.forEach((issue, idx) => {
        log(`  ${idx + 1}. ${issue.issue}`, 'yellow');
        if (issue.recommendation) {
          log(`     💡 ${issue.recommendation}`, 'cyan');
        }
      });
    }
    
    if (mediumIssues.length > 0) {
      log(`\n🔵 MEDIUM PRIORITY ISSUES (${mediumIssues.length}):`, 'cyan');
      mediumIssues.forEach((issue, idx) => {
        log(`  ${idx + 1}. ${issue.issue}`, 'cyan');
        if (issue.recommendation) {
          log(`     💡 ${issue.recommendation}`, 'cyan');
        }
      });
    }
  } else {
    logSuccess('\n🎉 No issues found! System is ready for deployment.');
  }

  // Final Verdict
  console.log('\n' + '='.repeat(80));
  if (totalFailed > 0 || criticalIssues.length > 0) {
    log('🔴 VERDICT: CRITICAL ISSUES FOUND - DO NOT DEPLOY', 'red');
    log('   Please fix all critical and high priority issues before deploying.', 'red');
  } else if (totalWarnings > 0 || highIssues.length > 0) {
    log('🟡 VERDICT: WARNINGS FOUND - REVIEW RECOMMENDED', 'yellow');
    log('   System may work but should be reviewed before deployment.', 'yellow');
  } else {
    log('🟢 VERDICT: SYSTEM READY FOR DEPLOYMENT', 'green');
    log('   All checks passed. System is ready to deploy.', 'green');
  }
  console.log('='.repeat(80) + '\n');

  // Exit code
  if (totalFailed > 0 || criticalIssues.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run QA verification
main().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
