# Phase 1 Implementation Plan: Settings & Configuration Management

## Overview
**Objective:** Allow admin users to configure and manage the OneDrive base folder path through a user interface.

**Duration:** Estimated 1 week  
**Priority:** Critical (foundation for all other phases)

---

## 1. Implementation Checklist

### Backend Tasks
- [ ] Create database migration for `app_settings` table
- [ ] Create `server/services/onedriveService.js` service
- [ ] Create `server/routes/settings.js` API routes
- [ ] Add settings routes to `server/index.js`
- [ ] Create middleware for settings validation
- [ ] Write unit tests for OneDrive service

### Frontend Tasks
- [ ] Create `client/src/api/settings.ts` API client
- [ ] Create `client/src/components/admin/Settings.tsx` component
- [ ] Add Settings route to `client/src/App.tsx`
- [ ] Create Settings page styling
- [ ] Add Settings link to admin navigation

### Database Tasks
- [ ] Design `app_settings` table schema
- [ ] Create migration script
- [ ] Test migration on both Supabase and SQLite

---

## 2. Database Schema

### 2.1 Supabase Migration

**File:** `supabase/migrations/[timestamp]_create_app_settings.sql`

```sql
-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Create index on updated_at for audit purposes
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);

-- Insert default settings
INSERT INTO app_settings (key, value, description) 
VALUES 
  ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.'),
  ('pdf_naming_convention', 'legacy', 'PDF naming convention: "new" for ProjectNumber-TaskName format, "legacy" for old format.')
ON CONFLICT (key) DO NOTHING;

-- Add RLS (Row Level Security) policies if needed
-- For now, we'll handle access control in the API layer
```

### 2.2 SQLite Fallback Schema

**File:** `server/database.js` (add to initialization)

```javascript
// Add to db.serialize() block in database.js
db.run(`CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
)`);

// Create indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at)`);

// Insert default settings (only if they don't exist)
db.run(`INSERT OR IGNORE INTO app_settings (key, value, description) 
VALUES 
  ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.'),
  ('pdf_naming_convention', 'legacy', 'PDF naming convention: "new" for ProjectNumber-TaskName format, "legacy" for old format.')`);
```

---

## 3. Backend Implementation

### 3.1 OneDrive Service

**File:** `server/services/onedriveService.js` (NEW)

```javascript
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');

/**
 * OneDrive Service
 * Handles OneDrive folder path configuration and validation
 */

/**
 * Get the configured OneDrive base path from database
 * @returns {Promise<string|null>} The base path or null if not configured
 */
async function getBasePath() {
  try {
    const setting = await db.get('app_settings', { key: 'onedrive_base_path' });
    return setting?.value || null;
  } catch (error) {
    console.error('Error getting OneDrive base path:', error);
    return null;
  }
}

/**
 * Set the OneDrive base path in database
 * @param {string} basePath - The base path to set
 * @param {number} userId - The user ID making the change
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function setBasePath(basePath, userId = null) {
  try {
    // Validate path first
    const validation = await validatePath(basePath);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error || 'Invalid path'
      };
    }

    // Update or insert setting
    const existing = await db.get('app_settings', { key: 'onedrive_base_path' });
    
    if (existing) {
      await db.update('app_settings', {
        value: basePath,
        updated_by_user_id: userId,
        updated_at: new Date().toISOString()
      }, { key: 'onedrive_base_path' });
    } else {
      await db.insert('app_settings', {
        key: 'onedrive_base_path',
        value: basePath,
        description: 'Base folder path for OneDrive integration',
        updated_by_user_id: userId
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error setting OneDrive base path:', error);
    return {
      success: false,
      error: error.message || 'Database error'
    };
  }
}

/**
 * Validate a file system path
 * @param {string} pathToValidate - Path to validate
 * @returns {Promise<{isValid: boolean, error?: string, isWritable?: boolean}>}
 */
async function validatePath(pathToValidate) {
  if (!pathToValidate || typeof pathToValidate !== 'string' || pathToValidate.trim() === '') {
    return {
      isValid: false,
      error: 'Path cannot be empty'
    };
  }

  // Security: Prevent directory traversal
  const normalized = path.normalize(pathToValidate.trim());
  if (normalized.includes('..')) {
    return {
      isValid: false,
      error: 'Invalid path: directory traversal detected'
    };
  }

  // Check if path exists
  try {
    if (!fs.existsSync(normalized)) {
      return {
        isValid: false,
        error: 'Path does not exist'
      };
    }

    // Check if it's a directory
    const stats = fs.statSync(normalized);
    if (!stats.isDirectory()) {
      return {
        isValid: false,
        error: 'Path is not a directory'
      };
    }

    // Check if directory is writable
    let isWritable = false;
    try {
      // Try to create a test file
      const testFile = path.join(normalized, '.onedrive_test_' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      isWritable = true;
    } catch (writeError) {
      return {
        isValid: true, // Path exists and is directory
        isWritable: false,
        error: 'Directory is not writable'
      };
    }

    return {
      isValid: true,
      isWritable: true
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Error accessing path: ${error.message}`
    };
  }
}

/**
 * Get OneDrive path status
 * @returns {Promise<{configured: boolean, path?: string, isValid?: boolean, isWritable?: boolean, error?: string}>}
 */
async function getPathStatus() {
  const basePath = await getBasePath();
  
  if (!basePath) {
    return {
      configured: false
    };
  }

  const validation = await validatePath(basePath);
  
  return {
    configured: true,
    path: basePath,
    isValid: validation.isValid,
    isWritable: validation.isWritable,
    error: validation.error
  };
}

/**
 * Ensure a project folder exists in OneDrive
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

    // Validate base path is still valid
    const validation = await validatePath(basePath);
    if (!validation.isValid) {
      return {
        success: false,
        error: `OneDrive base path is invalid: ${validation.error}`
      };
    }

    // Sanitize project number for filesystem
    const sanitizedProjectNumber = sanitizeProjectNumber(projectNumber);
    const projectFolderPath = path.join(basePath, sanitizedProjectNumber);

    // Create folder if it doesn't exist
    if (!fs.existsSync(projectFolderPath)) {
      fs.mkdirSync(projectFolderPath, { recursive: true });
      console.log(`Created project folder: ${projectFolderPath}`);
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
 * Sanitize project number for filesystem use
 * @param {string} projectNumber - Project number
 * @returns {string} Sanitized project number
 */
function sanitizeProjectNumber(projectNumber) {
  if (!projectNumber) return '';
  // Replace invalid filesystem characters
  return projectNumber.replace(/[<>:"/\\|?*]/g, '_');
}

module.exports = {
  getBasePath,
  setBasePath,
  validatePath,
  getPathStatus,
  ensureProjectFolder,
  sanitizeProjectNumber
};
```

### 3.2 Settings API Routes

**File:** `server/routes/settings.js` (NEW)

```javascript
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const onedriveService = require('../services/onedriveService');

const router = express.Router();

/**
 * GET /api/settings/onedrive-path
 * Get the current OneDrive base path (Admin only)
 */
router.get('/onedrive-path', authenticate, requireAdmin, async (req, res) => {
  try {
    const basePath = await onedriveService.getBasePath();
    res.json({
      success: true,
      path: basePath,
      configured: basePath !== null
    });
  } catch (error) {
    console.error('Error getting OneDrive path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OneDrive path'
    });
  }
});

/**
 * POST /api/settings/onedrive-path
 * Set or update the OneDrive base path (Admin only)
 * Body: { path: string }
 */
router.post('/onedrive-path', authenticate, requireAdmin, [
  body('path')
    .optional()
    .isString()
    .trim()
    .custom((value) => {
      // Allow empty string to clear the setting
      if (value === '') return true;
      // Validate path format (basic check)
      if (value && value.length > 0 && value.length < 500) return true;
      throw new Error('Path must be a valid string (max 500 characters)');
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { path: basePath } = req.body;
    const userId = req.user.id;

    // If path is empty string, clear the setting
    const pathToSet = basePath && basePath.trim() !== '' ? basePath.trim() : null;

    if (pathToSet) {
      // Validate path before saving
      const validation = await onedriveService.validatePath(pathToSet);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error || 'Invalid path',
          validation: validation
        });
      }
    }

    const result = await onedriveService.setBasePath(pathToSet, userId);

    if (result.success) {
      res.json({
        success: true,
        message: pathToSet ? 'OneDrive path configured successfully' : 'OneDrive path cleared',
        path: pathToSet
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to set OneDrive path'
      });
    }
  } catch (error) {
    console.error('Error setting OneDrive path:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/settings/onedrive-status
 * Get the status of the OneDrive path (configured, valid, writable)
 * (Admin only)
 */
router.get('/onedrive-status', authenticate, requireAdmin, async (req, res) => {
  try {
    const status = await onedriveService.getPathStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting OneDrive status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OneDrive status'
    });
  }
});

/**
 * POST /api/settings/onedrive-test
 * Test the OneDrive path (validate and check writability)
 * Body: { path: string }
 * (Admin only)
 */
router.post('/onedrive-test', authenticate, requireAdmin, [
  body('path')
    .notEmpty()
    .withMessage('Path is required')
    .isString()
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { path: testPath } = req.body;
    const validation = await onedriveService.validatePath(testPath.trim());

    res.json({
      success: true,
      ...validation
    });
  } catch (error) {
    console.error('Error testing OneDrive path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test path'
    });
  }
});

module.exports = router;
```

### 3.3 Update Server Index

**File:** `server/index.js` (MODIFY)

Add the settings route after other API routes:

```javascript
// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/workpackages', require('./routes/workpackages'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/wp1', require('./routes/wp1'));
app.use('/api/density', require('./routes/density'));
app.use('/api/rebar', require('./routes/rebar'));
app.use('/api/proctor', require('./routes/proctor'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/notifications', require('./routes/notifications').router);
app.use('/api/settings', require('./routes/settings')); // ADD THIS LINE
```

---

## 4. Frontend Implementation

### 4.1 Settings API Client

**File:** `client/src/api/settings.ts` (NEW)

```typescript
import api from './api';

export interface OneDrivePathResponse {
  success: boolean;
  path: string | null;
  configured: boolean;
}

export interface OneDriveStatusResponse {
  success: boolean;
  configured: boolean;
  path?: string;
  isValid?: boolean;
  isWritable?: boolean;
  error?: string;
}

export interface OneDriveTestResponse {
  success: boolean;
  isValid: boolean;
  isWritable?: boolean;
  error?: string;
}

export interface SetOneDrivePathRequest {
  path: string | null;
}

export interface SetOneDrivePathResponse {
  success: boolean;
  message?: string;
  path?: string | null;
  error?: string;
}

export const settingsAPI = {
  /**
   * Get the current OneDrive base path
   */
  getOneDrivePath: async (): Promise<OneDrivePathResponse> => {
    const response = await api.get<OneDrivePathResponse>('/settings/onedrive-path');
    return response.data;
  },

  /**
   * Set or update the OneDrive base path
   */
  setOneDrivePath: async (path: string | null): Promise<SetOneDrivePathResponse> => {
    const response = await api.post<SetOneDrivePathResponse>('/settings/onedrive-path', { path });
    return response.data;
  },

  /**
   * Get the status of the OneDrive path
   */
  getOneDriveStatus: async (): Promise<OneDriveStatusResponse> => {
    const response = await api.get<OneDriveStatusResponse>('/settings/onedrive-status');
    return response.data;
  },

  /**
   * Test a OneDrive path without saving it
   */
  testOneDrivePath: async (path: string): Promise<OneDriveTestResponse> => {
    const response = await api.post<OneDriveTestResponse>('/settings/onedrive-test', { path });
    return response.data;
  },
};
```

### 4.2 Settings Component

**File:** `client/src/components/admin/Settings.tsx` (NEW)

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, OneDriveStatusResponse } from '../../api/settings';
import './Settings.css';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [path, setPath] = useState<string>('');
  const [status, setStatus] = useState<OneDriveStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ isValid: boolean; error?: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [pathResponse, statusResponse] = await Promise.all([
        settingsAPI.getOneDrivePath(),
        settingsAPI.getOneDriveStatus()
      ]);

      if (pathResponse.success) {
        setPath(pathResponse.path || '');
      }

      if (statusResponse.success) {
        setStatus(statusResponse);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load settings'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPath = async () => {
    if (!path.trim()) {
      setTestResult({
        isValid: false,
        error: 'Please enter a path'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const result = await settingsAPI.testOneDrivePath(path.trim());

      setTestResult({
        isValid: result.isValid,
        error: result.error
      });

      if (result.isValid && result.isWritable) {
        setMessage({
          type: 'success',
          text: 'Path is valid and writable!'
        });
      } else if (result.isValid && !result.isWritable) {
        setMessage({
          type: 'error',
          text: 'Path exists but is not writable'
        });
      }
    } catch (error: any) {
      console.error('Error testing path:', error);
      setTestResult({
        isValid: false,
        error: error.response?.data?.error || 'Failed to test path'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const pathToSave = path.trim() === '' ? null : path.trim();
      const result = await settingsAPI.setOneDrivePath(pathToSave);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Settings saved successfully'
        });
        // Reload status
        const statusResponse = await settingsAPI.getOneDriveStatus();
        if (statusResponse.success) {
          setStatus(statusResponse);
        }
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to save settings'
        });
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save settings'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPath('');
    setTestResult(null);
    setMessage(null);
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2>OneDrive Integration</h2>
          <p className="settings-description">
            Configure the base folder path for OneDrive integration. This folder will be used to store
            all project folders and PDFs. The folder must exist and be writable.
          </p>

          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="onedrive-path">OneDrive Base Path</label>
              <input
                id="onedrive-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\YourName\OneDrive\Projects"
                disabled={loading}
                className="form-input"
              />
              <small className="form-help">
                Enter the full path to your OneDrive folder. Leave empty to disable OneDrive integration.
              </small>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={handleTestPath}
                disabled={loading || testing || !path.trim()}
                className="btn btn-secondary"
              >
                {testing ? 'Testing...' : 'Test Path'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || testing}
                className="btn btn-primary"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || testing}
                className="btn btn-link"
              >
                Clear
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.isValid ? 'success' : 'error'}`}>
                {testResult.isValid ? (
                  <span>✓ Path is valid and writable</span>
                ) : (
                  <span>✗ {testResult.error || 'Path is invalid'}</span>
                )}
              </div>
            )}

            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
          </div>

          {status && (
            <div className="settings-status">
              <h3>Current Status</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Configured:</span>
                  <span className={`status-value ${status.configured ? 'yes' : 'no'}`}>
                    {status.configured ? 'Yes' : 'No'}
                  </span>
                </div>
                {status.configured && (
                  <>
                    <div className="status-item">
                      <span className="status-label">Path:</span>
                      <span className="status-value path">{status.path}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Valid:</span>
                      <span className={`status-value ${status.isValid ? 'yes' : 'no'}`}>
                        {status.isValid ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Writable:</span>
                      <span className={`status-value ${status.isWritable ? 'yes' : 'no'}`}>
                        {status.isWritable ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {status.error && (
                      <div className="status-item error">
                        <span className="status-label">Error:</span>
                        <span className="status-value">{status.error}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
```

### 4.3 Settings CSS

**File:** `client/src/components/admin/Settings.css` (NEW)

```css
.settings-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.settings-header h1 {
  margin: 0;
  color: #333;
}

.btn-back {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-back:hover {
  background: #e9e9e9;
}

.settings-content {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.settings-section {
  margin-bottom: 30px;
}

.settings-section h2 {
  margin-top: 0;
  color: #333;
  border-bottom: 2px solid #007bff;
  padding-bottom: 10px;
}

.settings-description {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.6;
}

.settings-form {
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.form-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.form-help {
  display: block;
  margin-top: 5px;
  color: #666;
  font-size: 12px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-link {
  background: transparent;
  color: #007bff;
  text-decoration: underline;
}

.btn-link:hover:not(:disabled) {
  color: #0056b3;
}

.test-result {
  margin-top: 15px;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
}

.test-result.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.test-result.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.message {
  margin-top: 15px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.settings-status {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid #eee;
}

.settings-status h3 {
  margin-top: 0;
  color: #333;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.status-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.status-item.error {
  grid-column: 1 / -1;
  background: #fff3cd;
}

.status-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.status-value.yes {
  color: #28a745;
}

.status-value.no {
  color: #dc3545;
}

.status-value.path {
  font-family: monospace;
  word-break: break-all;
  color: #007bff;
}
```

### 4.4 Add Settings Route

**File:** `client/src/App.tsx` (MODIFY)

Add the Settings route (typically in the admin section):

```typescript
// Add import
import Settings from './components/admin/Settings';

// Add route (inside your Routes component)
<Route path="/settings" element={
  <ProtectedRoute>
    <Settings />
  </ProtectedRoute>
} />
```

### 4.5 Add Settings Link to Navigation

**File:** `client/src/components/admin/AdminDashboard.tsx` or similar (MODIFY)

Add a link to Settings in the admin navigation:

```typescript
<Link to="/settings" className="nav-link">
  ⚙️ Settings
</Link>
```

---

## 5. Testing Checklist

### 5.1 Backend Testing

- [ ] **Database Migration**
  - [ ] Run migration on Supabase
  - [ ] Run migration on SQLite
  - [ ] Verify `app_settings` table created
  - [ ] Verify default settings inserted

- [ ] **OneDrive Service**
  - [ ] Test `getBasePath()` with no setting
  - [ ] Test `getBasePath()` with setting
  - [ ] Test `setBasePath()` with valid path
  - [ ] Test `setBasePath()` with invalid path
  - [ ] Test `validatePath()` with existing directory
  - [ ] Test `validatePath()` with non-existent path
  - [ ] Test `validatePath()` with file (not directory)
  - [ ] Test `validatePath()` with non-writable directory
  - [ ] Test `validatePath()` with directory traversal attempt
  - [ ] Test `getPathStatus()` with configured path
  - [ ] Test `getPathStatus()` with unconfigured path

- [ ] **API Routes**
  - [ ] Test `GET /api/settings/onedrive-path` (authenticated admin)
  - [ ] Test `GET /api/settings/onedrive-path` (unauthenticated - should fail)
  - [ ] Test `GET /api/settings/onedrive-path` (non-admin - should fail)
  - [ ] Test `POST /api/settings/onedrive-path` with valid path
  - [ ] Test `POST /api/settings/onedrive-path` with invalid path
  - [ ] Test `POST /api/settings/onedrive-path` with empty path (clear)
  - [ ] Test `GET /api/settings/onedrive-status`
  - [ ] Test `POST /api/settings/onedrive-test` with valid path
  - [ ] Test `POST /api/settings/onedrive-test` with invalid path

### 5.2 Frontend Testing

- [ ] **Settings Page**
  - [ ] Page loads without errors
  - [ ] Current path is displayed if configured
  - [ ] Can enter new path
  - [ ] Test button validates path
  - [ ] Save button saves path
  - [ ] Clear button clears input
  - [ ] Status section displays correctly
  - [ ] Error messages display correctly
  - [ ] Success messages display correctly
  - [ ] Loading states work correctly

- [ ] **Navigation**
  - [ ] Settings link appears in admin navigation
  - [ ] Settings page is accessible to admin only
  - [ ] Back button returns to dashboard

### 5.3 Integration Testing

- [ ] **End-to-End Flow**
  - [ ] Admin logs in
  - [ ] Admin navigates to Settings
  - [ ] Admin enters OneDrive path
  - [ ] Admin tests path (should succeed)
  - [ ] Admin saves path
  - [ ] Admin refreshes page (path should persist)
  - [ ] Admin clears path
  - [ ] Admin saves (path should be cleared)

---

## 6. Deployment Steps

1. **Database Migration**
   ```bash
   # For Supabase
   npm run supabase:migrate
   
   # For SQLite (automatic on server start)
   # Or manually run migration script
   ```

2. **Backend Deployment**
   - Deploy updated `server/` directory
   - Ensure `server/services/onedriveService.js` is included
   - Ensure `server/routes/settings.js` is included
   - Verify `server/index.js` includes settings route

3. **Frontend Deployment**
   - Build frontend: `cd client && npm run build`
   - Deploy build directory
   - Verify Settings route is accessible

4. **Post-Deployment Verification**
   - Test API endpoints with Postman/curl
   - Test Settings page in browser
   - Verify database has settings table
   - Check server logs for errors

---

## 7. Troubleshooting

### Common Issues

1. **"Path does not exist" error**
   - Verify path is correct (copy from Windows Explorer)
   - Check path uses correct slashes (Windows: `\`, Unix: `/`)
   - Ensure path is accessible from server process

2. **"Directory is not writable" error**
   - Check folder permissions
   - On Windows: Right-click folder → Properties → Security
   - Ensure server process has write access

3. **Settings not persisting**
   - Check database connection
   - Verify `app_settings` table exists
   - Check server logs for database errors

4. **CORS errors (if frontend on different domain)**
   - Verify CORS configuration in `server/index.js`
   - Check API base URL in frontend

---

## 8. Next Steps (Phase 2)

After Phase 1 is complete and tested:

1. Review Phase 1 implementation
2. Address any issues or feedback
3. Proceed to Phase 2: Automatic Project Folder Creation

---

**End of Phase 1 Implementation Plan**
