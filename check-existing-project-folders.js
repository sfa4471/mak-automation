/**
 * Check Existing Project Folders
 * Lists all project folders that have been created
 */

const fs = require('fs');
const path = require('path');
const db = require('./server/db');

async function checkProjectFolders() {
  console.log('=== Checking Project Folders ===\n');
  
  // Get workflow path
  const { getWorkflowBasePath } = require('./server/utils/pdfFileManager');
  const workflowPath = await getWorkflowBasePath();
  
  if (!workflowPath) {
    console.log('❌ Workflow path not configured');
    return;
  }
  
  console.log('Workflow path:', workflowPath);
  console.log('Path exists:', fs.existsSync(workflowPath));
  console.log('');
  
  // Get all projects from database
  console.log('Step 1: Getting projects from database...');
  let projects;
  try {
    if (db.isSupabase()) {
      const { supabase } = require('./server/db/supabase');
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_number, project_name, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      projects = data || [];
    } else {
      // SQLite fallback
      const sqliteDb = require('./server/database');
      projects = await new Promise((resolve, reject) => {
        sqliteDb.all(
          'SELECT id, projectNumber as project_number, projectName as project_name, createdAt as created_at FROM projects ORDER BY createdAt DESC LIMIT 10',
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`Found ${projects.length} projects in database\n`);
  } catch (err) {
    console.error('❌ Error getting projects:', err.message);
    return;
  }
  
  // Check which projects have folders
  console.log('Step 2: Checking which projects have folders...\n');
  const results = [];
  
  for (const project of projects) {
    const projectNumber = project.project_number;
    const { sanitizeProjectNumber } = require('./server/utils/pdfFileManager');
    const sanitized = sanitizeProjectNumber(projectNumber);
    const projectFolder = path.join(workflowPath, sanitized);
    const folderExists = fs.existsSync(projectFolder);
    
    results.push({
      projectNumber,
      projectName: project.project_name,
      folderPath: projectFolder,
      folderExists,
      created: project.created_at
    });
    
    const status = folderExists ? '✅' : '❌';
    console.log(`${status} ${projectNumber} (${project.project_name})`);
    console.log(`   Folder: ${projectFolder}`);
    console.log(`   Exists: ${folderExists}`);
    if (folderExists) {
      const stats = fs.statSync(projectFolder);
      console.log(`   Created: ${stats.birthtime}`);
      // Count subdirectories
      const subdirs = fs.readdirSync(projectFolder).filter(f => {
        const fullPath = path.join(projectFolder, f);
        return fs.statSync(fullPath).isDirectory();
      });
      console.log(`   Subdirectories: ${subdirs.length}`);
    }
    console.log('');
  }
  
  // Summary
  const withFolders = results.filter(r => r.folderExists).length;
  const withoutFolders = results.filter(r => !r.folderExists).length;
  
  console.log('=== Summary ===');
  console.log(`Total projects checked: ${results.length}`);
  console.log(`Projects with folders: ${withFolders} ✅`);
  console.log(`Projects without folders: ${withoutFolders} ❌`);
  
  if (withoutFolders > 0) {
    console.log('\n⚠️  Projects missing folders:');
    results.filter(r => !r.folderExists).forEach(r => {
      console.log(`   - ${r.projectNumber} (${r.projectName})`);
    });
    console.log('\n💡 These projects need folder creation. Use the retry endpoint:');
    console.log(`   POST /api/projects/{id}/retry-folder`);
  }
  
  // List all folders in workflow path
  console.log('\n=== All Folders in Workflow Path ===');
  try {
    const allItems = fs.readdirSync(workflowPath);
    const folders = allItems.filter(item => {
      const fullPath = path.join(workflowPath, item);
      return fs.statSync(fullPath).isDirectory() && !item.startsWith('.');
    });
    
    console.log(`Found ${folders.length} folders:`);
    folders.forEach(folder => {
      const fullPath = path.join(workflowPath, folder);
      const stats = fs.statSync(fullPath);
      console.log(`  - ${folder} (created: ${stats.birthtime})`);
    });
  } catch (err) {
    console.error('Error reading workflow path:', err.message);
  }
}

checkProjectFolders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
