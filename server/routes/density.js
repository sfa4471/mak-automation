const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get density report by taskId
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
          projects:project_id(project_name, project_number, concrete_specs)
        `)
        .eq('id', taskId)
        .eq('task_type', 'DENSITY_MEASUREMENT')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        concreteSpecs: data.projects?.concrete_specs,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber, p.concreteSpecs
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
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

    // Parse project concreteSpecs for structure dropdown
    let projectConcreteSpecs = {};
    if (task.concreteSpecs) {
      if (typeof task.concreteSpecs === 'string') {
        try {
          projectConcreteSpecs = JSON.parse(task.concreteSpecs);
        } catch (e) {
          projectConcreteSpecs = {};
        }
      } else {
        projectConcreteSpecs = task.concreteSpecs;
      }
    }

    const data = await db.get('density_reports', { taskId });

    if (data) {
      // Debug: Log what's being returned
      console.log('Density report GET - Header fields from DB:', {
        clientName: data.clientName,
        datePerformed: data.datePerformed,
        structure: data.structure,
        structureType: data.structureType
      });
      
      // Parse JSON fields
      if (typeof data.testRows === 'string') {
        try {
          data.testRows = JSON.parse(data.testRows || '[]');
        } catch (e) {
          data.testRows = [];
        }
      } else {
        data.testRows = data.testRows || [];
      }
      
      if (typeof data.proctors === 'string') {
        try {
          data.proctors = JSON.parse(data.proctors || '[]');
        } catch (e) {
          data.proctors = [];
        }
      } else {
        data.proctors = data.proctors || [];
      }
      
      // Add project info and concreteSpecs
      data.projectName = task.projectName;
      data.projectNumber = task.projectNumber;
      data.projectConcreteSpecs = projectConcreteSpecs;
      
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
      
      res.json({
        taskId: parseInt(taskId),
        projectName: task.projectName,
        projectNumber: task.projectNumber,
        projectConcreteSpecs: projectConcreteSpecs,
        clientName: '',
        datePerformed: new Date().toISOString().split('T')[0],
        structure: '',
        structureType: '',
        testRows: Array(19).fill(null).map((_, i) => ({
          testNo: i + 1,
          testLocation: '',
          depthLiftType: 'DEPTH',
          depthLiftValue: '',
          wetDensity: '',
          fieldMoisture: '',
          dryDensity: '',
          proctorNo: '',
          percentProctorDensity: ''
        })),
        proctors: Array(6).fill(null).map((_, i) => ({
          proctorNo: i + 1,
          description: '',
          optMoisture: '',
          maxDensity: ''
        })),
        densSpecPercent: '',
        moistSpecMin: '',
        moistSpecMax: '',
        gaugeNo: '',
        stdDensityCount: '',
        stdMoistCount: '',
        transDepthIn: '',
        methodD2922: 1,
        methodD3017: 1,
        methodD698: 1,
        remarks: '',
        technicianId: defaultTechId,
        techName: defaultTechName,
        timeStr: '',
        specDensityPct: '',
        proctorTaskId: null,
        proctorOptMoisture: '',
        proctorMaxDensity: '',
        proctorSoilClassification: '',
        proctorSoilClassificationText: '',
        proctorDescriptionLabel: ''
      });
    }
  } catch (err) {
    console.error('Error fetching density report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save density report by taskId
router.post('/task/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    
    // Debug: Log received header fields
    console.log('Density save request - Header fields:', {
      clientName: req.body.clientName,
      datePerformed: req.body.datePerformed,
      structure: req.body.structure,
      structureType: req.body.structureType
    });
    
    const {
      clientName,
      datePerformed,
      structure,
      structureType,
      testRows,
      proctors,
      densSpecPercent,
      moistSpecMin,
      moistSpecMax,
      gaugeNo,
      stdDensityCount,
      stdMoistCount,
      transDepthIn,
      methodD2922,
      methodD3017,
      methodD698,
      remarks,
      techName,
      technicianId,
      timeStr,
      updateStatus,
      assignedTechnicianId,
      specDensityPct,
      proctorTaskId,
      proctorOptMoisture,
      proctorMaxDensity,
      proctorSoilClassification,
      proctorSoilClassificationText,
      proctorDescriptionLabel
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
        .eq('task_type', 'DENSITY_MEASUREMENT')
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
           WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
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

    // Check if record exists
    const existing = await db.get('density_reports', { taskId });

    // Prepare data for insertion/update
    // For Supabase, JSONB fields accept arrays directly; for SQLite, we stringify
    const densityData = {
      taskId,
      clientName: clientName || null,
      datePerformed: datePerformed || null,
      structure: structure || null,
      structureType: structureType || null,
      testRows: testRows || [],
      proctors: proctors || [],
      densSpecPercent: densSpecPercent || null,
      moistSpecMin: moistSpecMin || null,
      moistSpecMax: moistSpecMax || null,
      gaugeNo: gaugeNo || null,
      stdDensityCount: stdDensityCount || null,
      stdMoistCount: stdMoistCount || null,
      transDepthIn: transDepthIn || null,
      methodD2922: methodD2922 ? 1 : 0,
      methodD3017: methodD3017 ? 1 : 0,
      methodD698: methodD698 ? 1 : 0,
      remarks: remarks || null,
      techName: techName || null,
      technicianId: technicianId || null,
      timeStr: timeStr || null,
      specDensityPct: specDensityPct || null,
      proctorTaskId: proctorTaskId || null,
      proctorOptMoisture: proctorOptMoisture || null,
      proctorMaxDensity: proctorMaxDensity || null,
      proctorSoilClassification: proctorSoilClassification || null,
      proctorSoilClassificationText: proctorSoilClassificationText || null,
      proctorDescriptionLabel: proctorDescriptionLabel || null,
      lastEditedByRole: req.user.role,
      lastEditedByUserId: req.user.id,
      updatedAt: new Date().toISOString()
    };

    let result;
    if (existing) {
      // Update
      await db.update('density_reports', densityData, { taskId });
      
      // Debug: Log what was saved
      console.log('Density report updated - Header fields saved:', {
        clientName: clientName || null,
        datePerformed: datePerformed || null,
        structure: structure || null,
        structureType: structureType || null
      });
    } else {
      // Insert
      result = await db.insert('density_reports', densityData);
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
    }

    // Update task assignment if technician changed (admin only)
    if (req.user.role === 'ADMIN' && assignedTechnicianId && assignedTechnicianId !== task.assignedTechnicianId) {
      await db.update('tasks', {
        assignedTechnicianId: assignedTechnicianId,
        updatedAt: new Date().toISOString()
      }, { id: taskId });
    }

    // Return updated/created data
    if (!result) {
      result = await db.get('density_reports', { taskId });
    }
    
    // Get project concreteSpecs
    let projectConcreteSpecs = {};
    if (db.isSupabase()) {
      const taskData = await db.get('tasks', { id: taskId });
      if (taskData) {
        const project = await db.get('projects', { id: taskData.projectId });
        if (project && project.concreteSpecs) {
          if (typeof project.concreteSpecs === 'string') {
            try {
              projectConcreteSpecs = JSON.parse(project.concreteSpecs);
            } catch (e) {
              projectConcreteSpecs = {};
            }
          } else {
            projectConcreteSpecs = project.concreteSpecs;
          }
        }
      }
    } else {
      const sqliteDb = require('../database');
      const projectData = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT p.concreteSpecs
           FROM projects p
           INNER JOIN tasks t ON p.id = t.projectId
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
      
      if (projectData && projectData.concreteSpecs) {
        try {
          projectConcreteSpecs = JSON.parse(projectData.concreteSpecs);
        } catch (e) {
          projectConcreteSpecs = {};
        }
      }
    }

    // Parse JSON fields
    if (typeof result.testRows === 'string') {
      try {
        result.testRows = JSON.parse(result.testRows || '[]');
      } catch (e) {
        result.testRows = [];
      }
    } else {
      result.testRows = result.testRows || [];
    }
    
    if (typeof result.proctors === 'string') {
      try {
        result.proctors = JSON.parse(result.proctors || '[]');
      } catch (e) {
        result.proctors = [];
      }
    } else {
      result.proctors = result.proctors || [];
    }
    
    result.projectConcreteSpecs = projectConcreteSpecs;
    result.projectName = task.projectName;
    result.projectNumber = task.projectNumber;
    
    res.json(result);
  } catch (err) {
    console.error('Error saving density report:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

