const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');
const { createNotification } = require('./notifications');

const router = express.Router();

// Helper function to log task history
async function logTaskHistory(taskId, tenantId, actorRole, actorName, actorUserId, actionType, note) {
  try {
    await db.insert('task_history', {
      taskId,
      tenantId: tenantId ?? null,
      actorRole,
      actorName,
      actorUserId: actorUserId || null,
      actionType,
      note: note || null
    });
  } catch (err) {
    console.error('Error logging task history:', err);
  }
}

// Helper function to fetch tasks with joins (works for both Supabase and SQLite)
async function fetchTasksWithJoins(conditions = {}, orderBy = 'created_at DESC') {
  if (db.isSupabase()) {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        users:assigned_technician_id(name, email),
        projects:project_id(project_number, project_name)
      `);
    
    // Apply conditions
    if (conditions.projectId) {
      query = query.eq('project_id', conditions.projectId);
    }
    if (conditions.assignedTechnicianId) {
      query = query.eq('assigned_technician_id', conditions.assignedTechnicianId);
    }
    if (conditions.status) {
      query = query.eq('status', conditions.status);
    }
    if (conditions.statusNot) {
      query = query.neq('status', conditions.statusNot);
    }
    if (conditions.fieldCompleted !== undefined) {
      query = query.eq('field_completed', conditions.fieldCompleted ? 1 : 0);
    }
    if (conditions.reportSubmitted !== undefined) {
      query = query.eq('report_submitted', conditions.reportSubmitted ? 1 : 0);
    }
    
    // Order by
    const [column, direction = 'desc'] = orderBy.toLowerCase().split(' ');
    query = query.order(column.replace(/([A-Z])/g, '_$1').toLowerCase(), { 
      ascending: direction !== 'desc' 
    });
    
    const { data, error } = await query;
    if (error) throw error;
    
    return (data || []).map(task => ({
      ...task,
      assignedTechnicianName: task.users?.name || null,
      assignedTechnicianEmail: task.users?.email || null,
      projectNumber: task.projects?.project_number || null,
      projectName: task.projects?.project_name || null,
      assignedTechnicianId: task.assigned_technician_id,
      projectId: task.project_id,
      taskType: task.task_type,
      dueDate: task.due_date,
      scheduledStartDate: task.scheduled_start_date,
      scheduledEndDate: task.scheduled_end_date,
      locationName: task.location_name,
      locationNotes: task.location_notes,
      engagementNotes: task.engagement_notes,
      fieldCompleted: task.field_completed,
      reportSubmitted: task.report_submitted,
      proctorNo: task.proctor_no,
      users: undefined,
      projects: undefined
    }));
  } else {
    // SQLite fallback
    const sqliteDb = require('../database');
    let sql = `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
               p.projectNumber, p.projectName
               FROM tasks t
               LEFT JOIN users u ON t.assignedTechnicianId = u.id
               INNER JOIN projects p ON t.projectId = p.id`;
    
    const whereClauses = [];
    const params = [];
    
    if (conditions.projectId) {
      whereClauses.push('t.projectId = ?');
      params.push(conditions.projectId);
    }
    if (conditions.assignedTechnicianId) {
      whereClauses.push('t.assignedTechnicianId = ?');
      params.push(conditions.assignedTechnicianId);
    }
    if (conditions.status) {
      whereClauses.push('t.status = ?');
      params.push(conditions.status);
    }
    if (conditions.statusNot) {
      whereClauses.push('t.status != ?');
      params.push(conditions.statusNot);
    }
    if (conditions.fieldCompleted !== undefined) {
      whereClauses.push('t.fieldCompleted = ?');
      params.push(conditions.fieldCompleted ? 1 : 0);
    }
    if (conditions.reportSubmitted !== undefined) {
      whereClauses.push('t.reportSubmitted = ?');
      params.push(conditions.reportSubmitted ? 1 : 0);
    }
    
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }
    
    sql += ` ORDER BY ${orderBy}`;
    
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

// Get all tasks (tenant-scoped, filtered by role; legacy DB: no tenant filter)
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const legacyDb = req.legacyDb;
    let tasks;

    if (db.isSupabase()) {
      if (req.user.role === 'ADMIN') {
        let query = supabase
          .from('tasks')
          .select(`
            *,
            users:assigned_technician_id(name, email),
            projects:project_id(project_number, project_name)
          `)
          .order('created_at', { ascending: false });
        if (!legacyDb) query = query.eq('tenant_id', tenantId);
        const { data, error } = await query;
        if (error) throw error;
        tasks = (data || []).map(task => ({
          ...task,
          assignedTechnicianName: task.users?.name || null,
          assignedTechnicianEmail: task.users?.email || null,
          projectNumber: task.projects?.project_number || null,
          projectName: task.projects?.project_name || null,
          users: undefined,
          projects: undefined
        }));
      } else {
        let query = supabase
          .from('tasks')
          .select(`
            *,
            users:assigned_technician_id(name, email),
            projects:project_id(project_number, project_name)
          `)
          .eq('assigned_technician_id', req.user.id)
          .order('created_at', { ascending: false });
        if (!legacyDb) query = query.eq('tenant_id', tenantId);
        const { data, error } = await query;
        if (error) throw error;
        tasks = (data || []).map(task => ({
          ...task,
          assignedTechnicianName: task.users?.name || null,
          assignedTechnicianEmail: task.users?.email || null,
          projectNumber: task.projects?.project_number || null,
          projectName: task.projects?.project_name || null,
          users: undefined,
          projects: undefined
        }));
      }
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
      let query;
      let params;
      if (req.user.role === 'ADMIN') {
        query = legacyDb
          ? `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail, p.projectNumber, p.projectName FROM tasks t LEFT JOIN users u ON t.assignedTechnicianId = u.id INNER JOIN projects p ON t.projectId = p.id ORDER BY t.createdAt DESC`
          : `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail, p.projectNumber, p.projectName FROM tasks t LEFT JOIN users u ON t.assignedTechnicianId = u.id INNER JOIN projects p ON t.projectId = p.id WHERE t.tenantId = ? ORDER BY t.createdAt DESC`;
        params = legacyDb ? [] : [tenantId];
      } else {
        query = legacyDb
          ? `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail, p.projectNumber, p.projectName FROM tasks t LEFT JOIN users u ON t.assignedTechnicianId = u.id INNER JOIN projects p ON t.projectId = p.id WHERE t.assignedTechnicianId = ? ORDER BY t.createdAt DESC`
          : `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail, p.projectNumber, p.projectName FROM tasks t LEFT JOIN users u ON t.assignedTechnicianId = u.id INNER JOIN projects p ON t.projectId = p.id WHERE t.assignedTechnicianId = ? AND t.tenantId = ? ORDER BY t.createdAt DESC`;
        params = legacyDb ? [req.user.id] : [req.user.id, tenantId];
      }
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get tasks for a project (tenant-scoped)
router.get('/project/:projectId', authenticate, requireTenant, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const tenantId = req.tenantId;

    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!req.legacyDb && (project.tenant_id ?? project.tenantId) !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let tasks;
    
    if (db.isSupabase()) {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email)
        `)
        .eq('project_id', projectId);
      
      if (req.user.role !== 'ADMIN') {
        query = query.eq('assigned_technician_id', req.user.id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      tasks = (data || []).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        locationName: task.location_name,
        locationNotes: task.location_notes,
        engagementNotes: task.engagement_notes,
        rejectionRemarks: task.rejection_remarks,
        resubmissionDueDate: task.resubmission_due_date,
        fieldCompleted: task.field_completed,
        fieldCompletedAt: task.field_completed_at,
        reportSubmitted: task.report_submitted,
        lastEditedByUserId: task.last_edited_by_user_id,
        lastEditedByRole: task.last_edited_by_role,
        lastEditedAt: task.last_edited_at,
        // Note: submittedAt and completedAt columns don't exist in schema
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        proctorNo: task.proctor_no,
        users: undefined
      }));
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
      let query;
      let params;

      if (req.user.role === 'ADMIN') {
        query = `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
                 FROM tasks t
                 LEFT JOIN users u ON t.assignedTechnicianId = u.id
                 WHERE t.projectId = ?
                 ORDER BY t.createdAt DESC`;
        params = [projectId];
      } else {
        query = `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
                 FROM tasks t
                 LEFT JOIN users u ON t.assignedTechnicianId = u.id
                 WHERE t.projectId = ? AND t.assignedTechnicianId = ?
                 ORDER BY t.createdAt DESC`;
        params = [projectId, req.user.id];
      }

      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
    
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching project tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get Proctor tasks for a project (for Density form dropdown)
router.get('/project/:projectId/proctors', authenticate, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Check project access
    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get PROCTOR tasks for this project, ordered by proctorNo
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, proctor_no, status, project_id')
        .eq('project_id', projectId)
        .eq('task_type', 'PROCTOR')
        .not('proctor_no', 'is', null)
        .order('proctor_no', { ascending: true });
      
      if (error) throw error;
      tasks = (data || []).map(t => ({
        id: t.id,
        proctorNo: t.proctor_no,
        status: t.status,
        projectId: t.project_id
      }));
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.id, t.proctorNo, t.status, t.projectId
           FROM tasks t
           WHERE t.projectId = ? AND t.taskType = 'PROCTOR' AND t.proctorNo IS NOT NULL
           ORDER BY t.proctorNo ASC`,
          [projectId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }

    if (tasks.length === 0) {
      return res.json([]);
    }

    // Fetch OMC/MDD for each task
    const tasksWithData = await Promise.all(tasks.map(async (task) => {
      let proctorData;
      if (db.isSupabase()) {
        const { data, error } = await supabase
          .from('proctor_data')
          .select('opt_moisture_pct, max_dry_density_pcf, optimum_moisture_percent, maximum_dry_density_pcf')
          .eq('task_id', task.id)
          .order('id', { ascending: false })
          .limit(1)
          .single();
        
        if (!error && data) {
          proctorData = {
            optMoisturePct: data.opt_moisture_pct,
            maxDryDensityPcf: data.max_dry_density_pcf,
            optimumMoisturePercent: data.optimum_moisture_percent,
            maximumDryDensityPcf: data.maximum_dry_density_pcf
          };
        }
      } else {
        const sqliteDb = require('../database');
        proctorData = await new Promise((resolve, reject) => {
          sqliteDb.get(
            `SELECT optMoisturePct, maxDryDensityPcf, optimumMoisturePercent, maximumDryDensityPcf
             FROM proctor_data
             WHERE taskId = ?
             ORDER BY id DESC
             LIMIT 1`,
            [task.id],
            (err, row) => {
              if (err) reject(err);
              else resolve(row || null);
            }
          );
        });
      }

      // Use canonical fields if available, otherwise fallback to old fields
      const optMoisture = proctorData?.optMoisturePct !== null && proctorData?.optMoisturePct !== undefined
        ? String(proctorData.optMoisturePct)
        : (proctorData?.optimumMoisturePercent || '');
      
      const maxDensity = proctorData?.maxDryDensityPcf !== null && proctorData?.maxDryDensityPcf !== undefined
        ? String(proctorData.maxDryDensityPcf)
        : (proctorData?.maximumDryDensityPcf || '');

      return {
        id: task.id,
        proctorNo: task.proctorNo,
        status: task.status,
        optMoisture: optMoisture,
        maxDensity: maxDensity
      };
    }));

    res.json(tasksWithData);
  } catch (err) {
    console.error('Error fetching proctor tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single task (tenant-scoped)
router.get('/:id', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const tenantId = req.tenantId;

    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_name, project_number)
        `)
        .eq('id', taskId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        assignedTechnicianName: data.users?.name,
        assignedTechnicianEmail: data.users?.email,
        assignedTechnicianId: data.assigned_technician_id,
        projectId: data.project_id,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        taskType: data.task_type,
        dueDate: data.due_date,
        scheduledStartDate: data.scheduled_start_date,
        scheduledEndDate: data.scheduled_end_date,
        locationName: data.location_name,
        locationNotes: data.location_notes,
        engagementNotes: data.engagement_notes,
        rejectionRemarks: data.rejection_remarks,
        resubmissionDueDate: data.resubmission_due_date,
        fieldCompleted: data.field_completed,
        fieldCompletedAt: data.field_completed_at,
        reportSubmitted: data.report_submitted,
        lastEditedByUserId: data.last_edited_by_user_id,
        lastEditedByRole: data.last_edited_by_role,
        lastEditedAt: data.last_edited_at,
        // Note: submittedAt and completedAt columns don't exist in schema
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        proctorNo: data.proctor_no,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectName, p.projectNumber
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
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
    if (!req.legacyDb) {
      const taskTenantId = task.tenant_id ?? task.tenantId;
      if (taskTenantId != null && taskTenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(task);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update task (Admin only for assignment/scheduling, or Technician for their own tasks)
// NOTE: This route is deprecated in favor of the admin-only PUT /:id route below
// Keeping for backward compatibility but should use the admin route for new code
router.put('/:id', authenticate, [
  body('assignedTechnicianId').optional().isInt(),
  body('dueDate').optional(),
  body('scheduledStartDate').optional(),
  body('scheduledEndDate').optional(),
  body('locationName').optional(),
  body('locationNotes').optional(),
  body('engagementNotes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const {
      assignedTechnicianId,
      dueDate,
      scheduledStartDate,
      scheduledEndDate,
      locationName,
      locationNotes,
      engagementNotes
    } = req.body;

    // Check access and get task
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      task = data;
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only admins can assign/reassign technicians
    if (req.user.role === 'TECHNICIAN') {
      const assignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;
      if (assignedId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Technicians can only update their own tasks, but not assignment
      if (assignedTechnicianId !== undefined && assignedTechnicianId !== assignedId) {
        return res.status(403).json({ error: 'Technicians cannot change task assignment' });
      }
    }

    // Verify technician exists if provided
    if (assignedTechnicianId) {
      const tech = await db.get('users', { id: assignedTechnicianId, role: 'TECHNICIAN' });
      if (!tech) {
        return res.status(404).json({ error: 'Technician not found' });
      }
    }

    // Build update data
    const updateData = {};
    const oldAssignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;

    if (assignedTechnicianId !== undefined) {
      updateData.assignedTechnicianId = assignedTechnicianId || null;
      // Set status to ASSIGNED if assigning
      if (assignedTechnicianId && !oldAssignedId) {
        updateData.status = 'ASSIGNED';
      }
    }
    if (dueDate !== undefined) updateData.dueDate = dueDate || null;
    if (scheduledStartDate !== undefined) updateData.scheduledStartDate = scheduledStartDate || null;
    if (scheduledEndDate !== undefined) updateData.scheduledEndDate = scheduledEndDate || null;
    if (locationName !== undefined) updateData.locationName = locationName || null;
    if (locationNotes !== undefined) updateData.locationNotes = locationNotes || null;
    if (engagementNotes !== undefined) updateData.engagementNotes = engagementNotes || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateData.updatedAt = new Date().toISOString();

    // Update task
    await db.update('tasks', updateData, { id: taskId });

    // Create notification and log history if technician was assigned/reassigned
    if (assignedTechnicianId && assignedTechnicianId !== oldAssignedId) {
      const taskTypeLabels = {
        'COMPRESSIVE_STRENGTH': 'Compressive Strength',
        'DENSITY_MEASUREMENT': 'Density Measurement',
        'PROCTOR': 'Proctor',
        'REBAR': 'Rebar',
        'CYLINDER_PICKUP': 'Cylinder Pickup',
      };
      const taskType = db.isSupabase() ? task.task_type : task.taskType;
      const taskLabel = taskTypeLabels[taskType] || taskType;
      const projectId = db.isSupabase() ? task.project_id : task.projectId;
      
      // Get old and new technician names for history
      const techIds = [oldAssignedId || 0, assignedTechnicianId].filter(id => id);
      const techs = await Promise.all(techIds.map(id => db.get('users', { id })));
      const oldTech = techs.find(t => t && t.id === oldAssignedId);
      const newTech = techs.find(t => t && t.id === assignedTechnicianId);
      const oldTechName = oldTech ? (oldTech.name || oldTech.email) : 'Unassigned';
      const newTechName = newTech ? (newTech.name || newTech.email) : 'Unassigned';
      
      // Log history: Task reassigned
      const adminName = req.user.name || req.user.email || 'Admin';
      await logTaskHistory(taskId, req.tenantId, req.user.role, adminName, req.user.id, 'REASSIGNED', `Task reassigned from ${oldTechName} to ${newTechName}`);
      
      const project = await db.get('projects', { id: projectId });
      if (project) {
        const message = `Admin ${oldAssignedId ? 'reassigned' : 'assigned'} ${taskLabel} for Project ${project.projectNumber}`;
        await createNotification(assignedTechnicianId, message, 'info', taskId, projectId);
      }
    }

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Create task (Admin only, tenant-scoped)
router.post('/', authenticate, requireTenant, requireAdmin, [
  body('projectId').isInt(),
  body('taskType').isIn(['DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP']),
  body('assignedTechnicianId').optional().isInt(),
  body('dueDate').optional(),
  body('scheduledStartDate').optional(),
  body('scheduledEndDate').optional(),
  body('locationName').optional(),
  body('locationNotes').optional(),
  body('engagementNotes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      projectId,
      taskType,
      assignedTechnicianId,
      dueDate,
      scheduledStartDate,
      scheduledEndDate,
      locationName,
      locationNotes,
      engagementNotes
    } = req.body;

    const tenantId = req.tenantId;

    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!req.legacyDb && (project.tenant_id ?? project.tenantId) !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (assignedTechnicianId) {
      const tech = req.legacyDb
        ? await db.get('users', { id: assignedTechnicianId, role: 'TECHNICIAN' })
        : await db.get('users', { id: assignedTechnicianId, role: 'TECHNICIAN', tenant_id: tenantId });
      if (!tech) {
        return res.status(404).json({ error: 'Technician not found' });
      }
    }

    // Ensure dates are stored as YYYY-MM-DD strings (no timezone conversion)
    const normalizeDate = (dateStr) => {
      if (!dateStr) return null;
      const trimmed = dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      return null;
    };

    const normalizedDueDate = normalizeDate(dueDate);
    const normalizedScheduledStartDate = normalizeDate(scheduledStartDate);
    const normalizedScheduledEndDate = normalizeDate(scheduledEndDate);

    // For PROCTOR tasks, get next proctorNo for this project
    let proctorNo = null;
    if (taskType === 'PROCTOR') {
      if (db.isSupabase()) {
        const { data, error } = await supabase
          .from('tasks')
          .select('proctor_no')
          .eq('project_id', projectId)
          .eq('task_type', 'PROCTOR')
          .not('proctor_no', 'is', null)
          .order('proctor_no', { ascending: false })
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        proctorNo = data ? (data.proctor_no || 0) + 1 : 1;
      } else {
        const sqliteDb = require('../database');
        const row = await new Promise((resolve, reject) => {
          sqliteDb.get(
            'SELECT COALESCE(MAX(proctorNo), 0) as maxProctorNo FROM tasks WHERE projectId = ? AND taskType = ? AND proctorNo IS NOT NULL',
            [projectId, 'PROCTOR'],
            (err, r) => {
              if (err) reject(err);
              else resolve(r);
            }
          );
        });
        proctorNo = (row?.maxProctorNo || 0) + 1;
      }
    }

    const taskData = {
      projectId,
      tenantId,
      taskType,
      status: 'ASSIGNED',
      assignedTechnicianId: assignedTechnicianId || null,
      dueDate: normalizedDueDate,
      locationName: locationName || null,
      locationNotes: locationNotes || null,
      engagementNotes: engagementNotes || null,
      scheduledStartDate: normalizedScheduledStartDate,
      scheduledEndDate: normalizedScheduledEndDate,
      proctorNo
    };

    const task = await db.insert('tasks', taskData);
    const taskId = task.id;

    // If this is a COMPRESSIVE_STRENGTH, create wp1_data entry
    if (taskType === 'COMPRESSIVE_STRENGTH') {
      const wp1Initial = {
        taskId,
        workPackageId: null,
        cylinders: []
      };
      if (tenantId != null) wp1Initial.tenantId = tenantId;
      try {
        await db.insert('wp1_data', wp1Initial);
      } catch (err) {
        if (tenantId != null && err.message && /tenant_id/.test(err.message)) {
          delete wp1Initial.tenantId;
          try {
            await db.insert('wp1_data', wp1Initial);
          } catch (retryErr) {
            console.error('Error creating wp1_data:', retryErr);
          }
        } else {
          console.error('Error creating wp1_data:', err);
        }
        // Continue anyway, wp1_data can be created later when user saves the form
      }
    }

    // Create notification if assigned
    if (assignedTechnicianId) {
      const taskTypeLabels = {
        'COMPRESSIVE_STRENGTH': 'Compressive Strength',
        'DENSITY_MEASUREMENT': 'Density Measurement',
        'PROCTOR': 'Proctor',
        'REBAR': 'Rebar',
        'CYLINDER_PICKUP': 'Cylinder Pickup',
      };
      const taskLabel = taskTypeLabels[taskType] || taskType;
      const message = `Admin assigned ${taskLabel} for Project ${project.projectNumber}`;
      createNotification(assignedTechnicianId, message, 'info', null, projectId, taskId, tenantId).catch(console.error);
    }

    // Return created task with joins
    let createdTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      createdTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      createdTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    // Ensure dates are returned as YYYY-MM-DD strings
    if (createdTask) {
      createdTask.dueDate = createdTask.dueDate || null;
      createdTask.scheduledStartDate = createdTask.scheduledStartDate || null;
      createdTask.scheduledEndDate = createdTask.scheduledEndDate || null;
    }

    res.status(201).json(createdTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Update task (Admin only - allows editing all task fields, tenant-scoped)
router.put('/:id', authenticate, requireTenant, requireAdmin, [
  body('assignedTechnicianId').optional().isInt().withMessage('assignedTechnicianId must be an integer'),
  body('dueDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('dueDate must be in YYYY-MM-DD format'),
  body('scheduledStartDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('scheduledStartDate must be in YYYY-MM-DD format'),
  body('scheduledEndDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('scheduledEndDate must be in YYYY-MM-DD format'),
  body('locationName').optional().trim(),
  body('locationNotes').optional().trim(),
  body('engagementNotes').optional().trim(),
  body('taskType').optional().isIn(['DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const {
      assignedTechnicianId,
      dueDate,
      scheduledStartDate,
      scheduledEndDate,
      locationName,
      locationNotes,
      engagementNotes,
      taskType
    } = req.body;

    // Get existing task to compare changes
    let oldTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      if (!req.legacyDb && (data.tenant_id ?? data.tenantId) != null && (data.tenant_id ?? data.tenantId) !== req.tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      oldTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        assignedTechnicianId: data.assigned_technician_id,
        projectId: data.project_id,
        taskType: data.task_type,
        dueDate: data.due_date,
        scheduledStartDate: data.scheduled_start_date,
        scheduledEndDate: data.scheduled_end_date,
        locationName: data.location_name,
        locationNotes: data.location_notes,
        engagementNotes: data.engagement_notes,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      oldTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!oldTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Build update data dynamically based on provided fields
    const updateData = {};
    const changes = [];

    // Track assignment change
    let assignmentChange = null;
    const oldAssignedId = db.isSupabase() ? oldTask.assigned_technician_id : oldTask.assignedTechnicianId;
    if (assignedTechnicianId !== undefined && assignedTechnicianId !== oldAssignedId) {
      updateData.assignedTechnicianId = assignedTechnicianId || null;
      
      const oldTechName = oldTask.assignedTechnicianName || oldTask.assignedTechnicianEmail || 'Unassigned';
      if (assignedTechnicianId) {
        assignmentChange = { oldTechName, newTechId: assignedTechnicianId };
      } else {
        changes.push(`unassigned (was: ${oldTechName})`);
      }
    }

    // Track due date change
    if (dueDate !== undefined && dueDate !== oldTask.dueDate) {
      updateData.dueDate = dueDate || null;
      const oldDue = oldTask.dueDate || 'None';
      const newDue = dueDate || 'None';
      changes.push(`due date changed from ${oldDue} to ${newDue}`);
    }

    // Track scheduled dates changes
    if (scheduledStartDate !== undefined && scheduledStartDate !== oldTask.scheduledStartDate) {
      updateData.scheduledStartDate = scheduledStartDate || null;
      const oldStart = oldTask.scheduledStartDate || 'None';
      const newStart = scheduledStartDate || 'None';
      changes.push(`field start date changed from ${oldStart} to ${newStart}`);
    }

    if (scheduledEndDate !== undefined && scheduledEndDate !== oldTask.scheduledEndDate) {
      updateData.scheduledEndDate = scheduledEndDate || null;
      const oldEnd = oldTask.scheduledEndDate || 'None';
      const newEnd = scheduledEndDate || 'None';
      if (oldEnd === 'None' && newEnd !== 'None') {
        changes.push(`field date changed to range ending ${newEnd}`);
      } else if (oldEnd !== 'None' && newEnd === 'None') {
        changes.push(`field date changed from range to single date`);
      } else {
        changes.push(`field end date changed from ${oldEnd} to ${newEnd}`);
      }
    }

    // Track other field changes
    if (locationName !== undefined && locationName !== oldTask.locationName) {
      updateData.locationName = locationName || null;
      changes.push(`location name updated`);
    }

    if (locationNotes !== undefined && locationNotes !== oldTask.locationNotes) {
      updateData.locationNotes = locationNotes || null;
      changes.push(`location notes updated`);
    }

    if (engagementNotes !== undefined && engagementNotes !== oldTask.engagementNotes) {
      updateData.engagementNotes = engagementNotes || null;
      changes.push(`engagement notes updated`);
    }

    if (taskType !== undefined && taskType !== oldTask.taskType) {
      updateData.taskType = taskType;
      changes.push(`task type changed from ${oldTask.taskType} to ${taskType}`);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Always update updatedAt
    updateData.updatedAt = new Date().toISOString();

    // Get new tech name if assignment changed
    if (assignmentChange) {
      const newTech = await db.get('users', { id: assignmentChange.newTechId });
      if (newTech) {
        const newTechName = newTech.name || newTech.email;
        changes.push(`reassigned from ${assignmentChange.oldTechName} to ${newTechName}`);
      } else {
        changes.push(`reassigned to technician ID ${assignmentChange.newTechId}`);
      }
    }

    // Perform update
    await db.update('tasks', updateData, { id: taskId });

    // Get admin name for logging
    const adminName = req.user.name || req.user.email || 'Admin';

    // Log activity for each change
    if (changes.length > 0) {
      const changeNote = changes.join('; ');
      await logTaskHistory(taskId, req.tenantId, req.user.role, adminName, req.user.id, 'STATUS_CHANGED', changeNote);
    }

    // Send notification to new technician if reassigned
    if (assignmentChange && assignmentChange.newTechId) {
      const taskTypeLabels = {
        'COMPRESSIVE_STRENGTH': 'Compressive Strength',
        'DENSITY_MEASUREMENT': 'Density Measurement',
        'PROCTOR': 'Proctor',
        'REBAR': 'Rebar',
        'CYLINDER_PICKUP': 'Cylinder Pickup',
      };
      const taskType = db.isSupabase() ? oldTask.task_type : oldTask.taskType;
      const taskLabel = taskTypeLabels[taskType] || taskType;
      const projectId = db.isSupabase() ? oldTask.project_id : oldTask.projectId;
      const message = `Admin assigned ${taskLabel} for Project ${oldTask.projectNumber}`;
      await createNotification(assignmentChange.newTechId, message, 'info', taskId, projectId);
    }

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Update task status
router.put('/:id/status', authenticate, requireTenant, [
  body('status').isIn(['ASSIGNED', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED_NEEDS_FIX'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    // Check access and get task
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectNumber: data.projects?.project_number,
        projectName: data.projects?.project_name,
        assignedTechnicianId: data.assigned_technician_id,
        taskType: data.task_type,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectNumber, p.projectName 
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
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

    // Technicians can only set IN_PROGRESS_TECH or READY_FOR_REVIEW
    if (req.user.role === 'TECHNICIAN') {
      const assignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;
      if (assignedId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (status !== 'IN_PROGRESS_TECH' && status !== 'READY_FOR_REVIEW') {
        return res.status(403).json({ error: 'Technicians can only set status to IN_PROGRESS_TECH or READY_FOR_REVIEW' });
      }
    }

    // Build update data
    const updateData = {
      status,
      lastEditedByUserId: req.user.id,
      lastEditedByRole: req.user.role,
      lastEditedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Mark report as submitted when status becomes READY_FOR_REVIEW
    if (status === 'READY_FOR_REVIEW') {
      updateData.reportSubmitted = 1;
      // Note: submittedAt column doesn't exist in schema, using lastEditedAt instead
    }

    // Update task
    await db.update('tasks', updateData, { id: taskId });

    // Log history and create notification when technician sends update to admin
    if (status === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN') {
      const technician = await db.get('users', { id: req.user.id });
      const technicianName = technician?.name || technician?.email || 'Technician';
      
      // Log history: Technician submitted report
      await logTaskHistory(taskId, req.tenantId, req.user.role, technicianName, req.user.id, 'SUBMITTED', null);
      
      const taskTypeLabels = {
        'COMPRESSIVE_STRENGTH': 'Compressive Strength',
        'DENSITY_MEASUREMENT': 'Density Measurement',
        'PROCTOR': 'Proctor',
        'REBAR': 'Rebar',
        'CYLINDER_PICKUP': 'Cylinder Pickup',
      };
      const taskType = db.isSupabase() ? task.task_type : task.taskType;
      const taskLabel = taskTypeLabels[taskType] || taskType;
      const projectId = db.isSupabase() ? task.project_id : task.projectId;
      
      // Get all admins
      const admins = await db.all('users', { role: 'ADMIN' });
      if (admins && admins.length > 0) {
        const message = `${technicianName} completed ${taskLabel} for Project ${task.projectNumber}`;
        await Promise.all(admins.map(admin => 
          createNotification(admin.id, message, 'info', taskId, projectId)
        ));
      }
    }

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task status:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Approve task (Admin only)
router.post('/:id/approve', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    const task = await db.get('tasks', { id: taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const adminName = req.user.name || req.user.email || 'Admin';
    
    const updateData = {
      status: 'APPROVED',
      // Note: completedAt column doesn't exist in schema, using lastEditedAt instead
      lastEditedByUserId: req.user.id,
      lastEditedByRole: req.user.role,
      lastEditedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.update('tasks', updateData, { id: taskId });

    // Log history: Admin approved
    await logTaskHistory(taskId, req.tenantId, req.user.role, adminName, req.user.id, 'APPROVED', null);

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error approving task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Reject task (Admin only)
router.post('/:id/reject', authenticate, requireTenant, requireAdmin, [
  body('rejectionRemarks').notEmpty().trim(),
  body('resubmissionDueDate').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = parseInt(req.params.id);
    const { rejectionRemarks, resubmissionDueDate } = req.body;

    const task = await db.get('tasks', { id: taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const adminName = req.user.name || req.user.email || 'Admin';
    
    const updateData = {
      status: 'REJECTED_NEEDS_FIX',
      rejectionRemarks,
      resubmissionDueDate,
      lastEditedByUserId: req.user.id,
      lastEditedByRole: req.user.role,
      lastEditedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.update('tasks', updateData, { id: taskId });

    // Log history: Admin rejected
    await logTaskHistory(taskId, req.tenantId, req.user.role, adminName, req.user.id, 'REJECTED', rejectionRemarks);

    // Create notification for technician
    const assignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;
    const projectId = db.isSupabase() ? task.project_id : task.projectId;
    if (assignedId) {
      const project = await db.get('projects', { id: projectId });
      if (project) {
        const message = `Your task for Project ${project.projectNumber} has been rejected. Please review the remarks and resubmit.`;
        await createNotification(assignedId, message, 'warning', taskId, projectId);
      }
    }

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error rejecting task:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Dashboard endpoints
// TODAY: Show tasks based on field schedule dates (scheduledStartDate/scheduledEndDate)
// If no field schedule, fall back to report due date
router.get('/dashboard/today', authenticate, requireAdmin, async (req, res) => {
  try {
    // Get today's date in YYYY-MM-DD format (local date, no timezone)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    console.log(`[TODAY] Querying for tasks on: ${today}`);
    
    let tasks;
    if (db.isSupabase()) {
      // Fetch all tasks and filter in JavaScript for complex date logic
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `);
      
      if (error) throw error;
      
      // Filter tasks based on date logic
      tasks = (data || []).filter(task => {
        const dueDate = task.due_date;
        const scheduledStart = task.scheduled_start_date;
        const scheduledEnd = task.scheduled_end_date;
        
        // Rule A: Report Due Date is today
        if (dueDate === today) return true;
        
        // Rule B1: Single date (scheduledStartDate only, no scheduledEndDate)
        if (scheduledStart === today && !scheduledEnd) return true;
        
        // Rule B2: Date range (scheduledStartDate + scheduledEndDate) - inclusive boundaries
        if (scheduledStart && scheduledEnd && scheduledStart <= today && scheduledEnd >= today) return true;
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        locationName: task.location_name,
        locationNotes: task.location_notes,
        engagementNotes: task.engagement_notes,
        fieldCompleted: task.field_completed,
        reportSubmitted: task.report_submitted,
        proctorNo: task.proctor_no,
        users: undefined,
        projects: undefined
      }));
      
      // Sort: READY_FOR_REVIEW first, then by scheduledStartDate, then dueDate
      tasks.sort((a, b) => {
        if (a.status === 'READY_FOR_REVIEW' && b.status !== 'READY_FOR_REVIEW') return -1;
        if (a.status !== 'READY_FOR_REVIEW' && b.status === 'READY_FOR_REVIEW') return 1;
        if (a.scheduledStartDate && b.scheduledStartDate) {
          return a.scheduledStartDate.localeCompare(b.scheduledStartDate);
        }
        if (a.scheduledStartDate) return -1;
        if (b.scheduledStartDate) return 1;
        if (a.dueDate && b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        return 0;
      });
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE (
             (t.dueDate IS NOT NULL AND t.dueDate = ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
              AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
           )
           ORDER BY 
             CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
             t.scheduledStartDate ASC,
             t.dueDate ASC`,
          [today, today, today, today],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TODAY] Found ${tasks.length} tasks for ${today}`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching today tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// UPCOMING: Show tasks for the next 14 days based on Report Due Date and/or Field Date
// Window: tomorrow through today+14 days (inclusive)
router.get('/dashboard/upcoming', authenticate, requireAdmin, async (req, res) => {
  try {
    // Get dates in YYYY-MM-DD format (local date, no timezone)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Upcoming window: tomorrow through today+14 days (inclusive)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 14); // 14-day window
    const rangeEndStr = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, '0')}-${String(rangeEnd.getDate()).padStart(2, '0')}`;
    
    console.log(`[UPCOMING] Querying for tasks from ${tomorrowStr} to ${rangeEndStr} (14-day window)`);
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .neq('status', 'APPROVED');
      
      if (error) throw error;
      
      // Filter tasks based on date logic
      tasks = (data || []).filter(task => {
        const dueDate = task.due_date;
        const scheduledStart = task.scheduled_start_date;
        const scheduledEnd = task.scheduled_end_date;
        
        // Rule A: Report Due Date is within next 14 days (future only, starting tomorrow)
        if (dueDate && dueDate >= tomorrowStr && dueDate <= rangeEndStr) return true;
        
        // Rule B1: Single field date (scheduledStartDate only, no scheduledEndDate)
        if (scheduledStart && !scheduledEnd && scheduledStart >= tomorrowStr && scheduledStart <= rangeEndStr) return true;
        
        // Rule B2: Field date range - shows if range intersects upcoming window
        if (scheduledStart && scheduledEnd && scheduledEnd >= tomorrowStr && scheduledStart <= rangeEndStr) return true;
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        users: undefined,
        projects: undefined
      }));
      
      // Sort
      tasks.sort((a, b) => {
        if (a.status === 'READY_FOR_REVIEW' && b.status !== 'READY_FOR_REVIEW') return -1;
        if (a.status !== 'READY_FOR_REVIEW' && b.status === 'READY_FOR_REVIEW') return 1;
        const aDate = a.dueDate || a.scheduledStartDate || '9999-12-31';
        const bDate = b.dueDate || b.scheduledStartDate || '9999-12-31';
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return (a.scheduledEndDate || '').localeCompare(b.scheduledEndDate || '');
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE (
             (t.dueDate IS NOT NULL AND t.dueDate >= ? AND t.dueDate <= ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL 
              AND t.scheduledStartDate >= ? AND t.scheduledStartDate <= ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
              AND t.scheduledEndDate >= ? AND t.scheduledStartDate <= ?)
           )
           AND t.status != 'APPROVED'
           ORDER BY 
             CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
             COALESCE(t.dueDate, t.scheduledStartDate, '9999-12-31') ASC,
             t.scheduledEndDate ASC`,
          [tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[UPCOMING] Found ${tasks.length} tasks (14-day window: ${tomorrowStr} to ${rangeEndStr})`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching upcoming tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// OVERDUE/PENDING: Show tasks with dueDate < today AND status != Approved
router.get('/dashboard/overdue', authenticate, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .not('due_date', 'is', null)
        .neq('status', 'APPROVED')
        .lt('due_date', today);
      
      if (error) throw error;
      
      tasks = (data || []).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        users: undefined,
        projects: undefined
      }));
      
      tasks.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.dueDate IS NOT NULL 
           AND DATE(t.dueDate) < DATE(?) 
           AND t.status != 'APPROVED'
           ORDER BY t.dueDate ASC`,
          [today],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching overdue tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// TECHNICIAN DASHBOARD: Today view (filtered by assigned technician)
router.get('/dashboard/technician/today', authenticate, async (req, res) => {
  try {
    // Only technicians can access this endpoint
    if (req.user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get today's date in YYYY-MM-DD format (local date, no timezone)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    console.log(`[TECHNICIAN TODAY] Querying for tasks on: ${today} (technician: ${req.user.id})`);
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('assigned_technician_id', req.user.id);
      
      if (error) throw error;
      
      // Filter tasks based on date logic
      tasks = (data || []).filter(task => {
        const dueDate = task.due_date;
        const scheduledStart = task.scheduled_start_date;
        const scheduledEnd = task.scheduled_end_date;
        
        // Rule A: Report Due Date is today
        if (dueDate === today) return true;
        
        // Rule B1: Single date (scheduledStartDate only, no scheduledEndDate)
        if (scheduledStart === today && !scheduledEnd) return true;
        
        // Rule B2: Date range (scheduledStartDate + scheduledEndDate) - inclusive boundaries
        if (scheduledStart && scheduledEnd && scheduledStart <= today && scheduledEnd >= today) return true;
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        users: undefined,
        projects: undefined
      }));
      
      // Sort: READY_FOR_REVIEW first, then by scheduledStartDate, then dueDate
      tasks.sort((a, b) => {
        if (a.status === 'READY_FOR_REVIEW' && b.status !== 'READY_FOR_REVIEW') return -1;
        if (a.status !== 'READY_FOR_REVIEW' && b.status === 'READY_FOR_REVIEW') return 1;
        if (a.scheduledStartDate && b.scheduledStartDate) {
          return a.scheduledStartDate.localeCompare(b.scheduledStartDate);
        }
        if (a.scheduledStartDate) return -1;
        if (b.scheduledStartDate) return 1;
        if (a.dueDate && b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        return 0;
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.assignedTechnicianId = ?
           AND (
             (t.dueDate IS NOT NULL AND t.dueDate = ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
              AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
           )
           ORDER BY 
             CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
             t.scheduledStartDate ASC,
             t.dueDate ASC`,
          [req.user.id, today, today, today, today],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TECHNICIAN TODAY] Found ${tasks.length} tasks for ${today}`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching technician today tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// TECHNICIAN DASHBOARD: Upcoming view (next 14 days, filtered by assigned technician)
router.get('/dashboard/technician/upcoming', authenticate, async (req, res) => {
  try {
    // Only technicians can access this endpoint
    if (req.user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get dates in YYYY-MM-DD format (local date, no timezone)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Upcoming window: tomorrow through today+14 days (inclusive)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 14); // 14-day window
    const rangeEndStr = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, '0')}-${String(rangeEnd.getDate()).padStart(2, '0')}`;
    
    console.log(`[TECHNICIAN UPCOMING] Querying for tasks from ${tomorrowStr} to ${rangeEndStr} (technician: ${req.user.id})`);
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('assigned_technician_id', req.user.id)
        .neq('status', 'APPROVED');
      
      if (error) throw error;
      
      // Filter tasks based on date logic
      tasks = (data || []).filter(task => {
        const dueDate = task.due_date;
        const scheduledStart = task.scheduled_start_date;
        const scheduledEnd = task.scheduled_end_date;
        
        // Rule A: Report Due Date is within next 14 days (future only, starting tomorrow)
        if (dueDate && dueDate >= tomorrowStr && dueDate <= rangeEndStr) return true;
        
        // Rule B1: Single field date (scheduledStartDate only, no scheduledEndDate)
        if (scheduledStart && !scheduledEnd && scheduledStart >= tomorrowStr && scheduledStart <= rangeEndStr) return true;
        
        // Rule B2: Field date range - shows if range intersects upcoming window
        if (scheduledStart && scheduledEnd && scheduledEnd >= tomorrowStr && scheduledStart <= rangeEndStr) return true;
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        users: undefined,
        projects: undefined
      }));
      
      // Sort
      tasks.sort((a, b) => {
        if (a.status === 'READY_FOR_REVIEW' && b.status !== 'READY_FOR_REVIEW') return -1;
        if (a.status !== 'READY_FOR_REVIEW' && b.status === 'READY_FOR_REVIEW') return 1;
        const aDate = a.dueDate || a.scheduledStartDate || '9999-12-31';
        const bDate = b.dueDate || b.scheduledStartDate || '9999-12-31';
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return (a.scheduledEndDate || '').localeCompare(b.scheduledEndDate || '');
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.assignedTechnicianId = ?
           AND (
             (t.dueDate IS NOT NULL AND t.dueDate >= ? AND t.dueDate <= ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL 
              AND t.scheduledStartDate >= ? AND t.scheduledStartDate <= ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
              AND t.scheduledEndDate >= ? AND t.scheduledStartDate <= ?)
           )
           AND t.status != 'APPROVED'
           ORDER BY 
             CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
             COALESCE(t.dueDate, t.scheduledStartDate, '9999-12-31') ASC,
             t.scheduledEndDate ASC`,
          [req.user.id, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TECHNICIAN UPCOMING] Found ${tasks.length} tasks (14-day window: ${tomorrowStr} to ${rangeEndStr})`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching technician upcoming tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// TECHNICIAN DASHBOARD: Tomorrow view (filtered by assigned technician)
router.get('/dashboard/technician/tomorrow', authenticate, async (req, res) => {
  try {
    // Only technicians can access this endpoint
    if (req.user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get tomorrow's date in YYYY-MM-DD format (local date, no timezone)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    console.log(`[TECHNICIAN TOMORROW] Querying for tasks on: ${tomorrowStr} (technician: ${req.user.id})`);
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('assigned_technician_id', req.user.id);
      
      if (error) throw error;
      
      // Filter tasks based on date logic
      tasks = (data || []).filter(task => {
        const scheduledStart = task.scheduled_start_date;
        const scheduledEnd = task.scheduled_end_date;
        
        // Single field date: fieldDate == tomorrow
        if (scheduledStart === tomorrowStr && !scheduledEnd) return true;
        
        // Field date range: includes tomorrow (inclusive)
        if (scheduledStart && scheduledEnd && scheduledStart <= tomorrowStr && scheduledEnd >= tomorrowStr) return true;
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        users: undefined,
        projects: undefined
      }));
      
      // Sort by scheduledStartDate, then dueDate
      tasks.sort((a, b) => {
        if (a.scheduledStartDate && b.scheduledStartDate) {
          return a.scheduledStartDate.localeCompare(b.scheduledStartDate);
        }
        if (a.scheduledStartDate) return -1;
        if (b.scheduledStartDate) return 1;
        if (a.dueDate && b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        return 0;
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.assignedTechnicianId = ?
           AND (
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
             OR
             (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
              AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
           )
           ORDER BY 
             t.scheduledStartDate ASC,
             t.dueDate ASC`,
          [req.user.id, tomorrowStr, tomorrowStr, tomorrowStr],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TECHNICIAN TOMORROW] Found ${tasks.length} tasks for ${tomorrowStr}`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching technician tomorrow tasks:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// TECHNICIAN DASHBOARD: My Open Reports (fieldCompleted=true, report not submitted)
router.get('/dashboard/technician/open-reports', authenticate, async (req, res) => {
  try {
    // Only technicians can access this endpoint
    if (req.user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`[TECHNICIAN OPEN REPORTS] Querying for open reports (technician: ${req.user.id})`);
    
    let tasks;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('assigned_technician_id', req.user.id)
        .eq('field_completed', 1)
        .neq('status', 'APPROVED');
      
      if (error) throw error;
      
      // Filter for reports not submitted
      tasks = (data || []).filter(task => {
        const reportSubmitted = task.report_submitted;
        return reportSubmitted === 0 || reportSubmitted === null || reportSubmitted === false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        fieldCompleted: task.field_completed,
        reportSubmitted: task.report_submitted,
        fieldCompletedAt: task.field_completed_at,
        users: undefined,
        projects: undefined
      }));
      
      // Sort: dueDate nulls last, then by dueDate ASC, then fieldCompletedAt DESC
      tasks.sort((a, b) => {
        if (!a.dueDate && b.dueDate) return 1;
        if (a.dueDate && !b.dueDate) return -1;
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        const aCompleted = a.fieldCompletedAt || '';
        const bCompleted = b.fieldCompletedAt || '';
        return bCompleted.localeCompare(aCompleted);
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.assignedTechnicianId = ?
           AND t.fieldCompleted = 1
           AND (t.reportSubmitted = 0 OR t.reportSubmitted IS NULL)
           AND t.status != 'APPROVED'
           ORDER BY 
             CASE WHEN t.dueDate IS NULL THEN 1 ELSE 0 END,
             t.dueDate ASC,
             t.fieldCompletedAt DESC`,
          [req.user.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TECHNICIAN OPEN REPORTS] Found ${tasks.length} open reports`);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching technician open reports:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark field work as complete
router.post('/:id/mark-field-complete', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    // Check task exists and is assigned to this technician
    const task = await db.get('tasks', { id: taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Technicians can only mark their own tasks as complete
    const assignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mark field work as complete
    const updateData = {
      fieldCompleted: 1,
      fieldCompletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.update('tasks', updateData, { id: taskId });

    // Log history
    const actorName = req.user.name || req.user.email || 'User';
    await logTaskHistory(taskId, req.tenantId, req.user.role, actorName, req.user.id, 'STATUS_CHANGED', 'Field work marked as complete');

    // Return updated task
    let updatedTask;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      
      updatedTask = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectNumber: data.projects?.project_number || null,
        projectName: data.projects?.project_name || null,
        users: undefined,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      updatedTask = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Error marking field complete:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// TECHNICIAN DASHBOARD: Activity Log (task history for assigned tasks)
router.get('/dashboard/technician/activity', authenticate, async (req, res) => {
  try {
    // Only technicians can access this endpoint
    if (req.user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const activityDate = req.query.date || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    })();

    console.log(`[TECHNICIAN ACTIVITY] Querying for activity on ${activityDate} (technician: ${req.user.id})`);
    
    let activity;
    if (db.isSupabase()) {
      // Get tasks assigned to this technician
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_technician_id', req.user.id);
      
      if (tasksError) throw tasksError;
      
      const taskIds = (tasks || []).map(t => t.id);
      
      if (taskIds.length === 0) {
        return res.json([]);
      }
      
      // Get task history for those tasks on the specified date
      const { data, error } = await supabase
        .from('task_history')
        .select(`
          *,
          tasks:task_id(task_type, project_id, projects:project_id(project_number, project_name))
        `)
        .in('task_id', taskIds)
        .gte('timestamp', `${activityDate}T00:00:00`)
        .lt('timestamp', `${activityDate}T23:59:59`)
        .order('timestamp', { ascending: false });
      
      if (error) throw error;
      
      activity = (data || []).map(h => {
        const task = h.tasks;
        const project = task?.projects;
        return {
          ...h,
          taskId: h.task_id,
          actorUserId: h.actor_user_id,
          actionType: h.action_type,
          timestamp: h.timestamp,
          taskType: task?.task_type || null,
          projectId: task?.project_id || null,
          projectNumber: project?.project_number || null,
          projectName: project?.project_name || null,
          tasks: undefined
        };
      });
    } else {
      const sqliteDb = require('../database');
      activity = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT th.*, t.taskType, t.projectId, p.projectNumber, p.projectName
           FROM task_history th
           INNER JOIN tasks t ON th.taskId = t.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.assignedTechnicianId = ?
           AND DATE(th.timestamp) = DATE(?)
           ORDER BY th.timestamp DESC`,
          [req.user.id, activityDate],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    console.log(`[TECHNICIAN ACTIVITY] Found ${activity.length} activity entries for ${activityDate}`);
    res.json(activity || []);
  } catch (err) {
    console.error('Error fetching technician activity:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ACTIVITY LOG: Show tasks by last_edited_at or field_completed_at for a specific date (Admin only)
// Note: Uses task_history table for better activity tracking
router.get('/dashboard/activity', authenticate, requireAdmin, async (req, res) => {
  try {
    const activityDate = req.query.date || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    })();
    
    let tasks;
    if (db.isSupabase()) {
      // Fix: Query task_history instead of tasks for activity tracking
      // This is more accurate as it tracks all status changes
      const startOfDay = `${activityDate}T00:00:00`;
      const endOfDay = `${activityDate}T23:59:59`;
      
      // Get task history entries for the activity date
      const { data: historyEntries, error: historyError } = await supabase
        .from('task_history')
        .select(`
          *,
          tasks:task_id(
            *,
            users:assigned_technician_id(name, email),
            projects:project_id(project_number, project_name)
          )
        `)
        .gte('timestamp', startOfDay)
        .lt('timestamp', `${activityDate}T23:59:59.999`)
        .order('timestamp', { ascending: false });
      
      if (historyError) throw historyError;
      
      // Extract unique tasks from history entries
      const taskMap = new Map();
      (historyEntries || []).forEach(entry => {
        const task = entry.tasks;
        if (task && !taskMap.has(task.id)) {
          taskMap.set(task.id, {
            ...task,
            assignedTechnicianName: task.users?.name || null,
            assignedTechnicianEmail: task.users?.email || null,
            projectNumber: task.projects?.project_number || null,
            projectName: task.projects?.project_name || null,
            assignedTechnicianId: task.assigned_technician_id,
            projectId: task.project_id,
            taskType: task.task_type,
            dueDate: task.due_date,
            scheduledStartDate: task.scheduled_start_date,
            scheduledEndDate: task.scheduled_end_date,
            fieldCompleted: task.field_completed,
            reportSubmitted: task.report_submitted,
            fieldCompletedAt: task.field_completed_at,
            lastEditedAt: task.last_edited_at,
            users: undefined,
            projects: undefined
          });
        }
      });
      
      tasks = Array.from(taskMap.values());
      
      // Also include tasks with field_completed_at on this date
      const { data: fieldCompletedTasks, error: fieldError } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `)
        .not('field_completed_at', 'is', null)
        .gte('field_completed_at', startOfDay)
        .lt('field_completed_at', `${activityDate}T23:59:59.999`);
      
      if (!fieldError && fieldCompletedTasks) {
        fieldCompletedTasks.forEach(task => {
          if (!taskMap.has(task.id)) {
            taskMap.set(task.id, {
              ...task,
              assignedTechnicianName: task.users?.name || null,
              assignedTechnicianEmail: task.users?.email || null,
              projectNumber: task.projects?.project_number || null,
              projectName: task.projects?.project_name || null,
              assignedTechnicianId: task.assigned_technician_id,
              projectId: task.project_id,
              taskType: task.task_type,
              dueDate: task.due_date,
              scheduledStartDate: task.scheduled_start_date,
              scheduledEndDate: task.scheduled_end_date,
              fieldCompleted: task.field_completed,
              reportSubmitted: task.report_submitted,
              fieldCompletedAt: task.field_completed_at,
              lastEditedAt: task.last_edited_at,
              users: undefined,
              projects: undefined
            });
          }
        });
      }
      
      tasks = Array.from(taskMap.values());
      
      // Sort by last_edited_at or field_completed_at DESC
      tasks.sort((a, b) => {
        const aDate = a.lastEditedAt || a.fieldCompletedAt || '';
        const bDate = b.lastEditedAt || b.fieldCompletedAt || '';
        return bDate.localeCompare(aDate);
      });
    } else {
      // SQLite fallback - use task_history
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT DISTINCT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id IN (
             SELECT DISTINCT taskId FROM task_history
             WHERE DATE(timestamp) = DATE(?)
           )
           OR (
             t.fieldCompletedAt IS NOT NULL AND DATE(t.fieldCompletedAt) = DATE(?)
           )
           ORDER BY COALESCE(t.lastEditedAt, t.fieldCompletedAt) DESC`,
          [activityDate, activityDate],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Legacy endpoint - kept for backward compatibility but uses task_history
// ACTIVITY LOG: Show tasks by completedAt or submittedAt for a specific date (Admin only)
// DEPRECATED: Use task_history for better activity tracking
router.get('/dashboard/activity-old', authenticate, requireAdmin, async (req, res) => {
  try {
    const activityDate = req.query.date || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    })();
    
    let tasks;
    if (db.isSupabase()) {
      // Fetch all tasks and filter by last_edited_at or field_completed_at
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          users:assigned_technician_id(name, email),
          projects:project_id(project_number, project_name)
        `);
      
      if (error) throw error;
      
      // Filter tasks where last_edited_at or field_completed_at is on the activity date
      tasks = (data || []).filter(task => {
        const lastEditedAt = task.last_edited_at;
        const fieldCompletedAt = task.field_completed_at;
        const dateStr = activityDate;
        
        if (lastEditedAt) {
          const editedDate = lastEditedAt.split('T')[0];
          if (editedDate === dateStr) return true;
        }
        
        if (fieldCompletedAt) {
          const completedDate = fieldCompletedAt.split('T')[0];
          if (completedDate === dateStr) return true;
        }
        
        return false;
      }).map(task => ({
        ...task,
        assignedTechnicianName: task.users?.name || null,
        assignedTechnicianEmail: task.users?.email || null,
        projectNumber: task.projects?.project_number || null,
        projectName: task.projects?.project_name || null,
        assignedTechnicianId: task.assigned_technician_id,
        projectId: task.project_id,
        taskType: task.task_type,
        dueDate: task.due_date,
        scheduledStartDate: task.scheduled_start_date,
        scheduledEndDate: task.scheduled_end_date,
        // Note: completedAt and submittedAt columns don't exist in schema
        // Using lastEditedAt and fieldCompletedAt instead
        lastEditedAt: task.last_edited_at,
        fieldCompletedAt: task.field_completed_at,
        users: undefined,
        projects: undefined
      }));
      
      // Sort by lastEditedAt or fieldCompletedAt DESC
      tasks.sort((a, b) => {
        const aDate = a.lastEditedAt || a.fieldCompletedAt || '';
        const bDate = b.lastEditedAt || b.fieldCompletedAt || '';
        return bDate.localeCompare(aDate);
      });
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE (
             (t.lastEditedAt IS NOT NULL AND DATE(t.lastEditedAt) = DATE(?))
             OR
             (t.fieldCompletedAt IS NOT NULL AND DATE(t.fieldCompletedAt) = DATE(?))
           )
           ORDER BY 
             COALESCE(t.lastEditedAt, t.fieldCompletedAt) DESC`,
          [activityDate, activityDate],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }
    
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get task history (audit trail)
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);

    // Check task access
    const task = await db.get('tasks', { id: taskId });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check access: Technicians can only see their assigned tasks
    const assignedId = db.isSupabase() ? task.assigned_technician_id : task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get history entries
    let history;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .eq('task_id', taskId)
        .order('timestamp', { ascending: false });
      
      if (error) throw error;
      
      history = (data || []).map(h => ({
        ...h,
        taskId: h.task_id,
        actorUserId: h.actor_user_id,
        actionType: h.action_type,
        timestamp: h.timestamp
      }));
    } else {
      const sqliteDb = require('../database');
      history = await new Promise((resolve, reject) => {
        sqliteDb.all(
          `SELECT * FROM task_history 
           WHERE taskId = ? 
           ORDER BY timestamp DESC`,
          [taskId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }

    res.json(history || []);
  } catch (err) {
    console.error('Error fetching task history:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Attach logTaskHistory to router so it can be imported by other route files
router.logTaskHistory = logTaskHistory;
module.exports = router;

