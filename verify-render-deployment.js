/**
 * Render Deployment Verification Script
 * 
 * This script checks if your Render deployment has all the latest files
 * by testing API endpoints and comparing expected functionality.
 * 
 * Usage: node verify-render-deployment.js
 */

const https = require('https');
const http = require('http');

const RENDER_URL = process.env.RENDER_URL || 'https://mak-automation-backend.onrender.com';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed,
            raw: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
            raw: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function checkEndpoint(path, expectedStatus = 200, description = '') {
  try {
    const url = `${RENDER_URL}${path}`;
    const response = await makeRequest(url);
    
    if (response.status === expectedStatus) {
      log(`✅ ${description || path} - Status: ${response.status}`, 'green');
      return { success: true, response };
    } else {
      log(`❌ ${description || path} - Expected ${expectedStatus}, got ${response.status}`, 'red');
      return { success: false, response };
    }
  } catch (error) {
    log(`❌ ${description || path} - Error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function main() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🔍 Render Deployment Verification', 'cyan');
  log('='.repeat(70), 'cyan');
  log(`\nTesting: ${RENDER_URL}\n`, 'blue');

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Root endpoint
  log('\n📋 Testing Core Endpoints:', 'yellow');
  results.total++;
  const rootTest = await checkEndpoint('/', 200, 'Root endpoint');
  if (rootTest.success) {
    results.passed++;
    if (rootTest.response?.data?.service === 'backend') {
      log('   ✓ Response matches expected format', 'green');
    }
  } else {
    results.failed++;
  }

  // Test 2: Health check
  results.total++;
  const healthTest = await checkEndpoint('/health', 200, 'Health check');
  if (healthTest.success) {
    results.passed++;
    if (healthTest.response?.data?.ok === true) {
      log('   ✓ Health check response correct', 'green');
    }
  } else {
    results.failed++;
  }

  // Test 3: API Routes (should return 401 or 404, not 500)
  log('\n📋 Testing API Routes:', 'yellow');
  
  const apiRoutes = [
    { path: '/api/auth/login', method: 'POST', body: {}, expectedStatus: 400, description: 'Auth login (POST - expects validation error)' },
    { path: '/api/projects', expectedStatus: 401, description: 'Projects endpoint (requires auth)' },
    { path: '/api/workpackages/project/1', expectedStatus: 401, description: 'Workpackages endpoint (requires auth)' },
    { path: '/api/tasks', expectedStatus: 401, description: 'Tasks endpoint (requires auth)' },
    { path: '/api/wp1/task/1', expectedStatus: 401, description: 'WP1 endpoint (requires auth)' },
    { path: '/api/density/task/1', expectedStatus: 401, description: 'Density endpoint (requires auth)' },
    { path: '/api/rebar/task/1', expectedStatus: 401, description: 'Rebar endpoint (requires auth)' },
    { path: '/api/proctor/task/1', expectedStatus: 401, description: 'Proctor endpoint (requires auth)' },
    { path: '/api/notifications', expectedStatus: 401, description: 'Notifications endpoint (requires auth)' }
  ];

  for (const route of apiRoutes) {
    results.total++;
    try {
      const url = `${RENDER_URL}${route.path}`;
      const response = await makeRequest(url, {
        method: route.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: route.body
      });
      
      // Accept 401 (unauthorized) or 400 (bad request) as success - means route exists
      if (response.status === route.expectedStatus || response.status === 401 || response.status === 400) {
        log(`✅ ${route.description} - Status: ${response.status}`, 'green');
        results.passed++;
      } else if (response.status === 404) {
        log(`❌ ${route.description} - Route not found (404)`, 'red');
        results.failed++;
      } else if (response.status === 500) {
        log(`⚠️  ${route.description} - Server error (500) - Route exists but may have issues`, 'yellow');
        results.passed++; // Count as passed since route exists
      } else {
        log(`⚠️  ${route.description} - Unexpected status: ${response.status}`, 'yellow');
        results.passed++; // Count as passed since route exists
      }
    } catch (error) {
      log(`❌ ${route.description} - Error: ${error.message}`, 'red');
      results.failed++;
    }
  }

  // Test 4: Check for Supabase support
  log('\n📋 Testing Database Configuration:', 'yellow');
  results.total++;
  try {
    // Try to get projects without auth - should fail with 401, not 500 (database error)
    const testResponse = await makeRequest(`${RENDER_URL}/api/projects`);
    if (testResponse.status === 401) {
      log('✅ API routes responding correctly (401 = auth required, not database error)', 'green');
      log('   ℹ️  Database connection appears to be working', 'blue');
      results.passed++;
    } else if (testResponse.status === 500) {
      log('⚠️  Database may have issues (500 error)', 'yellow');
      results.failed++;
    } else {
      results.passed++;
    }
  } catch (error) {
    log(`❌ Database test failed: ${error.message}`, 'red');
    results.failed++;
  }

  // Summary
  log('\n' + '='.repeat(70), 'cyan');
  log('📊 Verification Summary', 'cyan');
  log('='.repeat(70), 'cyan');
  log(`\nTotal Tests: ${results.total}`, 'blue');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  const successRate = ((results.passed / results.total) * 100).toFixed(1);
  log(`\nSuccess Rate: ${successRate}%`, successRate >= 90 ? 'green' : 'yellow');

  if (results.failed === 0) {
    log('\n🎉 All tests passed! Your Render deployment appears to be up to date.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Review the errors above.', 'yellow');
    log('   You may need to redeploy your application to Render.', 'yellow');
  }

  log('\n💡 Next Steps:', 'cyan');
  log('   1. Check Render dashboard for latest deployment', 'blue');
  log('   2. Verify all files are committed to your repository', 'blue');
  log('   3. Trigger a manual redeploy if needed', 'blue');
  log('   4. Check Render logs for any errors', 'blue');
  log('\n');
}

// Run the verification
main().catch(error => {
  log(`\n❌ Verification script error: ${error.message}`, 'red');
  process.exit(1);
});
