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
 * Get workflow base path from app_settings table
 * @returns {Promise<string|null>} The workflow base path, or null if not set
 */
async function getWorkflowBasePath() {
  try {
    const db = require('../db');
    const setting = await db.get('app_settings', { key: 'workflow_base_path' });
    if (setting && setting.value && setting.value.trim() !== '') {
      return setting.value.trim();
    }
    return null;
  } catch (error) {
    console.warn('Error getting workflow base path:', error.message);
    return null;
  }
}

/**
 * Validate a path exists and is writable
 * @param {string} pathToValidate - Path to validate
 * @returns {{valid: boolean, isWritable: boolean, error?: string}}
 */
function validatePath(pathToValidate) {
  if (!pathToValidate || typeof pathToValidate !== 'string') {
    return { valid: false, isWritable: false, error: 'Path is required' };
  }
  
  if (!fs.existsSync(pathToValidate)) {
    return { valid: false, isWritable: false, error: 'Path does not exist' };
  }
  
  const stats = fs.statSync(pathToValidate);
  if (!stats.isDirectory()) {
    return { valid: false, isWritable: false, error: 'Path is not a directory' };
  }
  
  try {
    fs.accessSync(pathToValidate, fs.constants.W_OK);
    return { valid: true, isWritable: true };
  } catch (error) {
    return { valid: true, isWritable: false, error: 'Path is not writable' };
  }
}

/**
 * Get the effective base path for PDF storage
 * Priority order:
 * 1. workflow_base_path from app_settings (if set and valid)
 * 2. onedrive_base_path from app_settings (if set and valid) - backward compatibility
 * 3. PDF_BASE_PATH environment variable
 * 4. Default: ./pdfs in project root
 * @returns {Promise<string>} The base path to use
 */
async function getEffectiveBasePath() {
  // Priority 1: workflow_base_path from app_settings
  const workflowPath = await getWorkflowBasePath();
  if (workflowPath) {
    const validation = validatePath(workflowPath);
    if (validation.valid && validation.isWritable) {
      return workflowPath;
    } else {
      console.warn('Workflow path is configured but invalid:', workflowPath, validation.error || 'not writable');
    }
  }
  
  // Priority 2: OneDrive path (backward compatibility)
  const service = getOneDriveService();
  if (service) {
    try {
      const onedrivePath = await service.getBasePath();
      if (onedrivePath) {
        // Validate OneDrive path is still valid
        const status = await service.getPathStatus();
        if (status.valid && status.isWritable) {
          return onedrivePath;
        }
      }
    } catch (error) {
      console.warn('Error getting OneDrive path, using default:', error.message);
    }
  }
  
  // Priority 3: Environment variable
  if (PDF_BASE_PATH) {
    return PDF_BASE_PATH;
  }
  
  // Priority 4: Default
  return path.join(__dirname, '..', 'pdfs');
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
async function ensureBaseDirectory(basePath = null) {
  const effectivePath = basePath || await getEffectiveBasePath();
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
 * Ensure project directory exists and create test type subdirectories
 * @param {string} projectNumber - The project number (e.g., "MAK-2025-8188")
 * @returns {Promise<string>} - Path to project directory
 */
async function ensureProjectDirectory(projectNumber) {
  const basePath = await getEffectiveBasePath();
  await ensureBaseDirectory(basePath);
  
  // Sanitize project number for filesystem safety
  const sanitizedProjectNumber = sanitizeProjectNumber(projectNumber);
  const projectDir = path.join(basePath, sanitizedProjectNumber);
  
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    console.log(`Created project directory: ${projectDir}`);
  }
  
  // Create test type subdirectories
  Object.values(TEST_TYPE_FOLDERS).forEach(folderName => {
    const testTypeDir = path.join(projectDir, folderName);
    if (!fs.existsSync(testTypeDir)) {
      fs.mkdirSync(testTypeDir, { recursive: true });
    }
  });
  
  return projectDir;
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
 * Get sequence number for a test type within a project
 * @param {string} projectNumber - The project number
 * @param {string} taskType - Task type
 * @returns {Promise<number>} - Next sequence number (01, 02, etc.)
 */
async function getNextSequenceNumber(projectNumber, taskType) {
  try {
    const basePath = await getEffectiveBasePath();
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
async function getPDFSavePath(projectNumber, taskType, fieldDate, isRegeneration = false) {
  // Ensure project directory exists
  const basePath = await getEffectiveBasePath();
  await ensureProjectDirectory(projectNumber);
  
  // Get sequence number
  const sequence = await getNextSequenceNumber(projectNumber, taskType);
  
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
    revisionNumber
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
async function saveReportPDF(projectNumber, taskType, fieldDate, pdfBuffer, isRegeneration = false) {
  try {
    // Get save path info
    const saveInfo = await getPDFSavePath(projectNumber, taskType, fieldDate, isRegeneration);
    
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
  validatePath
};
