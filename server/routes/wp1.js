const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logTaskHistory } = require('./tasks');

const router = express.Router();

// Get WP1 data by taskId (tenant-scoped)
router.get('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number, spec_strength_psi, spec_ambient_temp_f, 
            spec_concrete_temp_f, spec_slump, spec_air_content_by_volume, soil_specs)
        `)
        .eq('id', taskId)
        .eq('task_type', 'COMPRESSIVE_STRENGTH')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Convert snake_case keys to camelCase for consistency
      const { keysToCamelCase } = require('../db/supabase');
      task = keysToCamelCase({
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        specStrengthPsi: data.projects?.spec_strength_psi,
        specAmbientTempF: data.projects?.spec_ambient_temp_f,
        specConcreteTempF: data.projects?.spec_concrete_temp_f,
        specSlump: data.projects?.spec_slump,
        specAirContentByVolume: data.projects?.spec_air_content_by_volume,
        soilSpecs: data.projects?.soil_specs,
        projects: undefined
      });
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber, p.specStrengthPsi, p.specAmbientTempF, 
           p.specConcreteTempF, p.specSlump, p.specAirContentByVolume, p.soilSpecs
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'COMPRESSIVE_STRENGTH'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found or task type is not COMPRESSIVE_STRENGTH. This endpoint is only for COMPRESSIVE_STRENGTH tasks.' 
      });
    }

    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse soilSpecs JSON
    let soilSpecs = {};
    if (task.soilSpecs) {
      if (typeof task.soilSpecs === 'string') {
        try {
          soilSpecs = JSON.parse(task.soilSpecs);
        } catch (e) {
          soilSpecs = {};
        }
      } else {
        soilSpecs = task.soilSpecs;
      }
    }

    const data = await db.get('wp1_data', { taskId });

    if (data) {
      // Parse cylinders JSON
      if (typeof data.cylinders === 'string') {
        try {
          data.cylinders = JSON.parse(data.cylinders || '[]');
        } catch (e) {
          data.cylinders = [];
        }
      } else {
        data.cylinders = data.cylinders || [];
      }
      // Add project specs for auto-population (legacy flat structure)
      data.projectSpecs = {
        specStrengthPsi: task.specStrengthPsi,
        specAmbientTempF: task.specAmbientTempF,
        specConcreteTempF: task.specConcreteTempF,
        specSlump: task.specSlump,
        specAirContentByVolume: task.specAirContentByVolume,
      };
      // Add soilSpecs for structure-based auto-population
      data.soilSpecs = soilSpecs;
      res.json(data);
    } else {
      // Return empty structure with project specs
      res.json({
        taskId: parseInt(taskId),
        cylinders: [],
        projectSpecs: {
          specStrengthPsi: task.specStrengthPsi,
          specAmbientTempF: task.specAmbientTempF,
          specConcreteTempF: task.specConcreteTempF,
          specSlump: task.specSlump,
          specAirContentByVolume: task.specAirContentByVolume,
        },
        soilSpecs: soilSpecs
      });
    }
  } catch (err) {
    console.error('Error fetching WP1 data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save WP1 data by taskId
router.post('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    // Check task access
    const task = await db.get('tasks', { id: taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify task type
    // IMPORTANT: db.get() returns camelCase keys (taskType) for both Supabase and SQLite
    // The db adapter converts snake_case to camelCase automatically via keysToCamelCase()
    // So we always use task.taskType, not task.task_type
    const actualTaskType = task.taskType;
    if (!actualTaskType || actualTaskType !== 'COMPRESSIVE_STRENGTH') {
      return res.status(400).json({ 
        error: `This endpoint is only for COMPRESSIVE_STRENGTH tasks. Current task type: ${actualTaskType || 'unknown'}. Please use the appropriate endpoint for ${actualTaskType || 'this task type'}.` 
      });
    }

    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantId = task.tenant_id ?? task.tenantId ?? req.tenantId;
    const {
      technician, weather, placementDate, specStrength, specStrengthDays,
      structure, sampleLocation, supplier, timeBatched, classMixId, timeSampled,
      yardsBatched, ambientTempMeasured, ambientTempSpecs, truckNo, ticketNo,
      concreteTempMeasured, concreteTempSpecs, plant, slumpMeasured, slumpSpecs,
      yardsPlaced, totalYards, airContentMeasured, airContentSpecs,
      waterAdded, unitWeight, finalCureMethod,
      specimenNo, specimenQty, specimenType,
      cylinders, remarks,
      updateStatus, // Optional: status to set when saving
      assignedTechnicianId // Optional: technician ID to assign to task
    } = req.body;

    // Prepare data for insertion/update (omit tenantId when legacy DB has no tenant_id column)
    // For Supabase, JSONB fields accept arrays directly; for SQLite, we stringify
    const wp1Data = {
      taskId,
      workPackageId: null,
      technician: technician || null,
      weather: weather || null,
      placementDate: placementDate || null,
      specStrength: specStrength || null,
      specStrengthDays: specStrengthDays || null,
      structure: structure || null,
      sampleLocation: sampleLocation || null,
      supplier: supplier || null,
      timeBatched: timeBatched || null,
      classMixId: classMixId || null,
      timeSampled: timeSampled || null,
      yardsBatched: yardsBatched || null,
      ambientTempMeasured: ambientTempMeasured || null,
      ambientTempSpecs: ambientTempSpecs || null,
      truckNo: truckNo || null,
      ticketNo: ticketNo || null,
      concreteTempMeasured: concreteTempMeasured || null,
      concreteTempSpecs: concreteTempSpecs || null,
      plant: plant || null,
      slumpMeasured: slumpMeasured || null,
      slumpSpecs: slumpSpecs || null,
      yardsPlaced: yardsPlaced || null,
      totalYards: totalYards || null,
      airContentMeasured: airContentMeasured || null,
      airContentSpecs: airContentSpecs || null,
      waterAdded: waterAdded || null,
      unitWeight: unitWeight || null,
      finalCureMethod: finalCureMethod || null,
      specimenNo: specimenNo || null,
      specimenQty: specimenQty || null,
      specimenType: specimenType || null,
      cylinders: cylinders || [],
      remarks: remarks || null,
      lastEditedByRole: req.user.role,
      lastEditedByName: req.user.name || req.user.email || null,
      lastEditedByUserId: req.user.id,
      updatedAt: new Date().toISOString()
    };
    if (!req.legacyDb) wp1Data.tenantId = tenantId;

    // Check if record exists
    const existing = await db.get('wp1_data', { taskId });

    const isTenantIdError = (e) => e && e.message && /tenant_id/.test(e.message);

    let data;
    if (existing) {
      // Update
      try {
        await db.update('wp1_data', wp1Data, { taskId });
      } catch (e) {
        if (isTenantIdError(e) && wp1Data.tenantId != null) {
          delete wp1Data.tenantId;
          await db.update('wp1_data', wp1Data, { taskId });
        } else throw e;
      }
      data = await db.get('wp1_data', { taskId });
    } else {
      // Insert (retry without tenantId if DB has no tenant_id column)
      try {
        data = await db.insert('wp1_data', wp1Data);
      } catch (e) {
        if (isTenantIdError(e) && wp1Data.tenantId != null) {
          delete wp1Data.tenantId;
          data = await db.insert('wp1_data', wp1Data);
        } else throw e;
      }
    }

    // Update task status if provided
    if (updateStatus) {
      const taskUpdate = {
        status: updateStatus,
        updatedAt: new Date().toISOString()
      };
      
      if (updateStatus === 'READY_FOR_REVIEW') {
        taskUpdate.reportSubmitted = 1;
        if (req.user.role === 'TECHNICIAN') {
          taskUpdate.submittedAt = new Date().toISOString();
        }
      }
      
      await db.update('tasks', taskUpdate, { id: taskId });
      
      // Log history
      if (updateStatus === 'READY_FOR_REVIEW') {
        await logTaskHistory(taskId, req.user.role, req.user.name || req.user.email || 'User', req.user.id, 'SUBMITTED', 'Report submitted for review');
      }
    }

    // Update task assignment if technician changed (admin only)
    if (req.user.role === 'ADMIN' && technician) {
      // Try to find technician by name or email
      const techUser = await db.get('users', { role: 'TECHNICIAN' });
      // Note: This is simplified - in production, you'd search by name or email
      // For now, we'll skip this complex lookup
    }

    // Parse cylinders for response
    if (typeof data.cylinders === 'string') {
      try {
        data.cylinders = JSON.parse(data.cylinders || '[]');
      } catch (e) {
        data.cylinders = [];
      }
    } else {
      data.cylinders = data.cylinders || [];
    }
    
    res.json(data);
  } catch (err) {
    const taskIdForLog = req.params.taskId != null ? req.params.taskId : 'unknown';
    console.error('Error saving WP1 data:', err);
    console.error('Error details:', {
      taskId: taskIdForLog,
      errorMessage: err.message,
      errorStack: err.stack,
      requestBody: req.body
    });
    
    // Provide more specific error messages
    let errorMessage = 'Save failed. Please try again.';
    if (err.message && err.message.includes('task type')) {
      errorMessage = err.message;
    } else if (err.message && err.message.includes('not found')) {
      errorMessage = 'Task not found. Please refresh and try again.';
    } else if (err.message && err.message.includes('Database error')) {
      errorMessage = 'Database error occurred. Please try again or contact support.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

module.exports = router;

