/**
 * Comprehensive QA Test for Supabase Filter Parsing
 * 
 * This script tests all Supabase query patterns to identify filter parsing errors.
 * Tests all workflows including tasks, projects, workpackages, and other entities.
 * 
 * Run with: node scripts/qa-supabase-filter-test.js
 */

require('dotenv').config();
const { supabase, isAvailable, validateConfiguration } = require('../server/db/supabase');

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

function logTest(name, passed, error = null) {
  const status = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`  ${status} ${name}`, color);
  if (error) {
    log(`    Error: ${error.message}`, 'red');
    if (error.details) log(`    Details: ${error.details}`, 'yellow');
    if (error.hint) log(`    Hint: ${error.hint}`, 'yellow');
  }
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

async function testQuery(name, queryFn) {
  try {
    const result = await queryFn();
    logTest(name, true);
    results.passed++;
    return { success: true, data: result };
  } catch (error) {
    logTest(name, false, error);
    results.failed++;
    results.errors.push({ name, error: error.message });
    return { success: false, error };
  }
}

async function runTests() {
  logSection('🔍 SUPABASE QA TEST - Filter Parsing & Workflow Validation');
  
  // Validate configuration
  log('\n📋 Configuration Check', 'blue');
  const validation = validateConfiguration(false);
  if (!validation.isValid) {
    log('❌ Supabase not configured. Cannot run tests.', 'red');
    log('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env', 'yellow');
    process.exit(1);
  }
  
  if (!isAvailable()) {
    log('❌ Supabase client not available', 'red');
    process.exit(1);
  }
  
  log('✓ Supabase configuration valid', 'green');
  
  // ============================================================================
  // TEST 1: Basic Task Queries
  // ============================================================================
  logSection('TEST 1: Basic Task Queries');
  
  await testQuery('Get all tasks', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with project_id filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', 1)
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with assigned_technician_id filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_technician_id', 1)
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with status filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'ASSIGNED')
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with neq (not equal) filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'APPROVED')
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with multiple filters (chained)', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', 1)
      .eq('status', 'ASSIGNED')
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 2: Complex Filter Patterns (Known Issue Areas)
  // ============================================================================
  logSection('TEST 2: Complex Filter Patterns');
  
  await testQuery('Get tasks with .not() filter for null values', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, proctor_no, status, project_id')
      .eq('project_id', 1)
      .eq('task_type', 'PROCTOR')
      .not('proctor_no', 'is', null)
      .order('proctor_no', { ascending: true });
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with date comparison (lt)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .not('due_date', 'is', null)
      .neq('status', 'APPROVED')
      .lt('due_date', today)
      .limit(5);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with .or() filter (Fixed - Using existing columns)', async () => {
    const activityDate = new Date().toISOString().split('T')[0];
    const startOfDay = `${activityDate}T00:00:00`;
    const endOfDay = `${activityDate}T23:59:59`;
    // Fixed: Use existing columns (last_edited_at, field_completed_at) instead of non-existent completed_at/submitted_at
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .or(`last_edited_at.gte.${startOfDay},last_edited_at.lt.${endOfDay},field_completed_at.gte.${startOfDay},field_completed_at.lt.${endOfDay}`)
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 3: Join Queries (Foreign Key Relationships)
  // ============================================================================
  logSection('TEST 3: Join Queries with Filters');
  
  await testQuery('Get tasks with user join and filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        users:assigned_technician_id(name, email),
        projects:project_id(project_number, project_name)
      `)
      .eq('assigned_technician_id', 1)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with nested project filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        projects:project_id(project_number, project_name)
      `)
      .eq('project_id', 1)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get notifications with joins and filter', async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        workpackages:related_work_package_id(name, type),
        projects:related_project_id(project_number, project_name)
      `)
      .eq('user_id', 1)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 4: Date Filtering (Edge Cases)
  // ============================================================================
  logSection('TEST 4: Date Filtering Edge Cases');
  
  await testQuery('Get tasks with date range (gte and lte)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .gte('due_date', today)
      .lte('due_date', tomorrowStr)
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with timestamp range (gte and lt)', async () => {
    const activityDate = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('task_history')
      .select('*')
      .gte('timestamp', `${activityDate}T00:00:00`)
      .lt('timestamp', `${activityDate}T23:59:59`)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 5: Task History Queries
  // ============================================================================
  logSection('TEST 5: Task History Queries');
  
  await testQuery('Get task history with task_id filter', async () => {
    const { data, error } = await supabase
      .from('task_history')
      .select('*')
      .eq('task_id', 1)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get task history with nested task join', async () => {
    const { data, error } = await supabase
      .from('task_history')
      .select(`
        *,
        tasks:task_id(task_type, project_id, projects:project_id(project_number, project_name))
      `)
      .eq('task_id', 1)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get task history with .in() filter', async () => {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('assigned_technician_id', 1)
      .limit(10);
    
    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .in('task_id', taskIds)
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return data;
    }
    return [];
  });
  
  // ============================================================================
  // TEST 6: Project Queries
  // ============================================================================
  logSection('TEST 6: Project Queries');
  
  await testQuery('Get projects with order by', async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get project counters with year filter', async () => {
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from('project_counters')
      .select('*')
      .eq('year', year)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 7: Work Package Queries
  // ============================================================================
  logSection('TEST 7: Work Package Queries');
  
  await testQuery('Get workpackages with project_id and user filter', async () => {
    const { data, error } = await supabase
      .from('workpackages')
      .select(`
        *,
        users:assigned_to(name, email)
      `)
      .eq('project_id', 1)
      .eq('assigned_to', 1)
      .order('id', { ascending: true });
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 8: Report Data Queries
  // ============================================================================
  logSection('TEST 8: Report Data Queries');
  
  await testQuery('Get wp1_data with task_id filter', async () => {
    const { data, error } = await supabase
      .from('wp1_data')
      .select('*')
      .eq('task_id', 1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  });
  
  await testQuery('Get proctor_data with task_id filter', async () => {
    const { data, error } = await supabase
      .from('proctor_data')
      .select('*')
      .eq('task_id', 1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  });
  
  await testQuery('Get density_reports with task_id filter', async () => {
    const { data, error } = await supabase
      .from('density_reports')
      .select('*')
      .eq('task_id', 1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  });
  
  await testQuery('Get rebar_reports with task_id filter', async () => {
    const { data, error } = await supabase
      .from('rebar_reports')
      .select('*')
      .eq('task_id', 1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 9: Field Completion Filters
  // ============================================================================
  logSection('TEST 9: Field Completion Filters');
  
  await testQuery('Get tasks with field_completed filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_technician_id', 1)
      .eq('field_completed', 1)
      .neq('status', 'APPROVED')
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Get tasks with report_submitted filter', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_technician_id', 1)
      .eq('report_submitted', 0)
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // TEST 10: Order By Patterns
  // ============================================================================
  logSection('TEST 10: Order By Patterns');
  
  await testQuery('Order by created_at descending', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  await testQuery('Order by multiple columns', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return data;
  });
  
  // ============================================================================
  // SUMMARY
  // ============================================================================
  logSection('📊 TEST SUMMARY');
  
  log(`\nTotal Tests: ${results.passed + results.failed}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.errors.length > 0) {
    log('\n❌ FAILED TESTS:', 'red');
    results.errors.forEach(({ name, error }) => {
      log(`  • ${name}: ${error}`, 'yellow');
    });
    
    log('\n🔧 RECOMMENDATIONS:', 'cyan');
    log('  1. Review failed test patterns above', 'yellow');
    log('  2. Check Supabase query syntax documentation', 'yellow');
    log('  3. Verify column names match database schema (snake_case)', 'yellow');
    log('  4. Test complex .or() filters with proper formatting', 'yellow');
    log('  5. Ensure date/timestamp formats are correct', 'yellow');
  } else {
    log('\n✅ All tests passed! Supabase filters are working correctly.', 'green');
  }
  
  console.log('\n');
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
