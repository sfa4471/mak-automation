/**
 * QA Database Verification Script
 * 
 * Comprehensive QA script to verify Supabase database integrity,
 * specifically checking why tasks are not showing under projects.
 * 
 * This script performs:
 * 1. Connection verification
 * 2. Table structure verification
 * 3. Data integrity checks
 * 4. Foreign key relationship verification
 * 5. API endpoint simulation
 * 6. Data type validation
 * 
 * Usage:
 *   node scripts/qa-database-verification.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
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

// Validation results
const results = {
  connection: false,
  tables: {},
  projects: { count: 0, data: [] },
  tasks: { count: 0, data: [] },
  relationships: { valid: 0, invalid: 0, orphaned: [] },
  apiSimulation: { success: false, errors: [] },
  issues: [],
  recommendations: []
};

async function main() {
  logSection('QA DATABASE VERIFICATION - SUPABASE INTEGRITY CHECK');
  log('Acting as Expert QA Engineer with 20+ years experience', 'cyan');
  console.log('');

  // Step 1: Verify Configuration
  logSection('STEP 1: Configuration Verification');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    logError('Missing required environment variables');
    logInfo('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    logInfo('Please add them to your .env file');
    process.exit(1);
  }

  if (!supabaseUrl.match(/^https?:\/\/[^.]+\.supabase\.co/)) {
    logError(`Invalid SUPABASE_URL format: ${supabaseUrl}`);
    logInfo('Expected format: https://[project-ref].supabase.co');
    process.exit(1);
  }

  logSuccess('Environment variables configured');
  logInfo(`Supabase URL: ${supabaseUrl.substring(0, 30)}...`);

  // Step 2: Test Connection
  logSection('STEP 2: Database Connection Test');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Test connection by querying a system table
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    results.connection = true;
    logSuccess('Database connection successful');
  } catch (err) {
    logError(`Database connection failed: ${err.message}`);
    logError(`Error code: ${err.code || 'UNKNOWN'}`);
    results.issues.push({
      severity: 'CRITICAL',
      issue: 'Database connection failed',
      error: err.message,
      recommendation: 'Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct'
    });
    process.exit(1);
  }

  // Step 3: Verify Table Structure
  logSection('STEP 3: Table Structure Verification');
  
  const requiredTables = ['projects', 'tasks', 'users'];
  
  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(0);
      
      if (error) {
        if (error.code === '42P01') {
          logError(`${table}: Table does not exist`);
          results.tables[table] = { exists: false, error: 'Table not found' };
          results.issues.push({
            severity: 'CRITICAL',
            issue: `Table '${table}' does not exist`,
            recommendation: 'Run database migrations: npm run supabase:execute-and-verify'
          });
        } else {
          logError(`${table}: ${error.message}`);
          results.tables[table] = { exists: false, error: error.message };
        }
      } else {
        logSuccess(`${table}: Table exists`);
        results.tables[table] = { exists: true };
      }
    } catch (err) {
      logError(`${table}: ${err.message}`);
      results.tables[table] = { exists: false, error: err.message };
    }
  }

  // Step 4: Check Projects Data
  logSection('STEP 4: Projects Data Analysis');
  
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, project_number, project_name, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      logError(`Error fetching projects: ${error.message}`);
      results.issues.push({
        severity: 'HIGH',
        issue: 'Cannot fetch projects',
        error: error.message
      });
    } else {
      results.projects.count = projects?.length || 0;
      results.projects.data = projects || [];
      
      if (results.projects.count === 0) {
        logWarning('No projects found in database');
        results.issues.push({
          severity: 'HIGH',
          issue: 'No projects exist in database',
          recommendation: 'Create at least one project to test task relationships'
        });
      } else {
        logSuccess(`Found ${results.projects.count} project(s)`);
        
        // Display first 5 projects
        const displayProjects = projects.slice(0, 5);
        console.log('\nSample projects:');
        displayProjects.forEach((p, idx) => {
          logInfo(`${idx + 1}. ID: ${p.id}, Number: ${p.project_number}, Name: ${p.project_name || 'N/A'}`);
        });
        
        if (projects.length > 5) {
          logInfo(`... and ${projects.length - 5} more`);
        }
      }
    }
  } catch (err) {
    logError(`Error in projects analysis: ${err.message}`);
    results.issues.push({
      severity: 'HIGH',
      issue: 'Projects analysis failed',
      error: err.message
    });
  }

  // Step 5: Check Tasks Data
  logSection('STEP 5: Tasks Data Analysis');
  
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, project_id, task_type, status, assigned_technician_id, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      logError(`Error fetching tasks: ${error.message}`);
      results.issues.push({
        severity: 'HIGH',
        issue: 'Cannot fetch tasks',
        error: error.message
      });
    } else {
      results.tasks.count = tasks?.length || 0;
      results.tasks.data = tasks || [];
      
      if (results.tasks.count === 0) {
        logWarning('No tasks found in database');
        results.issues.push({
          severity: 'HIGH',
          issue: 'No tasks exist in database',
          recommendation: 'This explains why tasks are not showing. Create tasks for projects.'
        });
      } else {
        logSuccess(`Found ${results.tasks.count} task(s)`);
        
        // Display first 5 tasks
        const displayTasks = tasks.slice(0, 5);
        console.log('\nSample tasks:');
        displayTasks.forEach((t, idx) => {
          logInfo(`${idx + 1}. ID: ${t.id}, Project ID: ${t.project_id}, Type: ${t.task_type}, Status: ${t.status}`);
        });
        
        if (tasks.length > 5) {
          logInfo(`... and ${tasks.length - 5} more`);
        }
      }
    }
  } catch (err) {
    logError(`Error in tasks analysis: ${err.message}`);
    results.issues.push({
      severity: 'HIGH',
      issue: 'Tasks analysis failed',
      error: err.message
    });
  }

  // Step 6: Foreign Key Relationship Verification
  logSection('STEP 6: Foreign Key Relationship Verification');
  
  if (results.projects.count > 0 && results.tasks.count > 0) {
    const projectIds = new Set(results.projects.data.map(p => p.id));
    const orphanedTasks = [];
    let validRelationships = 0;
    let invalidRelationships = 0;
    
    results.tasks.data.forEach(task => {
      if (projectIds.has(task.project_id)) {
        validRelationships++;
      } else {
        invalidRelationships++;
        orphanedTasks.push({
          taskId: task.id,
          projectId: task.project_id,
          taskType: task.task_type
        });
      }
    });
    
    results.relationships.valid = validRelationships;
    results.relationships.invalid = invalidRelationships;
    results.relationships.orphaned = orphanedTasks;
    
    logSuccess(`Valid relationships: ${validRelationships}`);
    
    if (invalidRelationships > 0) {
      logError(`Invalid relationships: ${invalidRelationships}`);
      logWarning('Found tasks with non-existent project_id references');
      
      console.log('\nOrphaned tasks (project_id does not exist):');
      orphanedTasks.slice(0, 10).forEach(ot => {
        logError(`  Task ID ${ot.taskId} references non-existent Project ID ${ot.projectId} (Type: ${ot.taskType})`);
      });
      
      results.issues.push({
        severity: 'HIGH',
        issue: `${invalidRelationships} task(s) have invalid project_id references`,
        recommendation: 'Fix orphaned tasks by updating project_id to valid project IDs or delete them'
      });
    }
    
    // Check projects with no tasks
    const projectsWithTasks = new Set(results.tasks.data.map(t => t.project_id));
    const projectsWithoutTasks = results.projects.data.filter(p => !projectsWithTasks.has(p.id));
    
    if (projectsWithoutTasks.length > 0) {
      logWarning(`${projectsWithoutTasks.length} project(s) have no tasks`);
      console.log('\nProjects without tasks:');
      projectsWithoutTasks.slice(0, 10).forEach(p => {
        logInfo(`  Project ID ${p.id}: ${p.project_number} - ${p.project_name || 'N/A'}`);
      });
      
      results.issues.push({
        severity: 'MEDIUM',
        issue: `${projectsWithoutTasks.length} project(s) have no tasks assigned`,
        recommendation: 'This is expected if projects were just created. Create tasks for these projects.'
      });
    }
  } else {
    logWarning('Cannot verify relationships - missing projects or tasks data');
  }

  // Step 7: API Endpoint Simulation
  logSection('STEP 7: API Endpoint Simulation');
  
  if (results.projects.count > 0) {
    // Test the actual query used by the API endpoint /tasks/project/:projectId
    const testProject = results.projects.data[0];
    logInfo(`Testing API query for Project ID: ${testProject.id} (${testProject.project_number})`);
    
    try {
      // Simulate the exact query from server/routes/tasks.js line 242-264
      const { data: apiTasks, error: apiError } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email)
        `)
        .eq('project_id', testProject.id)
        .order('created_at', { ascending: false });
      
      if (apiError) {
        logError(`API query failed: ${apiError.message}`);
        logError(`Error code: ${apiError.code}`);
        results.apiSimulation.success = false;
        results.apiSimulation.errors.push({
          projectId: testProject.id,
          error: apiError.message,
          code: apiError.code
        });
        results.issues.push({
          severity: 'CRITICAL',
          issue: 'API endpoint query failed',
          error: apiError.message,
          recommendation: 'Check Supabase RLS policies or table permissions'
        });
      } else {
        const taskCount = apiTasks?.length || 0;
        results.apiSimulation.success = true;
        
        if (taskCount === 0) {
          logWarning(`API query returned 0 tasks for Project ID ${testProject.id}`);
          logInfo('This matches the frontend issue - no tasks showing under projects');
        } else {
          logSuccess(`API query returned ${taskCount} task(s) for Project ID ${testProject.id}`);
          logInfo('API endpoint is working correctly');
        }
      }
    } catch (err) {
      logError(`API simulation error: ${err.message}`);
      results.apiSimulation.success = false;
      results.apiSimulation.errors.push({
        projectId: testProject.id,
        error: err.message
      });
    }
  } else {
    logWarning('Cannot test API endpoint - no projects available');
  }

  // Step 8: Data Type Verification
  logSection('STEP 8: Data Type Verification');
  
  if (results.tasks.count > 0) {
    const sampleTask = results.tasks.data[0];
    
    // Check if project_id is the correct type
    const projectIdType = typeof sampleTask.project_id;
    if (projectIdType === 'number') {
      logSuccess(`project_id data type: ${projectIdType} (correct)`);
    } else {
      logError(`project_id data type: ${projectIdType} (expected: number)`);
      results.issues.push({
        severity: 'HIGH',
        issue: 'project_id has incorrect data type',
        recommendation: 'Ensure project_id is stored as BIGINT/INTEGER in database'
      });
    }
    
    // Check if project IDs match type
    if (results.projects.count > 0) {
      const sampleProject = results.projects.data[0];
      const projectIdType = typeof sampleProject.id;
      const taskProjectIdType = typeof sampleTask.project_id;
      
      if (projectIdType === taskProjectIdType) {
        logSuccess('Project and Task ID types match');
      } else {
        logError(`Type mismatch: Project ID is ${projectIdType}, Task project_id is ${taskProjectIdType}`);
        results.issues.push({
          severity: 'HIGH',
          issue: 'ID type mismatch between projects and tasks',
          recommendation: 'Ensure both use the same numeric type (BIGINT)'
        });
      }
    }
  }

  // Step 9: Summary and Recommendations
  logSection('STEP 9: QA Summary & Recommendations');
  
  console.log('\n📊 VERIFICATION SUMMARY:');
  console.log('─'.repeat(80));
  log(`Connection: ${results.connection ? '✅ PASS' : '❌ FAIL'}`, results.connection ? 'green' : 'red');
  log(`Projects: ${results.projects.count} found`, results.projects.count > 0 ? 'green' : 'yellow');
  log(`Tasks: ${results.tasks.count} found`, results.tasks.count > 0 ? 'green' : 'yellow');
  log(`Valid Relationships: ${results.relationships.valid}`, results.relationships.valid > 0 ? 'green' : 'yellow');
  log(`Invalid Relationships: ${results.relationships.invalid}`, results.relationships.invalid === 0 ? 'green' : 'red');
  log(`API Simulation: ${results.apiSimulation.success ? '✅ PASS' : '❌ FAIL'}`, results.apiSimulation.success ? 'green' : 'red');
  
  if (results.issues.length > 0) {
    console.log('\n🚨 ISSUES FOUND:');
    console.log('─'.repeat(80));
    
    results.issues.forEach((issue, idx) => {
      const severityColor = issue.severity === 'CRITICAL' ? 'red' : 
                           issue.severity === 'HIGH' ? 'yellow' : 'cyan';
      log(`\n${idx + 1}. [${issue.severity}] ${issue.issue}`, severityColor);
      if (issue.error) {
        log(`   Error: ${issue.error}`, 'red');
      }
      if (issue.recommendation) {
        log(`   💡 Recommendation: ${issue.recommendation}`, 'cyan');
      }
    });
  } else {
    logSuccess('No critical issues found!');
  }
  
  console.log('\n📋 RECOMMENDATIONS:');
  console.log('─'.repeat(80));
  
  // Generate recommendations based on findings
  if (results.projects.count === 0) {
    logWarning('1. Create at least one project in the database');
    logInfo('   Use the admin interface or API to create a project');
  }
  
  if (results.tasks.count === 0) {
    logWarning('2. Create tasks for your projects');
    logInfo('   Tasks are required to show under projects in the dashboard');
    logInfo('   Use the admin interface: /admin/create-task/:projectId');
  }
  
  if (results.relationships.invalid > 0) {
    logError('3. Fix orphaned tasks with invalid project_id references');
    logInfo('   Update or delete tasks that reference non-existent projects');
  }
  
  if (!results.apiSimulation.success) {
    logError('4. Fix API endpoint query issues');
    logInfo('   Check Supabase RLS policies and table permissions');
    logInfo('   Verify service_role key has proper access');
  }
  
  if (results.projects.count > 0 && results.tasks.count > 0 && results.relationships.valid === 0) {
    logError('5. CRITICAL: No valid task-project relationships found');
    logInfo('   All tasks have invalid project_id values');
    logInfo('   This is the root cause of tasks not showing under projects');
    logInfo('   Action: Update task project_id values to match existing project IDs');
  }
  
  if (results.projects.count > 0 && results.tasks.count === 0) {
    logWarning('6. ROOT CAUSE IDENTIFIED: No tasks exist in database');
    logInfo('   Projects are showing correctly, but there are no tasks to display');
    logInfo('   Solution: Create tasks for your projects using the admin interface');
  }
  
  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (results.issues.filter(i => i.severity === 'CRITICAL').length > 0) {
    log('🔴 VERDICT: CRITICAL ISSUES FOUND - IMMEDIATE ACTION REQUIRED', 'red');
  } else if (results.issues.filter(i => i.severity === 'HIGH').length > 0) {
    log('🟡 VERDICT: HIGH PRIORITY ISSUES FOUND - REVIEW RECOMMENDED', 'yellow');
  } else if (results.tasks.count === 0 && results.projects.count > 0) {
    log('🟡 VERDICT: NO TASKS IN DATABASE - THIS EXPLAINS THE ISSUE', 'yellow');
    log('   Projects are showing, but tasks are not because none exist.', 'yellow');
  } else {
    log('🟢 VERDICT: DATABASE INTEGRITY VERIFIED', 'green');
  }
  console.log('='.repeat(80) + '\n');
}

// Run the QA verification
main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    logError(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
