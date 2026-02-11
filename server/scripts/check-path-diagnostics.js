/**
 * Path Diagnostics Script
 * Checks if a path exists, is accessible, and has proper permissions
 * 
 * Usage: node server/scripts/check-path-diagnostics.js [path]
 * Example: node server/scripts/check-path-diagnostics.js "C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE"
 */

const fs = require('fs');
const path = require('path');

// Get path from command line argument or use default
const targetPath = process.argv[2] || 'C:\\Users\\fadyn\\OneDrive\\Desktop\\MAK_DRIVE';
const parentPath = path.dirname(targetPath);

console.log('='.repeat(80));
console.log('PATH DIAGNOSTICS REPORT');
console.log('='.repeat(80));
console.log(`Target Path: ${targetPath}`);
console.log(`Parent Path: ${parentPath}`);
console.log('='.repeat(80));
console.log('');

// Check 1: Does parent directory exist?
console.log('1. CHECKING PARENT DIRECTORY...');
console.log(`   Path: ${parentPath}`);
try {
  if (fs.existsSync(parentPath)) {
    console.log('   ✓ Parent directory EXISTS');
    
    const parentStats = fs.statSync(parentPath);
    if (parentStats.isDirectory()) {
      console.log('   ✓ Parent is a DIRECTORY');
    } else {
      console.log('   ✗ Parent is NOT a directory (it\'s a file)');
    }
  } else {
    console.log('   ✗ Parent directory DOES NOT EXIST');
    console.log('   → ACTION: Create the parent directory first');
    process.exit(1);
  }
} catch (error) {
  console.log(`   ✗ ERROR checking parent: ${error.message}`);
  console.log(`   Code: ${error.code}`);
  process.exit(1);
}
console.log('');

// Check 2: Does target path exist?
console.log('2. CHECKING TARGET PATH...');
console.log(`   Path: ${targetPath}`);
try {
  if (fs.existsSync(targetPath)) {
    console.log('   ✓ Target path EXISTS');
    
    const targetStats = fs.statSync(targetPath);
    if (targetStats.isDirectory()) {
      console.log('   ✓ Target is a DIRECTORY');
    } else {
      console.log('   ✗ Target is NOT a directory (it\'s a file)');
    }
  } else {
    console.log('   ✗ Target path DOES NOT EXIST');
    console.log('   → ACTION: Will attempt to create it...');
    
    try {
      fs.mkdirSync(targetPath, { recursive: true });
      console.log('   ✓ Successfully CREATED target directory');
    } catch (createError) {
      console.log(`   ✗ FAILED to create directory: ${createError.message}`);
      console.log(`   Code: ${createError.code}`);
      console.log('   → ACTION: Create the folder manually in File Explorer');
    }
  }
} catch (error) {
  console.log(`   ✗ ERROR checking target: ${error.message}`);
  console.log(`   Code: ${error.code}`);
}
console.log('');

// Check 3: Write permissions
console.log('3. CHECKING WRITE PERMISSIONS...');
console.log(`   Path: ${targetPath}`);
try {
  // Check if we can write to the directory
  fs.accessSync(targetPath, fs.constants.W_OK);
  console.log('   ✓ Directory is WRITABLE');
  
  // Try to create a test file
  const testFile = path.join(targetPath, '.write_test_' + Date.now() + '.txt');
  try {
    fs.writeFileSync(testFile, 'test');
    console.log('   ✓ Successfully CREATED test file');
    
    // Clean up
    fs.unlinkSync(testFile);
    console.log('   ✓ Successfully DELETED test file');
  } catch (writeError) {
    console.log(`   ✗ Cannot write files: ${writeError.message}`);
    console.log(`   Code: ${writeError.code}`);
  }
} catch (error) {
  console.log(`   ✗ Directory is NOT writable: ${error.message}`);
  console.log(`   Code: ${error.code}`);
  console.log('   → ACTION: Check folder permissions and OneDrive sync status');
}
console.log('');

// Check 4: OneDrive specific checks
console.log('4. ONEDRIVE SPECIFIC CHECKS...');
const isOneDrivePath = targetPath.toLowerCase().includes('onedrive');
if (isOneDrivePath) {
  console.log('   ✓ Path is in OneDrive location');
  
  // Check if OneDrive folder structure exists
  const onedriveRoot = targetPath.split(path.sep).slice(0, 3).join(path.sep);
  console.log(`   OneDrive root: ${onedriveRoot}`);
  
  try {
    if (fs.existsSync(onedriveRoot)) {
      console.log('   ✓ OneDrive root directory exists');
    } else {
      console.log('   ✗ OneDrive root directory does not exist');
      console.log('   → ACTION: Ensure OneDrive is installed and synced');
    }
  } catch (error) {
    console.log(`   ✗ Error checking OneDrive root: ${error.message}`);
  }
  
  // Check for OneDrive sync status files (if they exist)
  const syncStatusPath = path.join(onedriveRoot, 'desktop.ini');
  try {
    if (fs.existsSync(syncStatusPath)) {
      console.log('   ✓ OneDrive sync files detected');
    }
  } catch (error) {
    // Ignore - not critical
  }
  
  console.log('   → TIP: Ensure OneDrive is running and synced');
  console.log('   → TIP: Check if files are set to "Always keep on this device"');
} else {
  console.log('   ℹ Path is not in OneDrive location');
}
console.log('');

// Check 5: Path length (Windows specific)
console.log('5. WINDOWS PATH LENGTH CHECK...');
if (process.platform === 'win32') {
  const pathLength = targetPath.length;
  console.log(`   Path length: ${pathLength} characters`);
  
  if (pathLength > 260) {
    console.log('   ⚠ Path exceeds Windows 260 character limit');
    console.log('   → Will use long path prefix (\\\\?\\\) if needed');
    
    const longPath = '\\\\?\\' + path.resolve(targetPath);
    if (longPath.length <= 32767) {
      console.log(`   ✓ Long path would be valid (${longPath.length} chars)`);
    } else {
      console.log(`   ✗ Even with long path prefix, path is too long (${longPath.length} chars)`);
    }
  } else {
    console.log('   ✓ Path length is within Windows limits');
  }
} else {
  console.log('   ℹ Not a Windows system');
}
console.log('');

// Check 6: Path format validation
console.log('6. PATH FORMAT VALIDATION...');
// Check for invalid characters, but allow : in drive letters (C:\, D:\, etc.)
const driveLetterPattern = /^[A-Za-z]:\\/;
const hasDriveLetter = driveLetterPattern.test(targetPath);
const pathWithoutDrive = hasDriveLetter ? targetPath.substring(2) : targetPath;
const invalidChars = /[<>:"|?*]/;
if (invalidChars.test(pathWithoutDrive)) {
  console.log('   ✗ Path contains invalid characters for Windows');
  const matches = pathWithoutDrive.match(invalidChars);
  const uniqueChars = [...new Set(matches)];
  console.log(`   Invalid characters found: ${uniqueChars.join(', ')}`);
} else {
  console.log('   ✓ Path format is valid');
}
console.log('');

// Summary
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

try {
  const exists = fs.existsSync(targetPath);
  const isDir = exists && fs.statSync(targetPath).isDirectory();
  const isWritable = exists && (() => {
    try {
      fs.accessSync(targetPath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })();
  
  if (exists && isDir && isWritable) {
    console.log('✓ PATH IS VALID AND READY TO USE');
    console.log('');
    console.log('The path can be used for workflow base path configuration.');
  } else {
    console.log('✗ PATH HAS ISSUES');
    console.log('');
    if (!exists) {
      console.log('  - Path does not exist');
      console.log('  → Create the folder manually or ensure parent exists for auto-creation');
    }
    if (exists && !isDir) {
      console.log('  - Path exists but is not a directory');
    }
    if (exists && !isWritable) {
      console.log('  - Path exists but is not writable');
      console.log('  → Check permissions and OneDrive sync status');
    }
  }
} catch (error) {
  console.log(`✗ ERROR generating summary: ${error.message}`);
}

console.log('='.repeat(80));
