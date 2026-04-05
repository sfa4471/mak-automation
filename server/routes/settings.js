/**
 * Settings API Routes
 * 
 * Handles application settings management, particularly OneDrive path configuration.
 * All routes require admin authentication.
 * 
 * @module routes/settings
 */

const express = require('express');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');
const onedriveService = require('../services/onedriveService');
const db = require('../db');
const { validatePath } = require('../utils/pdfFileManager');

const router = express.Router();

const AUTO_SEND_BODY_KEY = 'auto_send_approved_reports_body_template';
const DEFAULT_AUTO_SEND_BODY_TEMPLATE = [
  'Hello,',
  '',
  'Attached are the approved report(s) for {{clientName}} dated {{date}}.',
  '',
  'Regards,',
  '{{companyName}}'
].join('\n');

/**
 * GET /api/settings/onedrive-path
 * Get the current OneDrive base path (Admin only)
 */
router.get('/onedrive-path', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const basePath = await onedriveService.getBasePath();
    
    res.json({
      success: true,
      path: basePath
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
 * 
 * Body:
 *   - path: string | null - The OneDrive base path (null or empty to clear)
 */
router.post('/onedrive-path', authenticate, requireTenant, requireAdmin, [
  body('path')
    .optional()
    .custom((value) => {
      // Allow null, empty string, or valid string
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === 'string') {
        return true;
      }
      throw new Error('Path must be a string or null');
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

    const { path: pathToSet } = req.body;
    const userId = req.user.id;

    // If path is provided, validate it first (unless it's null/empty to clear)
    if (pathToSet !== null && pathToSet !== undefined && pathToSet.trim() !== '') {
      const validation = await onedriveService.validatePath(pathToSet);
      
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error || 'Invalid path',
          path: validation.path
        });
      }
    }

    // Set the path
    const result = await onedriveService.setBasePath(pathToSet, userId);

    if (result.success) {
      res.json({
        success: true,
        message: pathToSet ? 'OneDrive path configured successfully' : 'OneDrive path cleared',
        path: pathToSet || null
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to set OneDrive path'
      });
    }
  } catch (error) {
    console.error('Error setting OneDrive path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set OneDrive path: ' + error.message
    });
  }
});

/**
 * GET /api/settings/onedrive-status
 * Get the status of the OneDrive path (configured, valid, writable)
 */
router.get('/onedrive-status', authenticate, requireTenant, requireAdmin, async (req, res) => {
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
 * Test a OneDrive path without saving it (Admin only)
 * 
 * Body:
 *   - path: string - The path to test
 */
router.post('/onedrive-test', authenticate, requireTenant, requireAdmin, [
  body('path')
    .notEmpty()
    .withMessage('Path is required')
    .isString()
    .withMessage('Path must be a string')
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
    
    // Validate the path
    const validation = await onedriveService.validatePath(testPath.trim());
    
    res.json({
      success: true,
      valid: validation.valid,
      isValid: validation.isValid !== undefined ? validation.isValid : validation.valid,
      isWritable: validation.isWritable !== undefined ? validation.isWritable : validation.valid,
      path: validation.path,
      error: validation.error || null
    });
  } catch (error) {
    console.error('Error testing OneDrive path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test OneDrive path: ' + error.message
    });
  }
});

/**
 * GET /api/settings/workflow/path
 * Get the current workflow base path (Admin only)
 */
router.get('/workflow/path', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const setting = await db.get('app_settings', { key: 'workflow_base_path', tenantId: req.tenantId });
    
    res.json({
      success: true,
      path: setting && setting.value ? setting.value : null
    });
  } catch (error) {
    console.error('Error getting workflow path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow path'
    });
  }
});

/**
 * POST /api/settings/workflow/path
 * Set or update the workflow base path (Admin only)
 * 
 * Body:
 *   - path: string | null - The workflow base path (null or empty to clear)
 */
router.post('/workflow/path', authenticate, requireTenant, requireAdmin, [
  body('path')
    .optional()
    .custom((value) => {
      // Allow null, empty string, or valid string
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === 'string') {
        return true;
      }
      throw new Error('Path must be a string or null');
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

    const { path: pathToSet } = req.body;
    const userId = req.user.id;

    // If path is provided, validate it first (unless it's null/empty to clear)
    if (pathToSet !== null && pathToSet !== undefined && pathToSet.trim() !== '') {
      const trimmedPath = pathToSet.trim();
      
      // First check if path exists - if not, try to create it (for OneDrive paths)
      const isOneDrivePath = trimmedPath.toLowerCase().includes('onedrive');
      if (!fs.existsSync(trimmedPath)) {
        // For OneDrive paths, try to create the folder if parent exists
        if (isOneDrivePath) {
          try {
            const parentPath = require('path').dirname(trimmedPath);
            if (fs.existsSync(parentPath)) {
              // Parent exists, try to create the folder
              fs.mkdirSync(trimmedPath, { recursive: true });
              console.log(`Created workflow path folder: ${trimmedPath}`);
            } else {
              return res.status(400).json({
                success: false,
                error: `Path does not exist and parent directory is not accessible. Please create the folder "${require('path').basename(trimmedPath)}" in File Explorer first.`,
                path: pathToSet
              });
            }
          } catch (createError) {
            // Couldn't create, proceed with validation which will give better error
          }
        } else {
          // For non-OneDrive paths, try to create if parent exists
          try {
            const parentPath = require('path').dirname(trimmedPath);
            if (fs.existsSync(parentPath)) {
              fs.mkdirSync(trimmedPath, { recursive: true });
              console.log(`Created workflow path folder: ${trimmedPath}`);
            }
          } catch (createError) {
            // Continue to validation
          }
        }
      }
      
      // Now validate the path (with retry logic for OneDrive)
      const validation = validatePath(trimmedPath);
      
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error || 'Invalid path',
          path: pathToSet
        });
      }
      
      if (!validation.isWritable) {
        return res.status(400).json({
          success: false,
          error: validation.error || 'Path is not writable',
          path: pathToSet
        });
      }
    }

    const tenantId = req.tenantId;
    const existing = await db.get('app_settings', { key: 'workflow_base_path', tenantId });

    const settingData = {
      key: 'workflow_base_path',
      tenantId,
      value: pathToSet && pathToSet.trim() !== '' ? pathToSet.trim() : null,
      updated_by_user_id: userId,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      await db.update('app_settings', settingData, { key: 'workflow_base_path', tenantId });
    } else {
      await db.insert('app_settings', {
        ...settingData,
        description: 'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.'
      });
    }

    res.json({
      success: true,
      message: pathToSet ? 'Workflow path configured successfully' : 'Workflow path cleared',
      path: pathToSet && pathToSet.trim() !== '' ? pathToSet.trim() : null
    });
  } catch (error) {
    console.error('Error setting workflow path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set workflow path: ' + error.message
    });
  }
});

/**
 * POST /api/settings/workflow/path/test
 * Test a workflow path without saving it (Admin only)
 * 
 * Body:
 *   - path: string - The path to test
 */
router.post('/workflow/path/test', authenticate, requireTenant, requireAdmin, [
  body('path')
    .notEmpty()
    .withMessage('Path is required')
    .isString()
    .withMessage('Path must be a string')
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
    
    // Validate the path
    const validation = validatePath(testPath.trim());
    
    res.json({
      success: true,
      isValid: validation.valid,
      isWritable: validation.isWritable,
      error: validation.error || null
    });
  } catch (error) {
    console.error('Error testing workflow path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test workflow path: ' + error.message
    });
  }
});

/**
 * GET /api/settings/workflow/status
 * Get the status of the workflow path (configured, valid, writable)
 */
router.get('/workflow/status', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    let setting = null;
    try {
      setting = await db.get('app_settings', { key: 'workflow_base_path', tenantId: req.tenantId });
    } catch (e) {
      // app_settings may not have tenant_id (e.g. migration not run); fallback to key-only
      setting = await db.get('app_settings', { key: 'workflow_base_path' });
    }
    const configured = !!(setting && setting.value && String(setting.value).trim() !== '');
    
    if (!configured) {
      return res.json({
        success: true,
        configured: false,
        path: null,
        isValid: false,
        isWritable: false
      });
    }
    
    const workflowPath = String(setting.value).trim();
    const validation = validatePath(workflowPath);
    
    res.json({
      success: true,
      configured: true,
      path: workflowPath,
      isValid: validation.valid,
      isWritable: validation.isWritable,
      error: validation.error || null
    });
  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow status'
    });
  }
});

/**
 * GET /api/settings/auto-send
 * Get auto-send approved reports setting for current tenant (Admin only)
 */
router.get('/auto-send', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const setting = await db.get('app_settings', { key: 'auto_send_approved_reports_enabled', tenantId });
    const enabled = setting && String(setting.value).toLowerCase() === 'true';
    res.json({ success: true, enabled });
  } catch (error) {
    console.error('Error getting auto-send setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve auto-send setting'
    });
  }
});

/**
 * PATCH /api/settings/auto-send
 * Set auto-send approved reports setting for current tenant (Admin only)
 * Body: { enabled: boolean }
 */
router.patch('/auto-send', authenticate, requireTenant, requireAdmin, [
  body('enabled').isBoolean().withMessage('enabled must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const tenantId = req.tenantId;
    const userId = req.user.id;
    const enabled = Boolean(req.body.enabled);

    const existing = await db.get('app_settings', { key: 'auto_send_approved_reports_enabled', tenantId });
    const settingData = {
      key: 'auto_send_approved_reports_enabled',
      tenantId,
      value: enabled ? 'true' : 'false',
      updated_by_user_id: userId,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      await db.update('app_settings', settingData, { key: 'auto_send_approved_reports_enabled', tenantId });
    } else {
      await db.insert('app_settings', {
        ...settingData,
        description: 'Whether approved reports should be auto-sent to project clients.'
      });
    }

    res.json({
      success: true,
      enabled
    });
  } catch (error) {
    console.error('Error updating auto-send setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update auto-send setting'
    });
  }
});

/**
 * GET /api/settings/auto-send-body
 * Get the email body template used for auto-sent approved reports (current tenant).
 * Admin only.
 */
router.get('/auto-send-body', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const existing = await db.get('app_settings', { key: AUTO_SEND_BODY_KEY, tenantId });
    const bodyTemplate = existing?.value ?? '';
    res.json({ success: true, bodyTemplate: bodyTemplate || DEFAULT_AUTO_SEND_BODY_TEMPLATE });
  } catch (error) {
    console.error('Error getting auto-send body template:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve auto-send body template' });
  }
});

/**
 * PATCH /api/settings/auto-send-body
 * Set the email body template used for auto-sent approved reports (current tenant).
 * Admin only.
 * Body: { bodyTemplate: string }
 */
router.patch('/auto-send-body', authenticate, requireTenant, requireAdmin, [
  body('bodyTemplate').optional().isString().withMessage('bodyTemplate must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const tenantId = req.tenantId;
    const userId = req.user.id;
    const bodyTemplateRaw = req.body.bodyTemplate ?? '';
    const bodyTemplate = String(bodyTemplateRaw);

    const existing = await db.get('app_settings', { key: AUTO_SEND_BODY_KEY, tenantId });

    // If admin clears the template, go back to default wording.
    if (bodyTemplate.trim() === '') {
      if (existing) {
        await db.delete('app_settings', { key: AUTO_SEND_BODY_KEY, tenantId });
      }
      return res.json({ success: true, bodyTemplate: DEFAULT_AUTO_SEND_BODY_TEMPLATE });
    }

    const settingData = {
      key: AUTO_SEND_BODY_KEY,
      tenantId,
      value: bodyTemplate,
      updated_by_user_id: userId,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      await db.update('app_settings', settingData, { key: AUTO_SEND_BODY_KEY, tenantId });
    } else {
      await db.insert('app_settings', {
        ...settingData,
        description: 'Email body template for auto-sent approved reports.'
      });
    }

    res.json({ success: true, bodyTemplate });
  } catch (error) {
    console.error('Error updating auto-send body template:', error);
    res.status(500).json({ success: false, error: 'Failed to update auto-send body template' });
  }
});

module.exports = router;
