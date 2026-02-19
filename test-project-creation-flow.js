/**
 * Test Project Creation Flow
 * Simulates the actual project creation to see where it fails
 */

const db = require('./server/db');
const { ensureProjectDirectory } = require('./server/utils/pdfFileManager');

async function testProjectCreationFlow() {
  console.log('=== Testing Project Creation Flow ===\n');
  
  // Simulate project creation
  const testProjectNumber = '02-2026-FLOWTEST';
  
  console.log('Step 1: Simulating project data insertion');
  try {
    const projectData = {
      projectNumber: testProjectNumber,
      projectName: 'Test Project Flow',
      customerEmails: ['test@example.com'],
      soilSpecs: {},
      concreteSpecs: {}
    };
    
    // Try to insert (this might fail if project already exists, that's OK)
    try {
      const project = await db.insert('projects', projectData);
      console.log('✅ Project inserted:', project.id);
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate'))) {
        console.log('ℹ️  Project already exists (this is OK for testing)');
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('❌ Error inserting project:', err.message);
    return;
  }
  
  console.log('\nStep 2: Calling ensureProjectDirectory (same as in project creation route)');
  console.log('Project number:', testProjectNumber);
  
  let folderCreationResult = {
    success: false,
    path: null,
    error: null,
    warnings: [],
    onedriveResult: null
  };
  
  console.log(`📁 Creating project folder for: ${testProjectNumber}`);
  try {
    const folderResult = await ensureProjectDirectory(testProjectNumber);
    folderCreationResult = {
      success: folderResult.success,
      path: folderResult.path,
      error: folderResult.error,
      warnings: folderResult.warnings || []
    };
    
    console.log('\n📊 Folder Creation Result:');
    console.log(JSON.stringify(folderCreationResult, null, 2));
    
    if (folderResult.success) {
      console.log(`\n✅ Project folder created/verified: ${folderResult.path}`);
      if (folderResult.warnings && folderResult.warnings.length > 0) {
        console.warn('⚠️  Folder creation warnings:', folderResult.warnings);
      }
    } else {
      console.error('\n❌ Error creating project folder:', folderResult.error);
      console.error('Folder creation details:', JSON.stringify(folderResult.details, null, 2));
    }
  } catch (folderError) {
    folderCreationResult = {
      success: false,
      path: null,
      error: folderError.message,
      warnings: []
    };
    console.error('\n❌ Unexpected error creating project folder:', folderError);
    console.error('Folder error stack:', folderError.stack);
  }
  
  console.log('\n=== Summary ===');
  console.log('Folder creation success:', folderCreationResult.success);
  console.log('Folder path:', folderCreationResult.path);
  console.log('Error:', folderCreationResult.error);
  console.log('Warnings:', folderCreationResult.warnings);
  
  if (folderCreationResult.success && folderCreationResult.path) {
    const fs = require('fs');
    const path = require('path');
    const folderExists = fs.existsSync(folderCreationResult.path);
    console.log('\n✅ Verification: Folder exists in filesystem:', folderExists);
    
    if (folderExists) {
      console.log('✅ SUCCESS: Folder was created and exists!');
    } else {
      console.log('⚠️  WARNING: Folder creation reported success but folder does not exist');
      console.log('   This may be a OneDrive sync delay issue.');
    }
  }
}

// Run test
testProjectCreationFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
