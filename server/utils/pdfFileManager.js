const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Get base path from environment variable, default to ./pdfs in project root
const PDF_BASE_PATH = process.env.PDF_BASE_PATH || path.join(__dirname, '..', 'pdfs');

// Lazy load OneDrive service to avoid circular dependencies
let onedriveService = null;
function getOneDriveService() {
  if (!onedriveService) {
    try {
      onedriveService = require('../services/onedriveService');
    } catch (err) {
      // OneDrive service not available, will use default path
      return null;
    }
  }
  return onedriveService;
}

/**
 * Get workflow base path from app_settings table.
 * When using Supabase with multi-tenant schema, pass tenantId to get the tenant's path.
 * @param {number|null|undefined} [tenantId] - Optional tenant ID (required when using Supabase multi-tenant)
 * @returns {Promise<string|null>} The workflow base path, or null if not set
 */
async function getWorkflowBasePath(tenantId) {
  console.log('🔍 [DIAGNOSTIC] getWorkflowBasePath() called', tenantId != null ? { tenantId } : '');
  try {
    const db = require('../db');
    console.log('🔍 [DIAGNOSTIC] Database module loaded, isSupabase:', db.isSupabase());

    const conditions = { key: 'workflow_base_path' };
    if (db.isSupabase()) {
      // Explicit tenant_id: match tenant row, or null for global row (tenant_id IS NULL)
      conditions.tenant_id = tenantId != null ? tenantId : null;
    }
    const setting = await db.get('app_settings', conditions);
    console.log('🔍 [DIAGNOSTIC] Database query result:', {
      found: !!setting,
      hasValue: !!(setting && setting.value),
      value: setting?.value,
      valueType: typeof setting?.value,
      fullSetting: setting
    });
    
    if (setting && setting.value && setting.value.trim() !== '') {
      const path = setting.value.trim();
      console.log('🔍 [DIAGNOSTIC] Returning path:', path);
      return path;
    }
    console.log('🔍 [DIAGNOSTIC] No path found, returning null');
    return null;
  } catch (error) {
    console.error('🔍 [DIAGNOSTIC] Error in getWorkflowBasePath:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    return null;
  }
}

/**
 * Validate a path exists and is writable
 * Handles OneDrive sync timing issues with retry logic
 * @param {string} pathToValidate - Path to validate
 * @returns {{valid: boolean, isWritable: boolean, error?: string}}
 */
function validatePath(pathToValidate) {
  if (!pathToValidate || typeof pathToValidate !== 'string') {
    return { valid: false, isWritable: false, error: 'Path is required' };
  }
  
  const trimmedPath = pathToValidate.trim();
  if (trimmedPath === '') {
    return { valid: false, isWritable: false, error: 'Path cannot be empty' };
  }

  // When the app runs on a cloud server (e.g. Linux), it cannot access paths on the user's Windows PC.
  // Return a clear message so users know to run locally or use a server path.
  const isWindowsAbsolutePath = /^[A-Za-z]:[\\\/]/.test(trimmedPath);
  if (isWindowsAbsolutePath && process.platform !== 'win32') {
    return {
      valid: false,
      isWritable: false,
      error: 'This path is on your Windows PC. The app is currently using a cloud server that cannot access your computer. To use this folder, run the app locally (npm run dev) on your PC, or configure a path that exists on the server.'
    };
  }

  // Windows-specific: Check for invalid characters
  // Note: Colon (:) is valid in drive letters (C:\), so we check for it in the wrong places
  if (process.platform === 'win32') {
    // Check for invalid characters, but allow : in drive letters (C:\, D:\, etc.)
    // Invalid chars: < > " | ? * and : (but only if not part of drive letter)
    const driveLetterPattern = /^[A-Za-z]:\\/;
    const hasDriveLetter = driveLetterPattern.test(trimmedPath);
    
    // Remove drive letter for checking invalid chars
    const pathWithoutDrive = hasDriveLetter ? trimmedPath.substring(2) : trimmedPath;
    
    // Check for invalid characters (excluding : if it's in drive letter)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(pathWithoutDrive)) {
      // Find which invalid chars are present
      const matches = pathWithoutDrive.match(invalidChars);
      const uniqueChars = [...new Set(matches)];
      return { 
        valid: false, 
        isWritable: false, 
        error: `Path contains invalid characters for Windows: ${uniqueChars.join(', ')}` 
      };
    }
  }
  
  // Check if path exists
  // For OneDrive paths, we'll be more lenient and provide better error messages
  const isOneDrivePath = trimmedPath.toLowerCase().includes('onedrive');
  let pathExists = false;
  
  try {
    pathExists = fs.existsSync(trimmedPath);
  } catch (error) {
    // Error checking path existence
    if (isOneDrivePath) {
      return { 
        valid: false, 
        isWritable: false, 
        error: 'Cannot access path. Please ensure OneDrive is running and synced. If the folder doesn\'t exist, create it in File Explorer first.' 
      };
    }
    return { valid: false, isWritable: false, error: `Cannot access path: ${error.message}` };
  }
  
  if (!pathExists) {
    // Check if parent directory exists - if so, we can suggest creating the folder
    const pathModule = require('path');
    const parentPath = pathModule.dirname(trimmedPath);
    const folderName = pathModule.basename(trimmedPath);
    const parentExists = fs.existsSync(parentPath);
    
    if (isOneDrivePath) {
      if (parentExists) {
        return { 
          valid: false, 
          isWritable: false, 
          error: `Folder "${folderName}" does not exist. Please create it in File Explorer at: ${parentPath}\n\nOr ensure OneDrive is synced if the folder exists in the cloud.` 
        };
      } else {
        return { 
          valid: false, 
          isWritable: false, 
          error: `Path does not exist. Please ensure the parent directory exists and OneDrive is synced.` 
        };
      }
    } else {
      if (parentExists) {
        return { 
          valid: false, 
          isWritable: false, 
          error: `Folder "${folderName}" does not exist. Please create it first, or the system will attempt to create it automatically.` 
        };
      } else {
        return { valid: false, isWritable: false, error: 'Path does not exist' };
      }
    }
  }
  
  // Check if it's a directory
  let stats;
  try {
    stats = fs.statSync(trimmedPath);
  } catch (statError) {
    if (isOneDrivePath) {
      return { 
        valid: false, 
        isWritable: false, 
        error: 'Cannot access path. Please ensure OneDrive is synced and the folder is available. Try refreshing OneDrive or ensuring files are set to "Always keep on this device".' 
      };
    } else {
      return { 
        valid: false, 
        isWritable: false, 
        error: `Cannot access path: ${statError.message}` 
      };
    }
  }
  
  if (!stats.isDirectory()) {
    return { valid: false, isWritable: false, error: 'Path is not a directory' };
  }
  
  // Check writability
  try {
    fs.accessSync(trimmedPath, fs.constants.W_OK);
    return { valid: true, isWritable: true };
  } catch (error) {
    // For OneDrive paths, provide more helpful error message
    if (isOneDrivePath) {
      return { 
        valid: true, 
        isWritable: false, 
        error: 'Path is not writable. Please ensure OneDrive is synced and you have write permissions. Check if files are set to "Always keep on this device" in OneDrive settings.' 
      };
    }
    return { 
      valid: true, 
      isWritable: false, 
      error: `Path is not writable: ${error.message}` 
    };
  }
}

/**
 * Get the effective base path for PDF storage
 * Priority order:
 * 1. workflow_base_path from app_settings (if set and valid)
 * 2. onedrive_base_path from app_settings (if set and valid) - backward compatibility
 * 3. PDF_BASE_PATH environment variable
 * 4. Default: ./pdfs in project root
 * @param {number|null|undefined} [tenantId] - Optional tenant ID for Supabase multi-tenant
 * @returns {Promise<{path: string, fromConfigured: boolean}>} Base path and whether it's the tenant's configured path
 */
async function getEffectiveBasePath(tenantId) {
  const fallbackPath = () => path.join(__dirname, '..', 'pdfs');
  // Priority 1: workflow_base_path from app_settings (per-tenant, then global fallback)
  const tid = tenantId != null ? Number(tenantId) : null;
  let workflowPath = await getWorkflowBasePath(tid);
  // When tenant-specific path is not set, fall back to key-only row (tenant_id null) so all PDFs use the same configured path
  if (!workflowPath && tid != null) {
    workflowPath = await getWorkflowBasePath(null);
    if (workflowPath) {
      console.log('[PDF path] Using global workflow path (no tenant-specific path for tenant', tid, '):', workflowPath);
    }
  }
  if (workflowPath) {
    const validation = validatePath(workflowPath);
    if (validation.valid && validation.isWritable) {
      console.log('[PDF path] Using configured workflow path for tenant', tid, ':', workflowPath);
      return { path: workflowPath, fromConfigured: true };
    } else {
      console.warn('Workflow path is configured but invalid:', workflowPath, validation.error || 'not writable');
    }
  } else if (tid != null) {
    console.warn('[PDF path] No workflow_base_path for tenant', tid, '- set in Settings → Workflow path. Using fallback.');
  }
  
  // Priority 2: OneDrive path (backward compatibility)
  const service = getOneDriveService();
  if (service) {
    try {
      const onedrivePath = await service.getBasePath();
      if (onedrivePath) {
        const status = await service.getPathStatus();
        if (status.valid && status.isWritable) {
          return { path: onedrivePath, fromConfigured: false };
        }
      }
    } catch (error) {
      console.warn('Error getting OneDrive path, using default:', error.message);
    }
  }
  
  // Priority 3: Environment variable
  if (PDF_BASE_PATH) {
    return { path: PDF_BASE_PATH, fromConfigured: false };
  }
  
  // Priority 4: Default
  return { path: fallbackPath(), fromConfigured: false };
}

// Test type to folder name mapping
const TEST_TYPE_FOLDERS = {
  'PROCTOR': 'Proctor',
  'DENSITY_MEASUREMENT': 'Density',
  'COMPRESSIVE_STRENGTH': 'CompressiveStrength',
  'WP1': 'CompressiveStrength', // WP1 is the same as Compressive Strength
  'REBAR': 'Rebar',
  'CYLINDER_PICKUP': 'CylinderPickup'
};

/**
 * Ensure base PDF directory exists
 * @param {string} basePath - Base path to ensure (optional, will be determined if not provided)
 */
async function ensureBaseDirectory(basePath = null, tenantId = null) {
  const resolved = basePath ? { path: basePath } : await getEffectiveBasePath(tenantId);
  const effectivePath = resolved.path;
  if (!fs.existsSync(effectivePath)) {
    fs.mkdirSync(effectivePath, { recursive: true });
    console.log(`Created PDF base directory: ${effectivePath}`);
  }
  return effectivePath;
}

/**
 * Sanitize project number for filesystem use
 * Replace invalid characters: \ / : * ? " < > | with _
 * @param {string} projectNumber - Project number (e.g., "MAK-2025-8188")
 * @returns {string} - Sanitized project number
 */
function sanitizeProjectNumber(projectNumber) {
  return projectNumber.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Normalize Windows path for long path support
 * @param {string} filePath - Path to normalize
 * @returns {string} Normalized path with long path prefix if needed
 */
function normalizeWindowsPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }
  
  // Check if path length exceeds 260 characters
  if (filePath.length > 260) {
    // Use long path prefix if not already present
    if (!filePath.startsWith('\\\\?\\')) {
      const resolvedPath = path.resolve(filePath);
      return '\\\\?\\' + resolvedPath;
    }
  }
  
  return filePath;
}

/**
 * Ensure project directory exists and create test type subdirectories
 * @param {string} projectNumber - The project number (e.g., "MAK-2025-8188")
 * @returns {Promise<{success: boolean, path: string|null, error: string|null, warnings: string[], details: object}>} - Structured result
 */
async function ensureProjectDirectory(projectNumber, tenantId = null) {
  console.log('🔍 [DIAGNOSTIC] ensureProjectDirectory() called with projectNumber:', projectNumber);
  const result = {
    success: false,
    path: null,
    error: null,
    warnings: [],
    details: {}
  };

  try {
    // Step 1: Get base path
    console.log('🔍 [DIAGNOSTIC] Step 1: Getting effective base path');
    const pathInfo = await getEffectiveBasePath(tenantId);
    const basePath = pathInfo.path;
    console.log('🔍 [DIAGNOSTIC] Base path determined:', basePath, 'fromConfigured:', pathInfo.fromConfigured);
    result.details.basePath = basePath;
    
    if (!basePath) {
      result.error = 'No valid base path configured';
      return result;
    }

    // Check if this is a OneDrive path (for special handling)
    const isOneDrivePath = basePath.toLowerCase().includes('onedrive');

    // Step 2: Validate base path exists and is writable
    console.log('🔍 [DIAGNOSTIC] Step 2: Validating base path');
    const baseValidation = validatePath(basePath);
    console.log('🔍 [DIAGNOSTIC] Path validation result:', baseValidation);
    if (!baseValidation.valid) {
      console.error('🔍 [DIAGNOSTIC] Path validation failed - invalid:', baseValidation.error);
      result.error = `Base path is invalid: ${baseValidation.error}`;
      return result;
    }
    if (!baseValidation.isWritable) {
      console.error('🔍 [DIAGNOSTIC] Path validation failed - not writable:', baseValidation.error);
      result.error = `Base path is not writable: ${baseValidation.error}`;
      return result;
    }
    console.log('🔍 [DIAGNOSTIC] Path validation passed');

    // Step 3: Sanitize project number
    const sanitizedProjectNumber = sanitizeProjectNumber(projectNumber);
    result.details.sanitizedProjectNumber = sanitizedProjectNumber;
    
    // Step 4: Check Windows path length (260 char limit)
    const projectDir = path.join(basePath, sanitizedProjectNumber);
    const fullPathLength = projectDir.length;
    
    if (process.platform === 'win32' && fullPathLength > 260) {
      result.warnings.push(`Path length (${fullPathLength}) exceeds Windows limit (260). Consider using shorter paths.`);
      // Try to use long path prefix
      if (!projectDir.startsWith('\\\\?\\')) {
        const longPath = '\\\\?\\' + path.resolve(projectDir);
        if (longPath.length <= 32767) {
          result.details.usingLongPath = true;
          // Note: We'll use the normalized path for actual operations
        }
      }
    }

    // Step 5: Test actual folder creation capability
    const testFolder = path.join(basePath, '.test_' + Date.now());
    try {
      fs.mkdirSync(testFolder, { recursive: true });
      // Verify test folder exists before removing
      if (fs.existsSync(testFolder)) {
        fs.rmdirSync(testFolder);
      }
    } catch (testError) {
      result.error = `Cannot create folders in base path: ${testError.message}`;
      return result;
    }

    // Step 6: Create project directory with enhanced verification for OneDrive
    console.log('🔍 [DIAGNOSTIC] Step 6: Creating project directory');
    console.log('🔍 [DIAGNOSTIC] Project directory path:', projectDir);
    try {
      // Use normalized path for Windows long path support
      const normalizedProjectDir = normalizeWindowsPath(projectDir);
      console.log('🔍 [DIAGNOSTIC] Normalized path:', normalizedProjectDir);
      console.log('🔍 [DIAGNOSTIC] Normalized path exists before creation:', fs.existsSync(normalizedProjectDir));
      
      if (!fs.existsSync(normalizedProjectDir)) {
        console.log('🔍 [DIAGNOSTIC] Calling mkdirSync with recursive: true');
        fs.mkdirSync(normalizedProjectDir, { recursive: true });
        console.log('🔍 [DIAGNOSTIC] mkdirSync completed, checking if folder exists now');
        console.log('🔍 [DIAGNOSTIC] Normalized path exists after creation:', fs.existsSync(normalizedProjectDir));
        console.log('🔍 [DIAGNOSTIC] Original path exists after creation:', fs.existsSync(projectDir));
        result.details.created = true;
      } else {
        console.log('🔍 [DIAGNOSTIC] Folder already exists');
        result.details.created = false;
        result.details.existed = true;
      }
      
      // Enhanced verification with retry logic for OneDrive sync delays
      let verified = false;
      const maxRetries = isOneDrivePath ? 5 : 2; // More retries for OneDrive paths
      const retryDelay = isOneDrivePath ? 1000 : 500; // Longer delay for OneDrive
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Check both normalized and original paths
        const checkPath = fs.existsSync(projectDir) ? projectDir : normalizedProjectDir;
        if (fs.existsSync(checkPath)) {
          try {
            const stats = fs.statSync(checkPath);
            if (stats.isDirectory()) {
              // Verify it's accessible
              fs.accessSync(checkPath, fs.constants.R_OK);
              verified = true;
              result.details.verificationAttempts = attempt + 1;
              break;
            }
          } catch (accessError) {
            // Continue to next attempt
          }
        }
        
        // Wait before next attempt (except on last attempt)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      if (!verified) {
        // Folder creation may have succeeded but not yet visible (OneDrive sync delay)
        if (isOneDrivePath) {
          result.warnings.push(
            'Folder may have been created but OneDrive sync is delayed. ' +
            'Please check OneDrive sync status and wait a few moments, then verify the folder exists at: ' + projectDir
          );
          // Still report success but with warning for OneDrive
          result.success = true;
          result.path = projectDir;
        } else {
          result.error = 'Folder creation reported success but folder does not exist or is not accessible';
          return result;
        }
      } else {
        result.path = projectDir;
        
        // Test write capability to ensure folder is fully functional
        try {
          const testFile = path.join(projectDir, '.test_write_' + Date.now() + '.tmp');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          result.details.writeTestPassed = true;
        } catch (writeError) {
          result.warnings.push(`Write test failed: ${writeError.message}. This may indicate OneDrive sync issues.`);
          result.details.writeTestPassed = false;
        }
      }
    } catch (createError) {
      result.error = `Failed to create project directory: ${createError.message}`;
      result.details.createError = createError.message;
      return result;
    }

    // Step 7: Create test type subdirectories with verification
    const subdirResults = [];
    for (const folderName of Object.values(TEST_TYPE_FOLDERS)) {
      const testTypeDir = path.join(projectDir, folderName);
      try {
        if (!fs.existsSync(testTypeDir)) {
          fs.mkdirSync(testTypeDir, { recursive: true });
        }
        
        // Verify subdirectory was actually created (with retry for OneDrive)
        let subdirVerified = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (fs.existsSync(testTypeDir)) {
            try {
              const stats = fs.statSync(testTypeDir);
              if (stats.isDirectory()) {
                subdirVerified = true;
                break;
              }
            } catch (statError) {
              // Continue to next attempt
            }
          }
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (subdirVerified) {
          subdirResults.push({ name: folderName, success: true });
        } else {
          subdirResults.push({ 
            name: folderName, 
            success: false, 
            error: 'Subdirectory created but not verified' 
          });
          if (isOneDrivePath) {
            result.warnings.push(`Subdirectory ${folderName} may not be immediately accessible due to OneDrive sync.`);
          } else {
            result.warnings.push(`Subdirectory ${folderName} created but verification failed.`);
          }
        }
      } catch (subdirError) {
        subdirResults.push({ 
          name: folderName, 
          success: false, 
          error: subdirError.message 
        });
        result.warnings.push(`Failed to create subdirectory ${folderName}: ${subdirError.message}`);
      }
    }
    result.details.subdirectories = subdirResults;

    // Step 8: Create drawings subdirectory for uploaded PDF drawings
    const drawingsDir = path.join(projectDir, 'drawings');
    try {
      if (!fs.existsSync(drawingsDir)) {
        fs.mkdirSync(drawingsDir, { recursive: true });
      }
      result.details.drawingsDir = drawingsDir;
    } catch (drawingsErr) {
      result.warnings.push(`Drawings subfolder: ${drawingsErr.message}`);
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = `Unexpected error: ${error.message}`;
    result.details.unexpectedError = error.stack;
    return result;
  }
}

/**
 * Get the test type folder name
 * @param {string} taskType - Task type (e.g., 'PROCTOR', 'DENSITY_MEASUREMENT')
 * @returns {string} - Folder name (e.g., 'Proctor', 'Density')
 */
function getTestTypeFolder(taskType) {
  return TEST_TYPE_FOLDERS[taskType] || 'Other';
}

/**
 * Get the full path to a project's drawings directory.
 * Used for uploading and serving PDF drawings.
 * @param {string} projectNumber - The project number
 * @param {number|null} tenantId - Tenant ID (for Supabase base path)
 * @returns {Promise<string>} - Full path to project's drawings folder
 */
async function getProjectDrawingsDir(projectNumber, tenantId = null) {
  const { path: basePath } = await getEffectiveBasePath(tenantId);
  const sanitized = sanitizeProjectNumber(projectNumber);
  return path.join(basePath, sanitized, 'drawings');
}

/**
 * Get sequence number for a test type within a project
 * @param {string} projectNumber - The project number
 * @param {string} taskType - Task type
 * @returns {Promise<number>} - Next sequence number (01, 02, etc.)
 */
async function getNextSequenceNumber(projectNumber, taskType, tenantId = null) {
  try {
    const { path: basePath } = await getEffectiveBasePath(tenantId);
    const sanitizedProjectNumber = sanitizeProjectNumber(projectNumber);
    const projectDir = path.join(basePath, sanitizedProjectNumber);
    const testTypeFolder = getTestTypeFolder(taskType);
    const testTypeDir = path.join(projectDir, testTypeFolder);
      
    if (!fs.existsSync(testTypeDir)) {
      return 1; // First file in this test type
    }
    
    // Read all files in the test type directory
    const files = fs.readdirSync(testTypeDir).filter(file => 
      file.endsWith('.pdf') && 
      !file.includes('_REV') // Exclude revision files from sequence counting
    );
    
    // Extract sequence numbers from filenames
    // Format: <ProjectID>_<TestType>_<Sequence>_Field_<Date>.pdf
    const sequenceRegex = /_(\d+)_Field_/;
    const sequences = files
      .map(file => {
        const match = file.match(sequenceRegex);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);
    
    if (sequences.length === 0) {
      return 1;
    }
    
    const maxSequence = Math.max(...sequences);
    return maxSequence + 1;
  } catch (error) {
    console.error('Error getting sequence number:', error);
    throw error;
  }
}

/**
 * Format date string for filename (YYYYMMDD)
 * @param {string} dateString - Date string (YYYY-MM-DD format or similar)
 * @returns {string} - Formatted date (YYYYMMDD)
 */
function formatDateForFilename(dateString) {
  if (!dateString) {
    // Use today's date if no date provided
    const today = new Date();
    return today.toISOString().split('T')[0].replace(/-/g, '');
  }
  
  // Try to parse various date formats
  let date;
  if (typeof dateString === 'string' && dateString.includes('-')) {
    // YYYY-MM-DD format
    date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
  } else {
    date = new Date(dateString);
  }
  
  if (isNaN(date.getTime())) {
    // Invalid date, use today
    const today = new Date();
    return today.toISOString().split('T')[0].replace(/-/g, '');
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * Get revision number for a filename if it already exists
 * @param {string} filePath - Full path to the file
 * @returns {number} - Revision number (0 if file doesn't exist, 1+ if it does)
 */
function getRevisionNumber(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0; // No revision needed
  }
  
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, '.pdf');
  
  // Find all revision files
  const files = fs.readdirSync(dir);
  const revisionRegex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_REV(\\d+)\\.pdf$`);
  
  const revisions = files
    .map(file => {
      const match = file.match(revisionRegex);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(num => num > 0);
  
  if (revisions.length === 0) {
    return 1; // First revision
  }
  
  return Math.max(...revisions) + 1;
}

/**
 * Generate PDF filename
 * @param {string} projectNumber - Project number (e.g., "MAK-2025-8188")
 * @param {string} taskType - Task type (e.g., "PROCTOR")
 * @param {number} sequence - Sequence number
 * @param {string} fieldDate - Field date (YYYY-MM-DD format)
 * @param {boolean} isRevision - Whether this is a revision
 * @param {number} revisionNumber - Revision number (if isRevision is true)
 * @returns {string} - Filename (e.g., "MAK-2025-8188_Proctor_01_Field_20250115.pdf")
 */
function generateFilename(projectNumber, taskType, sequence, fieldDate, isRevision = false, revisionNumber = 0) {
  // Clean project number (remove special characters that might cause issues)
  const cleanProjectNumber = projectNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Get test type name
  const testTypeName = getTestTypeFolder(taskType);
  
  // Format sequence as 2-digit number
  const sequenceStr = String(sequence).padStart(2, '0');
  
  // Format date
  const dateStr = formatDateForFilename(fieldDate);
  
  // Build filename
  let filename = `${cleanProjectNumber}_${testTypeName}_${sequenceStr}_Field_${dateStr}`;
  
  if (isRevision && revisionNumber > 0) {
    filename += `_REV${revisionNumber}`;
  }
  
  filename += '.pdf';
  
  return filename;
}

/**
 * Get full path for saving a PDF
 * @param {string} projectNumber - Project number (e.g., "MAK-2025-8188")
 * @param {string} taskType - Task type
 * @param {string} fieldDate - Field date (YYYY-MM-DD format)
 * @param {boolean} isRegeneration - Whether this is regenerating an existing report
 * @returns {Promise<{filePath: string, filename: string, sequence: number, isRevision: boolean, revisionNumber: number}>}
 */
async function getPDFSavePath(projectNumber, taskType, fieldDate, isRegeneration = false, tenantId = null) {
  // Ensure project directory exists
  const pathInfo = await getEffectiveBasePath(tenantId);
  const basePath = pathInfo.path;
  const folderResult = await ensureProjectDirectory(projectNumber, tenantId);
  if (!folderResult.success) {
    // Log warning but continue - PDF generation should still work
    console.warn(`⚠️  Project folder creation failed for ${projectNumber}: ${folderResult.error}`);
  }
  
  // Get sequence number
  const sequence = await getNextSequenceNumber(projectNumber, taskType, tenantId);
  
  // Get test type folder
  const sanitizedProjectNumber = sanitizeProjectNumber(projectNumber);
  const testTypeFolder = getTestTypeFolder(taskType);
  const testTypeDir = path.join(basePath, sanitizedProjectNumber, testTypeFolder);
  
  // Generate base filename
  const baseFilename = generateFilename(projectNumber, taskType, sequence, fieldDate, false, 0);
  let filePath = path.join(testTypeDir, baseFilename);
  
  let isRevision = false;
  let revisionNumber = 0;
  
  // If regenerating or file exists, add revision number
  if (isRegeneration || fs.existsSync(filePath)) {
    revisionNumber = getRevisionNumber(filePath);
    isRevision = true;
    const filename = generateFilename(projectNumber, taskType, sequence, fieldDate, true, revisionNumber);
    filePath = path.join(testTypeDir, filename);
  }
  
  return {
    filePath,
    filename: path.basename(filePath),
    sequence,
    isRevision,
    revisionNumber,
    fromConfigured: pathInfo.fromConfigured
  };
}

/**
 * Save PDF buffer to file
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} filePath - Full path where to save the PDF
 * @returns {Promise<void>}
 */
function savePDFToFile(pdfBuffer, filePath) {
  return new Promise((resolve, reject) => {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFile(filePath, pdfBuffer, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`PDF saved to: ${filePath}`);
        resolve();
      }
    });
  });
}

/**
 * Unified function to save PDF for any report type
 * @param {string} projectNumber - Project number (e.g., "MAK-2025-8188")
 * @param {string} taskType - Task type (e.g., "DENSITY_MEASUREMENT", "REBAR", "COMPRESSIVE_STRENGTH")
 * @param {string} fieldDate - Field date (YYYY-MM-DD format, or null/undefined to use today)
 * @param {Buffer} pdfBuffer - PDF buffer to save
 * @param {boolean} isRegeneration - Whether this is regenerating an existing report
 * @returns {Promise<{success: boolean, saved: boolean, savedPath: string|null, fileName: string|null, sequence: number|null, isRevision: boolean, revisionNumber: number|null, saveError: string|null}>}
 */
async function saveReportPDF(projectNumber, taskType, fieldDate, pdfBuffer, isRegeneration = false, tenantId = null) {
  try {
    // Get save path info
    const saveInfo = await getPDFSavePath(projectNumber, taskType, fieldDate, isRegeneration, tenantId);
    
    // Save PDF to file
    await savePDFToFile(pdfBuffer, saveInfo.filePath);
    
    console.log(`PDF saved successfully: ${saveInfo.filename} (Sequence: ${saveInfo.sequence}${saveInfo.isRevision ? `, Revision: ${saveInfo.revisionNumber}` : ''})`);
    
    return {
      success: true,
      saved: true,
      savedPath: saveInfo.filePath,
      fileName: saveInfo.filename,
      sequence: saveInfo.sequence,
      isRevision: saveInfo.isRevision,
      revisionNumber: saveInfo.revisionNumber,
      saveError: null
    };
  } catch (error) {
    console.error('Error saving PDF to file:', error);
    console.error('Save error stack:', error.stack);
    
    return {
      success: true, // PDF generation succeeded, only save failed
      saved: false,
      savedPath: null,
      fileName: null,
      sequence: null,
      isRevision: false,
      revisionNumber: null,
      saveError: error.message
    };
  }
}

module.exports = {
  PDF_BASE_PATH,
  ensureBaseDirectory,
  ensureProjectDirectory,
  sanitizeProjectNumber,
  getTestTypeFolder,
  getNextSequenceNumber,
  formatDateForFilename,
  getRevisionNumber,
  generateFilename,
  getPDFSavePath,
  savePDFToFile,
  saveReportPDF,
  getWorkflowBasePath,
  validatePath,
  normalizeWindowsPath,
  getProjectDrawingsDir
};
