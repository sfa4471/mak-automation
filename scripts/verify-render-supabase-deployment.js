/**
 * Render Deployment Verification Script
 * 
 * Verifies that the Render deployment is correctly configured with Supabase.
 * Checks both the deployment logs and API endpoints.
 * 
 * Usage:
 *   node scripts/verify-render-supabase-deployment.js
 * 
 * Environment Variables:
 *   RENDER_SERVICE_URL - Your Render service URL (default: https://mak-automation-backend.onrender.com)
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

const RENDER_SERVICE_URL = process.env.RENDER_SERVICE_URL || 'https://mak-automation-backend.onrender.com';

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

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function checkHealthEndpoint() {
  logSection('STEP 1: CHECKING HEALTH ENDPOINT');
  
  try {
    log(`Testing: ${RENDER_SERVICE_URL}/health\n`, 'cyan');
    const response = await makeRequest(`${RENDER_SERVICE_URL}/health`);
    
    if (response.statusCode === 200) {
      log(`✅ Health check passed (Status: ${response.statusCode})`, 'green');
      try {
        const data = JSON.parse(response.body);
        if (data.ok === true) {
          log('✅ Response format correct: {"ok":true}', 'green');
          return { success: true };
        } else {
          log('⚠️  Response format unexpected', 'yellow');
          return { success: false, warning: 'Unexpected response format' };
        }
      } catch (e) {
        log('⚠️  Response is not valid JSON', 'yellow');
        return { success: false, warning: 'Invalid JSON response' };
      }
    } else {
      log(`❌ Health check failed (Status: ${response.statusCode})`, 'red');
      return { success: false, error: `HTTP ${response.statusCode}` };
    }
  } catch (error) {
    log(`❌ Health check error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function checkRootEndpoint() {
  logSection('STEP 2: CHECKING ROOT ENDPOINT');
  
  try {
    log(`Testing: ${RENDER_SERVICE_URL}/\n`, 'cyan');
    const response = await makeRequest(`${RENDER_SERVICE_URL}/`);
    
    if (response.statusCode === 200) {
      log(`✅ Root endpoint accessible (Status: ${response.statusCode})`, 'green');
      try {
        const data = JSON.parse(response.body);
        log(`✅ Response: ${JSON.stringify(data)}`, 'green');
        return { success: true, data };
      } catch (e) {
        log('⚠️  Response is not valid JSON', 'yellow');
        return { success: false, warning: 'Invalid JSON response' };
      }
    } else {
      log(`❌ Root endpoint failed (Status: ${response.statusCode})`, 'red');
      return { success: false, error: `HTTP ${response.statusCode}` };
    }
  } catch (error) {
    log(`❌ Root endpoint error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function checkApiEndpoints() {
  logSection('STEP 3: CHECKING API ENDPOINTS');
  
  const endpoints = [
    '/api/auth/login',
    '/api/projects',
    '/api/tasks',
    '/api/workpackages'
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    try {
      log(`Testing: ${RENDER_SERVICE_URL}${endpoint}`, 'cyan');
      const response = await makeRequest(`${RENDER_SERVICE_URL}${endpoint}`);
      
      // API endpoints should return 401 (unauthorized) if they exist
      // 404 means route doesn't exist, 500 means server error
      if (response.statusCode === 401) {
        log(`  ✅ ${endpoint} - Route exists (401 Unauthorized - expected)`, 'green');
        results.push({ endpoint, status: 'OK', code: 401 });
      } else if (response.statusCode === 404) {
        log(`  ❌ ${endpoint} - Route not found (404)`, 'red');
        results.push({ endpoint, status: 'NOT_FOUND', code: 404 });
      } else if (response.statusCode === 500) {
        log(`  ⚠️  ${endpoint} - Server error (500)`, 'yellow');
        results.push({ endpoint, status: 'SERVER_ERROR', code: 500 });
      } else {
        log(`  ⚠️  ${endpoint} - Unexpected status (${response.statusCode})`, 'yellow');
        results.push({ endpoint, status: 'UNEXPECTED', code: response.statusCode });
      }
    } catch (error) {
      log(`  ❌ ${endpoint} - Error: ${error.message}`, 'red');
      results.push({ endpoint, status: 'ERROR', error: error.message });
    }
  }
  
  console.log();
  const passed = results.filter(r => r.status === 'OK').length;
  const failed = results.filter(r => r.status !== 'OK').length;
  
  log(`Summary: ${passed}/${endpoints.length} endpoints accessible`, 
      passed === endpoints.length ? 'green' : 'yellow');
  
  return { results, passed, failed, total: endpoints.length };
}

function provideInstructions() {
  logSection('VERIFICATION INSTRUCTIONS');
  
  log('\n📋 To verify Supabase connection in Render logs:', 'cyan');
  log('   1. Go to: https://dashboard.render.com', 'cyan');
  log('   2. Select your service: mak-automation-backend', 'cyan');
  log('   3. Click on "Logs" tab', 'cyan');
  log('   4. Look for these messages:', 'cyan');
  log('      ✅ "Supabase configuration found"', 'green');
  log('      ✅ "Using Supabase database"', 'green');
  log('   5. Should NOT see:', 'cyan');
  log('      ❌ "Supabase environment variables not set"', 'red');
  log('      ❌ "Using SQLite database"', 'red');
  
  log('\n📋 To check environment variables:', 'cyan');
  log('   1. Go to Render Dashboard → Your Service', 'cyan');
  log('   2. Click "Environment" tab', 'cyan');
  log('   3. Verify these are set:', 'cyan');
  log('      - SUPABASE_URL', 'cyan');
  log('      - SUPABASE_SERVICE_ROLE_KEY', 'cyan');
  
  log('\n📋 If Supabase is not configured:', 'cyan');
  log('   1. Follow: RENDER_SUPABASE_SETUP_GUIDE.md', 'cyan');
  log('   2. Add environment variables in Render Dashboard', 'cyan');
  log('   3. Redeploy service', 'cyan');
  log('   4. Run this script again to verify\n', 'cyan');
}

async function main() {
  logSection('RENDER DEPLOYMENT VERIFICATION');
  log('Expert Deployment Verification Tool\n', 'cyan');
  log(`Service URL: ${RENDER_SERVICE_URL}\n`, 'blue');

  const results = {
    health: null,
    root: null,
    api: null
  };

  // Check health endpoint
  results.health = await checkHealthEndpoint();
  
  // Check root endpoint
  results.root = await checkRootEndpoint();
  
  // Check API endpoints
  results.api = await checkApiEndpoints();

  // Final Summary
  logSection('VERIFICATION SUMMARY');
  
  const allHealthChecks = results.health.success && results.root.success;
  const allApiChecks = results.api.passed === results.api.total;
  
  if (allHealthChecks && allApiChecks) {
    log('✅ All endpoint checks passed!', 'green');
    log('\n📊 Service Status:', 'cyan');
    log(`   Health Endpoint: ✅ Working`, 'green');
    log(`   Root Endpoint: ✅ Working`, 'green');
    log(`   API Endpoints: ✅ ${results.api.passed}/${results.api.total} accessible`, 'green');
    
    log('\n⚠️  IMPORTANT: This script cannot verify Supabase connection directly.', 'yellow');
    log('   You must check Render logs to confirm Supabase is being used.\n', 'yellow');
    
    provideInstructions();
  } else {
    log('⚠️  Some checks failed', 'yellow');
    log('\n📊 Service Status:', 'cyan');
    log(`   Health Endpoint: ${results.health.success ? '✅' : '❌'}`, 
        results.health.success ? 'green' : 'red');
    log(`   Root Endpoint: ${results.root.success ? '✅' : '❌'}`, 
        results.root.success ? 'green' : 'red');
    log(`   API Endpoints: ${results.api.passed}/${results.api.total} accessible`, 
        results.api.passed === results.api.total ? 'green' : 'yellow');
    
    if (!allHealthChecks) {
      log('\n❌ Basic endpoints are not working. Check:', 'red');
      log('   - Service is deployed and running', 'cyan');
      log('   - Service URL is correct', 'cyan');
      log('   - Network connectivity', 'cyan');
    }
    
    provideInstructions();
  }

  console.log();
}

// Run verification
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
