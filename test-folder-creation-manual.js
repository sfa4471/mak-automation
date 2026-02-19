/**
 * Manual Test Script for Folder Creation
 * Run this to test folder creation independently
 * 
 * Usage: node test-folder-creation-manual.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function testFolderCreation(workflowPath) {
  console.log('\n=== Manual Folder Creation Test ===\n');
  
  // Use workflow path from database, or fallback to user's path
  const testPath = workflowPath || 'C:\\Users\\fadyn\\OneDrive\\Desktop\\MAK_DRIVE';
  const testProjectNumber = '02-2026-TEST';
  const testFolder = path.join(testPath, testProjectNumber);
  
  console.log('Using path:', testPath);
  if (!workflowPath) {
    console.log('⚠️  Using hardcoded path (workflow path not in database)');
  }
  
  console.log('Step 1: Check base path');
  console.log('  Path:', testPath);
  console.log('  Exists:', fs.existsSync(testPath));
  
  if (fs.existsSync(testPath)) {
    const stats = fs.statSync(testPath);
    console.log('  Is Directory:', stats.isDirectory());
    
    try {
      fs.accessSync(testPath, fs.constants.W_OK);
      console.log('  ✅ Is Writable: YES\n');
    } catch (error) {
      console.log('  ❌ Is Writable: NO -', error.message, '\n');
      return;
    }
  } else {
    console.log('  ❌ Path does not exist!\n');
    return;
  }
  
  console.log('Step 2: Test folder creation');
  console.log('  Target folder:', testFolder);
  console.log('  Folder exists before:', fs.existsSync(testFolder));
  
  try {
    console.log('  Creating folder...');
    fs.mkdirSync(testFolder, { recursive: true });
    console.log('  ✅ mkdirSync completed');
    
    // Wait a moment for OneDrive sync
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('  Folder exists after creation:', fs.existsSync(testFolder));
    
    if (fs.existsSync(testFolder)) {
      const stats = fs.statSync(testFolder);
      console.log('  Is Directory:', stats.isDirectory());
      
      // Test write
      const testFile = path.join(testFolder, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      console.log('  ✅ Write test passed');
      fs.unlinkSync(testFile);
      
      // Create subdirectories
      const subdirs = ['Proctor', 'Density', 'CompressiveStrength', 'Rebar', 'CylinderPickup'];
      console.log('\nStep 3: Create subdirectories');
      for (const subdir of subdirs) {
        const subdirPath = path.join(testFolder, subdir);
        fs.mkdirSync(subdirPath, { recursive: true });
        console.log(`  ✅ Created: ${subdir}`);
      }
      
      console.log('\n✅ All tests passed!');
      console.log('Folder location:', testFolder);
      console.log('\nYou can now check if the folder exists in File Explorer.');
      console.log('To clean up, delete:', testFolder);
    } else {
      console.log('  ❌ Folder was not created or not immediately visible');
      console.log('  This may be a OneDrive sync delay issue.');
    }
  } catch (error) {
    console.log('  ❌ Error:', error.message);
    console.log('  Stack:', error.stack);
  }
}

// Test database query
async function testDatabaseQuery() {
  console.log('\n=== Database Query Test ===\n');
  
  try {
    const db = require('./server/db');
    console.log('Database module loaded');
    console.log('Is Supabase:', db.isSupabase());
    
    const setting = await db.get('app_settings', { key: 'workflow_base_path' });
    console.log('Query result:', JSON.stringify(setting, null, 2));
    
    if (setting && setting.value) {
      console.log('✅ Workflow path found:', setting.value);
      return setting.value;
    } else {
      console.log('❌ Workflow path NOT found in database');
      console.log('\n🔧 FIX: You need to configure it in Settings UI or insert directly:');
      console.log(`
-- Run this in Supabase SQL Editor:
INSERT INTO app_settings (key, value, description) 
VALUES ('workflow_base_path', 'C:\\\\Users\\\\fadyn\\\\OneDrive\\\\Desktop\\\\MAK_DRIVE', 'Base folder path for project folders')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
      `);
      return null;
    }
  } catch (error) {
    console.log('❌ Database query failed:', error.message);
    console.log('Stack:', error.stack);
    return null;
  }
}

// Run tests
(async () => {
  const workflowPath = await testDatabaseQuery();
  await testFolderCreation(workflowPath);
})();
