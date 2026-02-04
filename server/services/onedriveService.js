/**
 * OneDrive Service
 * 
 * Handles OneDrive folder path configuration, validation, and management.
 * Provides utilities for path validation, folder creation, and path sanitization.
 * 
 * @module services/onedriveService
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

const SETTING_KEY = 'onedrive_base_path';

/**
 * Get the configured OneDrive base path from database
 * @returns {Promise<string|null>} The base path or null if not configured
 */
async function getBasePath() {
  try {
    const setting = await db.get('app_settings', { key: SETTING_KEY });
    return setting?.value || null;
  } catch (error) {
    console.error('Error getting OneDrive base path:', error);
    return null;
  }
}

/**
 * Set the OneDrive base path in database
 * @param {string|null} basePath - The base path to set (null to clear)
 * @param {number|null} userId - User ID who is setting this (for audit trail)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function setBasePath(basePath, userId = null) {
  try {
    // Normalize path: trim whitespace, convert null/empty to null
    const normalizedPath = basePath && typeof basePath === 'string' 
      ? basePath.trim() 
      : null;
    
    // If path is empty string after trimming, treat as null (clearing the setting)
    const pathToSet = normalizedPath === '' ? null : normalizedPath;
    
    // Check if setting exists
    const existing = await db.get('app_settings', { key: SETTING_KEY });
    
    if (existing) {
      // Update existing setting
      const updateData = {
        value: pathToSet,
        updatedAt: new Date().toISOString()
      };
      
      if (userId) {
        updateData.updatedByUserId = userId;
      }
      
      await db.update('app_settings', updateData, { key: SETTING_KEY });
    } else {
      // Create new setting
      const insertData = {
        key: SETTING_KEY,
        value: pathToSet,
        description: 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.',
        updatedByUserId: userId || null
      };
      
      await db.insert('app_settings', insertData);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error setting OneDrive base path:', error);
    return {
      success: false,
      error: error.message || 'Failed to set OneDrive base path'
    };
  }
}

/**
 * Sanitize a path to prevent directory traversal attacks
 * @param {string} userPath - User-provided path
 * @returns {string} Sanitized path
 * @throws {Error} If path contains directory traversal attempts
 */
function sanitizePath(userPath) {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }
  
  // Normalize the path (resolves . and ..)
  const normalized = path.normalize(userPath.trim());
  
  // Check for directory traversal attempts
  // After normalization, if path still contains .., it's suspicious
  if (normalized.includes('..')) {
    throw new Error('Invalid path: directory traversal detected');
  }
  
  // Check for absolute paths on Windows (C:\, D:\, etc.) or Unix (/)
  // We allow absolute paths, but we'll validate they exist separately
  return normalized;
}

/**
 * Validate a OneDrive path
 * Checks if path exists, is a directory, and is writable
 * @param {string} userPath - Path to validate
 * @returns {Promise<{valid: boolean, error?: string, path?: string}>}
 */
async function validatePath(userPath) {
  try {
    // Sanitize path first
    const sanitized = sanitizePath(userPath);
    
    // Check if path exists
    if (!fs.existsSync(sanitized)) {
      return {
        valid: false,
        error: 'Path does not exist',
        path: sanitized
      };
    }
    
    // Check if it's a directory
    const stats = fs.statSync(sanitized);
    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: 'Path is not a directory',
        path: sanitized
      };
    }
    
    // Check if directory is writable by attempting to create a test file
    try {
      const testFile = path.join(sanitized, '.onedrive_test_' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (writeError) {
      return {
        valid: false,
        error: 'Directory is not writable',
        path: sanitized
      };
    }
    
    return {
      valid: true,
      path: sanitized
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message || 'Invalid path',
      path: userPath
    };
  }
}

/**
 * Get OneDrive path status
 * Returns comprehensive status about the configured path
 * @returns {Promise<{configured: boolean, valid: boolean, path?: string|null, error?: string}>}
 */
async function getPathStatus() {
  try {
    const basePath = await getBasePath();
    
    if (!basePath) {
      return {
        configured: false,
        valid: false,
        path: null
      };
    }
    
    // Validate the configured path
    const validation = await validatePath(basePath);
    
    return {
      configured: true,
      valid: validation.valid,
      path: basePath,
      error: validation.error || null
    };
  } catch (error) {
    console.error('Error getting OneDrive path status:', error);
    return {
      configured: false,
      valid: false,
      path: null,
      error: error.message || 'Failed to check path status'
    };
  }
}

/**
 * Ensure a project folder exists in OneDrive
 * Creates the folder if it doesn't exist
 * @param {string} projectNumber - Project number (e.g., "02-2026-4001")
 * @returns {Promise<{success: boolean, folderPath?: string, error?: string}>}
 */
async function ensureProjectFolder(projectNumber) {
  try {
    const basePath = await getBasePath();
    
    if (!basePath) {
      // OneDrive not configured, skip folder creation
      return {
        success: false,
        error: 'OneDrive base path not configured'
      };
    }
    
    // Validate base path first
    const validation = await validatePath(basePath);
    if (!validation.valid) {
      return {
        success: false,
        error: `OneDrive base path is invalid: ${validation.error}`
      };
    }
    
    // Sanitize project number for filesystem use
    const sanitizedProjectNumber = projectNumber.replace(/[\\/:*?"<>|]/g, '_');
    
    // Create project folder path
    const projectFolderPath = path.join(basePath, sanitizedProjectNumber);
    
    // Create folder if it doesn't exist
    if (!fs.existsSync(projectFolderPath)) {
      fs.mkdirSync(projectFolderPath, { recursive: true });
      console.log(`Created OneDrive project folder: ${projectFolderPath}`);
    }
    
    return {
      success: true,
      folderPath: projectFolderPath
    };
  } catch (error) {
    console.error('Error ensuring project folder:', error);
    return {
      success: false,
      error: error.message || 'Failed to create project folder'
    };
  }
}

/**
 * Get the full path for a project folder
 * Returns the path even if folder doesn't exist yet
 * @param {string} projectNumber - Project number
 * @returns {Promise<string|null>} Full path to project folder or null if OneDrive not configured
 */
async function getProjectFolderPath(projectNumber) {
  try {
    const basePath = await getBasePath();
    
    if (!basePath) {
      return null;
    }
    
    // Validate base path
    const validation = await validatePath(basePath);
    if (!validation.valid) {
      return null;
    }
    
    // Sanitize project number
    const sanitizedProjectNumber = projectNumber.replace(/[\\/:*?"<>|]/g, '_');
    
    // Return full path
    return path.join(basePath, sanitizedProjectNumber);
  } catch (error) {
    console.error('Error getting project folder path:', error);
    return null;
  }
}

/**
 * Sanitize a filename for filesystem use
 * Removes invalid characters that could cause issues
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }
  
  // Remove invalid filesystem characters: \ / : * ? " < > |
  // Replace with underscore
  let sanitized = filename.replace(/[\\/:*?"<>|]/g, '_');
  
  // Remove leading/trailing dots and spaces (Windows doesn't allow these)
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Limit length (Windows max is 255, be conservative)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  // Ensure it's not empty
  if (!sanitized || sanitized.trim() === '') {
    return 'unnamed';
  }
  
  return sanitized;
}

module.exports = {
  getBasePath,
  setBasePath,
  sanitizePath,
  validatePath,
  getPathStatus,
  ensureProjectFolder,
  getProjectFolderPath,
  sanitizeFilename
};
