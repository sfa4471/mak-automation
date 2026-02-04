/**
 * Settings API Routes
 * 
 * Handles application settings management, particularly OneDrive path configuration.
 * All routes require admin authentication.
 * 
 * @module routes/settings
 */

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
router.post('/onedrive-path', authenticate, requireAdmin, [
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
 * Test a OneDrive path without saving it (Admin only)
 * 
 * Body:
 *   - path: string - The path to test
 */
router.post('/onedrive-test', authenticate, requireAdmin, [
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

module.exports = router;
