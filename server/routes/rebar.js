const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logTaskHistory } = require('./tasks');

const router = express.Router();

// Get rebar report by taskId (tenant-scoped)
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
          projects:project_id(project_name, project_number)
        `)
        .eq('id', taskId)
        .eq('task_type', 'REBAR')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        assignedTechnicianId: data.assigned_technician_id ?? data.assignedTechnicianId,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'REBAR'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const data = await db.get('rebar_reports', { taskId });

    if (data) {
      // Add project info
      data.projectName = task.projectName;
      data.projectNumber = task.projectNumber;
      
      // If technicianId is missing but task has assigned technician, use that
      if (!data.technicianId && assignedId) {
        data.technicianId = assignedId;
      }
      
      // If techName is missing but technicianId exists, fetch technician name
      if (!data.techName && data.technicianId) {
        const tech = await db.get('users', { id: data.technicianId });
        if (tech) {
          data.techName = tech.name || tech.email || '';
        }
      }
      
      res.json(data);
    } else {
      // Return empty structure with default technician from task assignment
      const defaultTechId = assignedId || null;
      const defaultTechName = req.user.name || req.user.email || '';
      
      // Default reportDate to today
      const today = new Date().toISOString().split('T')[0];
      
      res.json({
        taskId: parseInt(taskId),
        projectName: task.projectName,
        projectNumber: task.projectNumber,
        clientName: '',
        reportDate: today,
        inspectionDate: today,
        generalContractor: '',
        locationDetail: '',
        wireMeshSpec: '',
        drawings: '',
        technicianId: defaultTechId,
        techName: defaultTechName
      });
    }
  } catch (err) {
    console.error('Error fetching rebar report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save rebar report by taskId
router.post('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const {
      clientName,
      reportDate,
      inspectionDate,
      generalContractor,
      locationDetail,
      wireMeshSpec,
      drawings,
      techName,
      technicianId,
      updateStatus,
      assignedTechnicianId
    } = req.body;

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number)
        `)
        .eq('id', taskId)
        .eq('task_type', 'REBAR')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'REBAR'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const postAssignedId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && postAssignedId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantId = task.tenant_id ?? task.tenantId ?? req.tenantId;

    // Check if report exists
    const existing = await db.get('rebar_reports', { taskId });

    // Get technician name if technicianId is provided
    let finalTechName = techName || '';
    if (technicianId) {
      const tech = await db.get('users', { id: technicianId });
      if (tech) {
        finalTechName = tech.name || tech.email || '';
      }
    }

    // Prepare data for insertion/update (omit tenantId when legacy DB has no tenant_id column)
    const rebarData = {
      taskId,
      clientName: clientName || null,
      reportDate: reportDate || null,
      inspectionDate: inspectionDate || null,
      generalContractor: generalContractor || null,
      locationDetail: locationDetail || null,
      wireMeshSpec: wireMeshSpec || null,
      drawings: drawings || null,
      technicianId: technicianId || null,
      techName: finalTechName || null,
      updatedAt: new Date().toISOString()
    };
    if (!req.legacyDb) rebarData.tenantId = tenantId;

    // Retry without tenantId if DB doesn't have tenant_id column (e.g. schema not migrated)
    const isLikelyTenantColumnError = (err) =>
      err && err.message && /tenant_id|tenant id|column.*does not exist|schema cache/i.test(err.message);

    let result;
    try {
      if (existing) {
        await db.update('rebar_reports', rebarData, { taskId });
      } else {
        result = await db.insert('rebar_reports', rebarData);
      }
    } catch (err) {
      if (rebarData.tenantId != null && isLikelyTenantColumnError(err)) {
        delete rebarData.tenantId;
        try {
          if (existing) {
            await db.update('rebar_reports', rebarData, { taskId });
          } else {
            result = await db.insert('rebar_reports', rebarData);
          }
        } catch (retryErr) {
          console.error('Rebar save retry without tenantId failed:', retryErr.message);
          throw retryErr;
        }
      } else {
        throw err;
      }
    }

    // Fetch full report for response (so client and PDF can rely on it)
    let savedReport = await db.get('rebar_reports', { taskId });
    if (!savedReport && result && result.id) {
      savedReport = result; // Use insert result if get missed it (e.g. timing)
    }
    if (!savedReport && existing) {
      savedReport = { ...existing, ...rebarData }; // After update, use existing + updates
    }
    if (!savedReport) {
      console.error('Rebar save: insert/update succeeded but get returned null', { taskId, existing: !!existing });
      return res.status(500).json({ error: 'Report saved but could not be read back. Please refresh and try again.' });
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

    // Update assigned technician if provided (admin can change)
    if (assignedTechnicianId !== undefined && req.user.role === 'ADMIN') {
      await db.update('tasks', {
        assignedTechnicianId: assignedTechnicianId || null
      }, { id: taskId });
    }

    // Return full report (client expects RebarReport with id so PDF flow works)
    const reportWithProject = {
      ...savedReport,
      projectName: task.projectName,
      projectNumber: task.projectNumber
    };
    res.json(reportWithProject);
  } catch (err) {
    console.error('Error saving rebar report:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

