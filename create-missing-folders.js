/**
 * Create Missing Project Folders
 * Creates folders for all projects that don't have them
 */

const db = require('./server/db');
const { ensureProjectDirectory } = require('./server/utils/pdfFileManager');

async function createMissingFolders() {
  console.log('=== Creating Missing Project Folders ===\n');
  
  // Get all projects
  let projects;
  try {
    if (db.isSupabase()) {
      const { supabase } = require('./server/db/supabase');
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_number, project_name')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      projects = data || [];
    } else {
      const sqliteDb = require('./server/database');
      projects = await new Promise((resolve, reject) => {
        sqliteDb.all(
          'SELECT id, projectNumber as project_number, projectName as project_name FROM projects',
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`Found ${projects.length} projects\n`);
  } catch (err) {
    console.error('❌ Error getting projects:', err.message);
    return;
  }
  
  // Check and create folders
  const fs = require('fs');
  const path = require('path');
  const { getWorkflowBasePath, sanitizeProjectNumber } = require('./server/utils/pdfFileManager');
  const workflowPath = await getWorkflowBasePath();
  
  if (!workflowPath) {
    console.log('❌ Workflow path not configured');
    return;
  }
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (const project of projects) {
    const projectNumber = project.project_number;
    const sanitized = sanitizeProjectNumber(projectNumber);
    const projectFolder = path.join(workflowPath, sanitized);
    const folderExists = fs.existsSync(projectFolder);
    
    if (folderExists) {
      console.log(`⏭️  Skipping ${projectNumber} - folder already exists`);
      results.skipped.push(projectNumber);
      continue;
    }
    
    console.log(`\n📁 Creating folder for ${projectNumber} (${project.project_name})...`);
    try {
      const folderResult = await ensureProjectDirectory(projectNumber);
      
      if (folderResult.success) {
        console.log(`✅ Created: ${folderResult.path}`);
        if (folderResult.warnings && folderResult.warnings.length > 0) {
          console.log(`   Warnings: ${folderResult.warnings.join(', ')}`);
        }
        results.success.push({ projectNumber, path: folderResult.path });
      } else {
        console.log(`❌ Failed: ${folderResult.error}`);
        results.failed.push({ projectNumber, error: folderResult.error });
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      results.failed.push({ projectNumber, error: err.message });
    }
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`✅ Created: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n⚠️  Failed projects:');
    results.failed.forEach(r => {
      console.log(`   - ${r.projectNumber}: ${r.error}`);
    });
  }
  
  if (results.success.length > 0) {
    console.log('\n✅ Successfully created folders for:');
    results.success.forEach(r => {
      console.log(`   - ${r.projectNumber}`);
    });
  }
}

createMissingFolders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
