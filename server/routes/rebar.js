const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');
const { logTaskHistory } = require('./tasks');

const router = express.Router();

// Get rebar report by taskId
router.get('/task/:taskId', authenticate, async (req, res) => {
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

    // Ensure project name/number are available (Supabase relation may not populate)
    const projectIdForTask = task.project_id ?? task.projectId;
    if ((!task.projectName || !task.projectNumber) && projectIdForTask) {
      const project = await db.get('projects', { id: projectIdForTask });
      if (project) {
        task.projectName = task.projectName || project.projectName || project.project_name || '';
        task.projectNumber = task.projectNumber || project.projectNumber || project.project_number || '';
      }
    }

    // Check access
    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let tenantId = db.isSupabase() && (task.tenant_id != null || task.tenantId != null) ? (task.tenant_id ?? task.tenantId) : null;
    if (tenantId == null && db.isSupabase() && (task.project_id != null || task.projectId != null)) {
      const project = await db.get('projects', { id: task.project_id ?? task.projectId });
      if (project) tenantId = project.tenant_id ?? project.tenantId ?? null;
    }
    const getConditions = { taskId };
    if (tenantId != null) getConditions.tenant_id = tenantId;
    let data = await db.get('rebar_reports', getConditions);
    if (!data) {
      data = await db.get('rebar_reports', { taskId });
    }

    if (data) {
      // Add project info
      data.projectName = task.projectName;
      data.projectNumber = task.projectNumber;
      
      // If technicianId is missing but task has assigned technician, use that
      if (!data.technicianId && task.assignedTechnicianId) {
        data.technicianId = task.assignedTechnicianId;
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
      const defaultTechId = task.assignedTechnicianId || null;
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
router.post('/task/:taskId', authenticate, async (req, res) => {
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

    // Check access
    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let tenantId = db.isSupabase() && (task.tenant_id != null || task.tenantId != null) ? (task.tenant_id ?? task.tenantId) : null;
    if (tenantId == null && db.isSupabase() && (task.project_id != null || task.projectId != null)) {
      const project = await db.get('projects', { id: task.project_id ?? task.projectId });
      if (project) tenantId = project.tenant_id ?? project.tenantId ?? null;
    }
    const getConditions = { taskId };
    if (tenantId != null) getConditions.tenant_id = tenantId;
    let existing = await db.get('rebar_reports', getConditions);
    let foundByTaskIdOnly = false;
    if (!existing) {
      existing = await db.get('rebar_reports', { taskId });
      foundByTaskIdOnly = !!existing;
    }

    // Get technician name if technicianId is provided
    let finalTechName = techName || '';
    if (technicianId) {
      const tech = await db.get('users', { id: technicianId });
      if (tech) {
        finalTechName = tech.name || tech.email || '';
      }
    }

    // Prepare data for insertion/update (tenant_id required for multi-tenant Supabase)
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
    if (tenantId != null) rebarData.tenant_id = tenantId;
    else if (db.isSupabase()) {
      rebarData.tenant_id = 1;
    }

    const updateConditions = { taskId };
    if (tenantId != null) updateConditions.tenant_id = tenantId;
    let result;
    if (existing) {
      const updateBy = foundByTaskIdOnly ? { taskId } : updateConditions;
      await db.update('rebar_reports', rebarData, updateBy);
      result = { success: true, id: existing.id };
    } else {
      // Insert new report
      result = await db.insert('rebar_reports', rebarData);
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

    res.json({ success: true, id: result.id || existing?.id });
  } catch (err) {
    console.error('Error saving rebar report:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

