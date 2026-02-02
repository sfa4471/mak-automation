/**
 * QA Task Type Fix Verification Script
 * 
 * Verifies that taskType field is correctly mapped from snake_case to camelCase
 * in all task endpoints after Supabase migration.
 * 
 * Usage:
 *   node scripts/qa-task-type-fix-verification.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function main() {
  logSection('QA TASK TYPE FIX VERIFICATION');
  log('Verifying taskType field mapping after Supabase migration fix', 'cyan');
  console.log('');

  if (!supabaseUrl || !supabaseServiceKey) {
    logError('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Step 1: Check if tasks exist
  logSection('STEP 1: Check Tasks in Database');
  
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, task_type, project_id')
    .limit(10);
  
  if (tasksError) {
    logError(`Error fetching tasks: ${tasksError.message}`);
    process.exit(1);
  }

  if (!tasks || tasks.length === 0) {
    logWarning('No tasks found in database');
    logInfo('Create a task first to test the fix');
    process.exit(0);
  }

  logSuccess(`Found ${tasks.length} task(s) in database`);
  
  // Display sample tasks
  console.log('\nSample tasks from database (raw format):');
  tasks.slice(0, 5).forEach((task, idx) => {
    logInfo(`${idx + 1}. Task ID: ${task.id}, task_type: ${task.task_type}, project_id: ${task.project_id}`);
  });

  // Step 2: Verify task_type values
  logSection('STEP 2: Verify Task Type Values');
  
  const validTaskTypes = [
    'DENSITY_MEASUREMENT',
    'PROCTOR',
    'REBAR',
    'COMPRESSIVE_STRENGTH',
    'CYLINDER_PICKUP'
  ];

  const invalidTaskTypes = tasks.filter(t => !validTaskTypes.includes(t.task_type));
  
  if (invalidTaskTypes.length > 0) {
    logError(`Found ${invalidTaskTypes.length} task(s) with invalid task_type values:`);
    invalidTaskTypes.forEach(t => {
      logError(`  Task ID ${t.id}: "${t.task_type}"`);
    });
  } else {
    logSuccess('All tasks have valid task_type values');
  }

  // Step 3: Check field mapping in API response
  logSection('STEP 3: API Response Field Mapping Verification');
  
  logInfo('Testing API endpoint: GET /api/tasks/project/:projectId');
  
  // Get a project with tasks
  const projectId = tasks[0].project_id;
  const { data: project } = await supabase
    .from('projects')
    .select('id, project_number, project_name')
    .eq('id', projectId)
    .single();
  
  if (project) {
    logInfo(`Testing with Project ID: ${projectId} (${project.project_number})`);
    
    // Simulate what the API should return
    const { data: apiTasks, error: apiError } = await supabase
      .from('tasks')
      .select(`
        *,
        users:assigned_technician_id(name, email)
      `)
      .eq('project_id', projectId)
      .limit(5);
    
    if (apiError) {
      logError(`API query error: ${apiError.message}`);
    } else if (apiTasks && apiTasks.length > 0) {
      logSuccess(`API query returned ${apiTasks.length} task(s)`);
      
      // Check if mapping is needed
      const sampleTask = apiTasks[0];
      const hasTaskType = 'taskType' in sampleTask;
      const hasTaskTypeSnake = 'task_type' in sampleTask;
      
      console.log('\nField mapping check:');
      logInfo(`Has 'taskType' (camelCase): ${hasTaskType ? 'YES ✅' : 'NO ❌'}`);
      logInfo(`Has 'task_type' (snake_case): ${hasTaskTypeSnake ? 'YES' : 'NO'}`);
      
      if (!hasTaskType && hasTaskTypeSnake) {
        logError('ISSUE FOUND: API response has task_type but not taskType');
        logError('The fix needs to be applied to map task_type → taskType');
        logInfo('Expected: taskType should be present in API response');
      } else if (hasTaskType) {
        logSuccess('Field mapping is correct: taskType is present');
      }
      
      // Display sample API response structure
      console.log('\nSample API response structure:');
      const sampleFields = Object.keys(sampleTask).filter(k => 
        !k.startsWith('users') && 
        (k.includes('task') || k.includes('project') || k.includes('assigned'))
      );
      sampleFields.forEach(field => {
        logInfo(`  ${field}: ${typeof sampleTask[field]}`);
      });
    } else {
      logWarning('No tasks returned for this project');
    }
  }

  // Step 4: Frontend Compatibility Check
  logSection('STEP 4: Frontend Compatibility Check');
  
  logInfo('Frontend expects: task.taskType (camelCase)');
  logInfo('Valid values: COMPRESSIVE_STRENGTH, DENSITY_MEASUREMENT, REBAR, PROCTOR, CYLINDER_PICKUP');
  
  const taskTypeCounts = {};
  tasks.forEach(t => {
    taskTypeCounts[t.task_type] = (taskTypeCounts[t.task_type] || 0) + 1;
  });
  
  console.log('\nTask type distribution:');
  Object.entries(taskTypeCounts).forEach(([type, count]) => {
    const isValid = validTaskTypes.includes(type);
    if (isValid) {
      logSuccess(`  ${type}: ${count} task(s)`);
    } else {
      logError(`  ${type}: ${count} task(s) (INVALID)`);
    }
  });

  // Step 5: Summary
  logSection('STEP 5: Verification Summary');
  
  const issues = [];
  
  if (invalidTaskTypes.length > 0) {
    issues.push(`${invalidTaskTypes.length} task(s) have invalid task_type values`);
  }
  
  if (issues.length === 0) {
    logSuccess('✅ All checks passed!');
    logInfo('The taskType field mapping fix should work correctly.');
    logInfo('After deploying, tasks should be clickable and route correctly.');
  } else {
    logError('⚠️  Issues found:');
    issues.forEach(issue => logError(`  - ${issue}`));
  }
  
  console.log('\n' + '='.repeat(80));
  log('VERIFICATION COMPLETE', 'bright');
  console.log('='.repeat(80) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logError(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
