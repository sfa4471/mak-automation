const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { createNotification } = require('./notifications');

const router = express.Router();

// Helper function to log task history
function logTaskHistory(taskId, actorRole, actorName, actorUserId, actionType, note) {
  db.run(
    `INSERT INTO task_history (taskId, actorRole, actorName, actorUserId, actionType, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, actorRole, actorName, actorUserId || null, actionType, note || null],
    (err) => {
      if (err) {
        console.error('Error logging task history:', err);
      }
    }
  );
}

// Get all tasks (filtered by role)
router.get('/', authenticate, (req, res) => {
  let query;
  let params;

  if (req.user.role === 'ADMIN') {
    query = `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
             p.projectNumber, p.projectName
             FROM tasks t
             LEFT JOIN users u ON t.assignedTechnicianId = u.id
             INNER JOIN projects p ON t.projectId = p.id
             ORDER BY t.createdAt DESC`;
    params = [];
  } else {
    query = `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
             p.projectNumber, p.projectName
             FROM tasks t
             LEFT JOIN users u ON t.assignedTechnicianId = u.id
             INNER JOIN projects p ON t.projectId = p.id
             WHERE t.assignedTechnicianId = ?
             ORDER BY t.createdAt DESC`;
    params = [req.user.id];
  }

  db.all(query, params, (err, tasks) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(tasks);
  });
});

// Get tasks for a project
router.get('/project/:projectId', authenticate, (req, res) => {
  const projectId = req.params.projectId;

  // Check project access
  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

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

    db.all(query, params, (err, tasks) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(tasks);
    });
  });
});

// Get single task
router.get('/:id', authenticate, (req, res) => {
  const taskId = req.params.id;

  db.get(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectName, p.projectNumber
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ?`,
    [taskId],
    (err, task) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(task);
    }
  );
});

// Update task (Admin only for assignment/scheduling, or Technician for their own tasks)
router.put('/:id', authenticate, [
  body('assignedTechnicianId').optional().isInt(),
  body('dueDate').optional(),
  body('scheduledStartDate').optional(),
  body('scheduledEndDate').optional(),
  body('locationName').optional(),
  body('locationNotes').optional(),
  body('engagementNotes').optional()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const taskId = req.params.id;
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
  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only admins can assign/reassign technicians
    if (req.user.role === 'TECHNICIAN') {
      if (task.assignedTechnicianId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Technicians can only update their own tasks, but not assignment
      if (assignedTechnicianId !== undefined && assignedTechnicianId !== task.assignedTechnicianId) {
        return res.status(403).json({ error: 'Technicians cannot change task assignment' });
      }
    }

    // Verify technician exists if provided
    if (assignedTechnicianId) {
      db.get('SELECT id FROM users WHERE id = ? AND role = ?', [assignedTechnicianId, 'TECHNICIAN'], (err, tech) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!tech) {
          return res.status(404).json({ error: 'Technician not found' });
        }
        updateTask();
      });
    } else {
      updateTask();
    }

    function updateTask() {
      const updates = [];
      const values = [];

      if (assignedTechnicianId !== undefined) {
        updates.push('assignedTechnicianId = ?');
        values.push(assignedTechnicianId || null);
        // Set status to ASSIGNED if assigning
        if (assignedTechnicianId && !task.assignedTechnicianId) {
          updates.push('status = ?');
          values.push('ASSIGNED');
        }
      }
      if (dueDate !== undefined) {
        updates.push('dueDate = ?');
        values.push(dueDate || null);
      }
      if (scheduledStartDate !== undefined) {
        updates.push('scheduledStartDate = ?');
        values.push(scheduledStartDate || null);
      }
      if (scheduledEndDate !== undefined) {
        updates.push('scheduledEndDate = ?');
        values.push(scheduledEndDate || null);
      }
      if (locationName !== undefined) {
        updates.push('locationName = ?');
        values.push(locationName || null);
      }
      if (locationNotes !== undefined) {
        updates.push('locationNotes = ?');
        values.push(locationNotes || null);
      }
      if (engagementNotes !== undefined) {
        updates.push('engagementNotes = ?');
        values.push(engagementNotes || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updatedAt = CURRENT_TIMESTAMP');
      values.push(taskId);

      db.run(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            console.error('Error updating task:', err);
            return res.status(500).json({ error: 'Database error: ' + err.message });
          }

          // Create notification and log history if technician was assigned/reassigned
          if (assignedTechnicianId && assignedTechnicianId !== task.assignedTechnicianId) {
            const taskTypeLabels = {
              'COMPRESSIVE_STRENGTH': 'Compressive Strength',
              'DENSITY_MEASUREMENT': 'Density Measurement',
              'PROCTOR': 'Proctor',
              'REBAR': 'Rebar',
              'CYLINDER_PICKUP': 'Cylinder Pickup',
            };
            const taskLabel = taskTypeLabels[task.taskType] || task.taskType;
            
            // Get old and new technician names for history
            db.all('SELECT id, name, email FROM users WHERE id IN (?, ?)', [task.assignedTechnicianId || 0, assignedTechnicianId], (err, techs) => {
              const oldTech = techs?.find(t => t.id === task.assignedTechnicianId);
              const newTech = techs?.find(t => t.id === assignedTechnicianId);
              const oldTechName = oldTech ? (oldTech.name || oldTech.email) : 'Unassigned';
              const newTechName = newTech ? (newTech.name || newTech.email) : 'Unassigned';
              
              // Log history: Task reassigned
              const adminName = req.user.name || req.user.email || 'Admin';
              logTaskHistory(taskId, req.user.role, adminName, req.user.id, 'REASSIGNED', `Task reassigned from ${oldTechName} to ${newTechName}`);
              
              db.get('SELECT projectNumber FROM projects WHERE id = ?', [task.projectId], (err, project) => {
                if (!err && project) {
                  const message = `Admin ${task.assignedTechnicianId ? 'reassigned' : 'assigned'} ${taskLabel} for Project ${project.projectNumber}`;
                  createNotification(assignedTechnicianId, message, 'info', taskId, task.projectId).catch(console.error);
                }
              });
            });
          }

          // Return updated task
          db.get(
            `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
             p.projectNumber, p.projectName
             FROM tasks t
             LEFT JOIN users u ON t.assignedTechnicianId = u.id
             INNER JOIN projects p ON t.projectId = p.id
             WHERE t.id = ?`,
            [taskId],
            (err, updatedTask) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              res.json(updatedTask);
            }
          );
        }
      );
    }
  });
});

// Create task (Admin only)
router.post('/', authenticate, requireAdmin, [
  body('projectId').isInt(),
  body('taskType').isIn(['DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP']),
  body('assignedTechnicianId').optional().isInt(),
  body('dueDate').optional(),
  body('scheduledStartDate').optional(),
  body('scheduledEndDate').optional(),
  body('locationName').optional(),
  body('locationNotes').optional(),
  body('engagementNotes').optional()
], (req, res) => {
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

  // Verify project exists
  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify technician exists if provided
    if (assignedTechnicianId) {
      db.get('SELECT id FROM users WHERE id = ? AND role = ?', [assignedTechnicianId, 'TECHNICIAN'], (err, tech) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!tech) {
          return res.status(404).json({ error: 'Technician not found' });
        }

        createTask();
      });
    } else {
      createTask();
    }

    function createTask() {
      // Ensure dates are stored as YYYY-MM-DD strings (no timezone conversion)
      // Trim any whitespace and validate format
      const normalizeDate = (dateStr) => {
        if (!dateStr) return null;
        const trimmed = dateStr.trim();
        // Validate YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          return trimmed;
        }
        return null;
      };

      const normalizedDueDate = normalizeDate(dueDate);
      const normalizedScheduledStartDate = normalizeDate(scheduledStartDate);
      const normalizedScheduledEndDate = normalizeDate(scheduledEndDate);

      console.log('Storing dates in database:', {
        dueDate: normalizedDueDate,
        scheduledStartDate: normalizedScheduledStartDate,
        scheduledEndDate: normalizedScheduledEndDate
      });

      db.run(
        `INSERT INTO tasks (projectId, taskType, status, assignedTechnicianId, dueDate, locationName, locationNotes, engagementNotes, scheduledStartDate, scheduledEndDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          taskType,
          assignedTechnicianId ? 'ASSIGNED' : 'ASSIGNED',
          assignedTechnicianId || null,
          normalizedDueDate,
          locationName || null,
          locationNotes || null,
          engagementNotes || null,
          normalizedScheduledStartDate,
          normalizedScheduledEndDate
        ],
        function(err) {
          if (err) {
            console.error('Error creating task:', err);
            console.error('SQL Error details:', err.message);
            console.error('Columns in INSERT:', ['projectId', 'taskType', 'status', 'assignedTechnicianId', 'dueDate', 'locationName', 'locationNotes', 'engagementNotes', 'scheduledStartDate', 'scheduledEndDate']);
            console.error('Values provided:', [projectId, taskType, assignedTechnicianId ? 'ASSIGNED' : 'ASSIGNED', assignedTechnicianId || null, dueDate || null, locationName || null, locationNotes || null, engagementNotes || null, scheduledStartDate || null, scheduledEndDate || null]);
            return res.status(500).json({ error: 'Database error: ' + err.message });
          }

          const taskId = this.lastID;

          // If this is a COMPRESSIVE_STRENGTH, create wp1_data entry
          if (taskType === 'COMPRESSIVE_STRENGTH') {
            // Create empty wp1_data entry linked to this task
            db.run(
              'INSERT INTO wp1_data (taskId, workPackageId, cylinders) VALUES (?, ?, ?)',
              [taskId, null, '[]'],
              (err) => {
                if (err) {
                  console.error('Error creating wp1_data:', err);
                  // Continue anyway, wp1_data can be created later
                }
              }
            );
          }

          // If this is a DENSITY_MEASUREMENT, create density_reports entry
          if (taskType === 'DENSITY_MEASUREMENT') {
            // Create empty density_reports entry (structure will be created on first load)
            // No need to pre-create, the API returns empty structure if not found
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
            createNotification(assignedTechnicianId, message, 'info', taskId, projectId).catch(console.error);
          }

          // Return created task
          db.get(
            `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
             p.projectNumber, p.projectName
             FROM tasks t
             LEFT JOIN users u ON t.assignedTechnicianId = u.id
             INNER JOIN projects p ON t.projectId = p.id
             WHERE t.id = ?`,
            [taskId],
            (err, task) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              
              // Ensure dates are returned as YYYY-MM-DD strings (no timezone conversion)
              // SQLite returns dates as strings, but we want to ensure they're in the correct format
              if (task) {
                // Dates should already be in YYYY-MM-DD format from SQLite
                // Just ensure they're strings and not null
                task.dueDate = task.dueDate || null;
                task.scheduledStartDate = task.scheduledStartDate || null;
                task.scheduledEndDate = task.scheduledEndDate || null;
              }
              
              res.status(201).json(task);
            }
          );
        }
      );
    }
  });
});

// Update task (Admin only - allows editing all task fields)
router.put('/:id', authenticate, requireAdmin, [
  body('assignedTechnicianId').optional().isInt().withMessage('assignedTechnicianId must be an integer'),
  body('dueDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('dueDate must be in YYYY-MM-DD format'),
  body('scheduledStartDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('scheduledStartDate must be in YYYY-MM-DD format'),
  body('scheduledEndDate').optional().matches(/^\d{4}-\d{2}-\d{2}$|^$/).withMessage('scheduledEndDate must be in YYYY-MM-DD format'),
  body('locationName').optional().trim(),
  body('locationNotes').optional().trim(),
  body('engagementNotes').optional().trim(),
  body('taskType').optional().isIn(['DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const taskId = req.params.id;
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
  db.get(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ?`,
    [taskId],
    (err, oldTask) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!oldTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Build update query dynamically based on provided fields
      const updates = [];
      const values = [];
      const changes = [];

      // Track assignment change (will be processed after getting new tech name)
      let assignmentChange = null;
      if (assignedTechnicianId !== undefined && assignedTechnicianId !== oldTask.assignedTechnicianId) {
        updates.push('assignedTechnicianId = ?');
        values.push(assignedTechnicianId || null);
        
        const oldTechName = oldTask.assignedTechnicianName || oldTask.assignedTechnicianEmail || 'Unassigned';
        if (assignedTechnicianId) {
          // Get new tech name before logging
          assignmentChange = { oldTechName, newTechId: assignedTechnicianId };
        } else {
          changes.push(`unassigned (was: ${oldTechName})`);
        }
      }

      // Track due date change
      if (dueDate !== undefined && dueDate !== oldTask.dueDate) {
        updates.push('dueDate = ?');
        values.push(dueDate ? dueDate : null);
        const oldDue = oldTask.dueDate || 'None';
        const newDue = dueDate || 'None';
        changes.push(`due date changed from ${oldDue} to ${newDue}`);
      }

      // Track scheduled dates changes
      if (scheduledStartDate !== undefined && scheduledStartDate !== oldTask.scheduledStartDate) {
        updates.push('scheduledStartDate = ?');
        values.push(scheduledStartDate ? scheduledStartDate : null);
        const oldStart = oldTask.scheduledStartDate || 'None';
        const newStart = scheduledStartDate || 'None';
        changes.push(`field start date changed from ${oldStart} to ${newStart}`);
      }

      if (scheduledEndDate !== undefined && scheduledEndDate !== oldTask.scheduledEndDate) {
        updates.push('scheduledEndDate = ?');
        values.push(scheduledEndDate ? scheduledEndDate : null);
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
        updates.push('locationName = ?');
        values.push(locationName || null);
        changes.push(`location name updated`);
      }

      if (locationNotes !== undefined && locationNotes !== oldTask.locationNotes) {
        updates.push('locationNotes = ?');
        values.push(locationNotes || null);
        changes.push(`location notes updated`);
      }

      if (engagementNotes !== undefined && engagementNotes !== oldTask.engagementNotes) {
        updates.push('engagementNotes = ?');
        values.push(engagementNotes || null);
        changes.push(`engagement notes updated`);
      }

      if (taskType !== undefined && taskType !== oldTask.taskType) {
        updates.push('taskType = ?');
        values.push(taskType);
        changes.push(`task type changed from ${oldTask.taskType} to ${taskType}`);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Always update updatedAt
      updates.push('updatedAt = CURRENT_TIMESTAMP');
      values.push(taskId);

      // Get new tech name if assignment changed (async operation)
      const processUpdate = (assignmentNote) => {
        if (assignmentNote) {
          changes.push(assignmentNote);
        }

        // Perform update
        db.run(
          `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
          values,
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            // Get admin name for logging
            const adminName = req.user.name || req.user.email || 'Admin';

            // Log activity for each change
            if (changes.length > 0) {
              const changeNote = changes.join('; ');
              logTaskHistory(taskId, req.user.role, adminName, req.user.id, 'STATUS_CHANGED', changeNote);
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
              const taskLabel = taskTypeLabels[oldTask.taskType] || oldTask.taskType;
              const message = `Admin assigned ${taskLabel} for Project ${oldTask.projectNumber}`;
              createNotification(assignmentChange.newTechId, message, 'info', taskId, oldTask.projectId).catch(console.error);
            }

            // Return updated task
            db.get(
              `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
               p.projectNumber, p.projectName
               FROM tasks t
               LEFT JOIN users u ON t.assignedTechnicianId = u.id
               INNER JOIN projects p ON t.projectId = p.id
               WHERE t.id = ?`,
              [taskId],
              (err, updatedTask) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                res.json(updatedTask);
              }
            );
          }
        );
      };

      // If assignment changed, get new tech name first
      if (assignmentChange) {
        db.get('SELECT name, email FROM users WHERE id = ?', [assignmentChange.newTechId], (err, newTech) => {
          if (!err && newTech) {
            const newTechName = newTech.name || newTech.email;
            processUpdate(`reassigned from ${assignmentChange.oldTechName} to ${newTechName}`);
          } else {
            processUpdate(`reassigned to technician ID ${assignmentChange.newTechId}`);
          }
        });
      } else {
        processUpdate(null);
      }
    }
  );
});

// Update task status
router.put('/:id/status', authenticate, [
  body('status').isIn(['ASSIGNED', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED_NEEDS_FIX'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const taskId = req.params.id;
  const { status } = req.body;

  // Check access and get task
  db.get(
    `SELECT t.*, p.projectNumber, p.projectName 
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ?`,
    [taskId],
    (err, task) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Technicians can only set IN_PROGRESS_TECH or READY_FOR_REVIEW
      if (req.user.role === 'TECHNICIAN') {
        if (task.assignedTechnicianId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (status !== 'IN_PROGRESS_TECH' && status !== 'READY_FOR_REVIEW') {
          return res.status(403).json({ error: 'Technicians can only set status to IN_PROGRESS_TECH or READY_FOR_REVIEW' });
        }
      }

      // Mark report as submitted when status becomes READY_FOR_REVIEW
      const setSubmittedAt = status === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN' 
        ? ', submittedAt = CURRENT_TIMESTAMP, reportSubmitted = 1' 
        : status === 'READY_FOR_REVIEW'
        ? ', reportSubmitted = 1'
        : '';

      db.run(
        `UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP, lastEditedByUserId = ?, lastEditedByRole = ?, lastEditedAt = CURRENT_TIMESTAMP${setSubmittedAt} WHERE id = ?`,
        [status, req.user.id, req.user.role, taskId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          // Log history and create notification when technician sends update to admin
          if (status === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN') {
            db.get('SELECT name, email FROM users WHERE id = ?', [req.user.id], (err, technician) => {
              if (err) {
                console.error('Error fetching technician name:', err);
                return;
              }
              
              const technicianName = technician?.name || technician?.email || 'Technician';
              
              // Log history: Technician submitted report
              logTaskHistory(taskId, req.user.role, technicianName, req.user.id, 'SUBMITTED', null);
              
              const taskTypeLabels = {
                'COMPRESSIVE_STRENGTH': 'Compressive Strength',
                'DENSITY_MEASUREMENT': 'Density Measurement',
                'PROCTOR': 'Proctor',
                'REBAR': 'Rebar',
                'CYLINDER_PICKUP': 'Cylinder Pickup',
              };
              const taskLabel = taskTypeLabels[task.taskType] || task.taskType;
              
              // Get all admins
              db.all('SELECT id FROM users WHERE role = ?', ['ADMIN'], (err, admins) => {
                if (!err && admins) {
                  const message = `${technicianName} completed ${taskLabel} for Project ${task.projectNumber}`;
                  admins.forEach(admin => {
                    createNotification(admin.id, message, 'info', taskId, task.projectId).catch(console.error);
                  });
                }
              });
            });
          }

          db.get(
            `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
             p.projectNumber, p.projectName
             FROM tasks t
             LEFT JOIN users u ON t.assignedTechnicianId = u.id
             INNER JOIN projects p ON t.projectId = p.id
             WHERE t.id = ?`,
            [taskId],
            (err, task) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              res.json(task);
            }
          );
        }
      );
    }
  );
});

// Approve task (Admin only)
router.post('/:id/approve', authenticate, requireAdmin, (req, res) => {
  const taskId = req.params.id;

  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const adminName = req.user.name || req.user.email || 'Admin';
    
    db.run(
      'UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP, completedAt = CURRENT_TIMESTAMP, lastEditedByUserId = ?, lastEditedByRole = ?, lastEditedAt = CURRENT_TIMESTAMP WHERE id = ?',
      ['APPROVED', req.user.id, req.user.role, taskId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Log history: Admin approved
        logTaskHistory(taskId, req.user.role, adminName, req.user.id, 'APPROVED', null);

        db.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, task) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(task);
          }
        );
      }
    );
  });
});

// Reject task (Admin only)
router.post('/:id/reject', authenticate, requireAdmin, [
  body('rejectionRemarks').notEmpty().trim(),
  body('resubmissionDueDate').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const taskId = req.params.id;
  const { rejectionRemarks, resubmissionDueDate } = req.body;

  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const adminName = req.user.name || req.user.email || 'Admin';
    
    db.run(
      `UPDATE tasks SET status = ?, rejectionRemarks = ?, resubmissionDueDate = ?, 
       updatedAt = CURRENT_TIMESTAMP, lastEditedByUserId = ?, lastEditedByRole = ?, lastEditedAt = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      ['REJECTED_NEEDS_FIX', rejectionRemarks, resubmissionDueDate, req.user.id, req.user.role, taskId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Log history: Admin rejected
        logTaskHistory(taskId, req.user.role, adminName, req.user.id, 'REJECTED', rejectionRemarks);

        // Create notification for technician
        if (task.assignedTechnicianId) {
          const message = `Your task for Project ${task.projectNumber} has been rejected. Please review the remarks and resubmit.`;
          createNotification(task.assignedTechnicianId, message, 'warning', taskId, task.projectId).catch(console.error);
        }

        db.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, task) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(task);
          }
        );
      }
    );
  });
});

// Dashboard endpoints
// TODAY: Show tasks based on field schedule dates (scheduledStartDate/scheduledEndDate)
// If no field schedule, fall back to report due date
router.get('/dashboard/today', authenticate, requireAdmin, (req, res) => {
  // Get today's date in YYYY-MM-DD format (local date, no timezone)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  console.log(`[TODAY] Querying for tasks on: ${today}`);
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE (
       -- Rule A: Report Due Date is today (date-only comparison)
       (t.dueDate IS NOT NULL AND t.dueDate = ?)
       OR
       -- Rule B: Field Date includes today
       -- B1: Single date (scheduledStartDate only, no scheduledEndDate)
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
       OR
       -- B2: Date range (scheduledStartDate + scheduledEndDate) - inclusive boundaries
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
        AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
     )
     ORDER BY 
       CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
       t.scheduledStartDate ASC,
       t.dueDate ASC`,
    [today, today, today, today],
    (err, tasks) => {
      if (err) {
        console.error('Error fetching today tasks:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TODAY] Found ${tasks.length} tasks for ${today}`);
      tasks.forEach(t => {
        console.log(`  - Task ${t.id}: dueDate=${t.dueDate}, scheduledStart=${t.scheduledStartDate}, scheduledEnd=${t.scheduledEndDate}`);
      });
      res.json(tasks);
    }
  );
});

// UPCOMING: Show tasks for the next 14 days based on Report Due Date and/or Field Date
// Window: tomorrow through today+14 days (inclusive)
router.get('/dashboard/upcoming', authenticate, requireAdmin, (req, res) => {
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
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE (
       -- Rule A: Report Due Date is within next 14 days (future only, starting tomorrow)
       (t.dueDate IS NOT NULL AND t.dueDate >= ? AND t.dueDate <= ?)
       OR
       -- Rule B: Field Date is relevant within next 14 days
       -- B1: Single field date (scheduledStartDate only, no scheduledEndDate)
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL 
        AND t.scheduledStartDate >= ? AND t.scheduledStartDate <= ?)
       OR
       -- B2: Field date range - shows if range intersects upcoming window
       -- Range is visible if: fieldEnd >= tomorrow AND fieldStart <= today+14
       -- This keeps ongoing ranges visible until they finish
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
        AND t.scheduledEndDate >= ? AND t.scheduledStartDate <= ?)
     )
     AND t.status != 'APPROVED'
     ORDER BY 
       CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
       COALESCE(t.dueDate, t.scheduledStartDate, '9999-12-31') ASC,
       t.scheduledEndDate ASC`,
    [tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr],
    (err, tasks) => {
      if (err) {
        console.error('Error fetching upcoming tasks:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[UPCOMING] Found ${tasks.length} tasks (14-day window: ${tomorrowStr} to ${rangeEndStr})`);
      tasks.forEach(t => {
        console.log(`  - Task ${t.id}: dueDate=${t.dueDate}, scheduledStart=${t.scheduledStartDate}, scheduledEnd=${t.scheduledEndDate}`);
      });
      res.json(tasks);
    }
  );
});

// OVERDUE/PENDING: Show tasks with dueDate < today AND status != Approved
router.get('/dashboard/overdue', authenticate, requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  db.all(
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
    (err, tasks) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(tasks);
    }
  );
});

// TECHNICIAN DASHBOARD: Today view (filtered by assigned technician)
router.get('/dashboard/technician/today', authenticate, (req, res) => {
  // Only technicians can access this endpoint
  if (req.user.role !== 'TECHNICIAN') {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Get today's date in YYYY-MM-DD format (local date, no timezone)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  console.log(`[TECHNICIAN TODAY] Querying for tasks on: ${today} (technician: ${req.user.id})`);
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.assignedTechnicianId = ?
     AND (
       -- Rule A: Report Due Date is today
       (t.dueDate IS NOT NULL AND t.dueDate = ?)
       OR
       -- Rule B: Field Date includes today
       -- B1: Single date (scheduledStartDate only, no scheduledEndDate)
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
       OR
       -- B2: Date range (scheduledStartDate + scheduledEndDate) - inclusive boundaries
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
        AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
     )
     ORDER BY 
       CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
       t.scheduledStartDate ASC,
       t.dueDate ASC`,
    [req.user.id, today, today, today, today],
    (err, tasks) => {
      if (err) {
        console.error('Error fetching technician today tasks:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TECHNICIAN TODAY] Found ${tasks.length} tasks for ${today}`);
      res.json(tasks);
    }
  );
});

// TECHNICIAN DASHBOARD: Upcoming view (next 14 days, filtered by assigned technician)
router.get('/dashboard/technician/upcoming', authenticate, (req, res) => {
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
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.assignedTechnicianId = ?
     AND (
       -- Rule A: Report Due Date is within next 14 days (future only, starting tomorrow)
       (t.dueDate IS NOT NULL AND t.dueDate >= ? AND t.dueDate <= ?)
       OR
       -- Rule B: Field Date is relevant within next 14 days
       -- B1: Single field date (scheduledStartDate only, no scheduledEndDate)
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL 
        AND t.scheduledStartDate >= ? AND t.scheduledStartDate <= ?)
       OR
       -- B2: Field date range - shows if range intersects upcoming window
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
        AND t.scheduledEndDate >= ? AND t.scheduledStartDate <= ?)
     )
     AND t.status != 'APPROVED'
     ORDER BY 
       CASE WHEN t.status = 'READY_FOR_REVIEW' THEN 0 ELSE 1 END,
       COALESCE(t.dueDate, t.scheduledStartDate, '9999-12-31') ASC,
       t.scheduledEndDate ASC`,
    [req.user.id, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr, tomorrowStr, rangeEndStr],
    (err, tasks) => {
      if (err) {
        console.error('Error fetching technician upcoming tasks:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TECHNICIAN UPCOMING] Found ${tasks.length} tasks (14-day window: ${tomorrowStr} to ${rangeEndStr})`);
      res.json(tasks);
    }
  );
});

// TECHNICIAN DASHBOARD: Tomorrow view (filtered by assigned technician)
router.get('/dashboard/technician/tomorrow', authenticate, (req, res) => {
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
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.assignedTechnicianId = ?
     AND (
       -- Single field date: fieldDate == tomorrow
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NULL AND t.scheduledStartDate = ?)
       OR
       -- Field date range: includes tomorrow (inclusive)
       (t.scheduledStartDate IS NOT NULL AND t.scheduledEndDate IS NOT NULL 
        AND t.scheduledStartDate <= ? AND t.scheduledEndDate >= ?)
     )
     ORDER BY 
       t.scheduledStartDate ASC,
       t.dueDate ASC`,
    [req.user.id, tomorrowStr, tomorrowStr, tomorrowStr],
    (err, tasks) => {
      if (err) {
        console.error('Error fetching technician tomorrow tasks:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TECHNICIAN TOMORROW] Found ${tasks.length} tasks for ${tomorrowStr}`);
      res.json(tasks);
    }
  );
});

// TECHNICIAN DASHBOARD: My Open Reports (fieldCompleted=true, report not submitted)
router.get('/dashboard/technician/open-reports', authenticate, (req, res) => {
  // Only technicians can access this endpoint
  if (req.user.role !== 'TECHNICIAN') {
    return res.status(403).json({ error: 'Access denied' });
  }

  console.log(`[TECHNICIAN OPEN REPORTS] Querying for open reports (technician: ${req.user.id})`);
  
  db.all(
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
    (err, tasks) => {
      if (err) {
        console.error('Error fetching technician open reports:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TECHNICIAN OPEN REPORTS] Found ${tasks.length} open reports`);
      res.json(tasks);
    }
  );
});

// Mark field work as complete
router.post('/:id/mark-field-complete', authenticate, (req, res) => {
  const taskId = req.params.id;

  // Check task exists and is assigned to this technician
  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Technicians can only mark their own tasks as complete
    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mark field work as complete
    db.run(
      `UPDATE tasks 
       SET fieldCompleted = 1, 
           fieldCompletedAt = CURRENT_TIMESTAMP,
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [taskId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Log history
        const actorName = req.user.name || req.user.email || 'User';
        logTaskHistory(taskId, req.user.role, actorName, req.user.id, 'STATUS_CHANGED', 'Field work marked as complete');

        // Return updated task
        db.get(
          `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectNumber, p.projectName
           FROM tasks t
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ?`,
          [taskId],
          (err, updatedTask) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(updatedTask);
          }
        );
      }
    );
  });
});

// TECHNICIAN DASHBOARD: Activity Log (task history for assigned tasks)
router.get('/dashboard/technician/activity', authenticate, (req, res) => {
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
  
  // Get task history entries for tasks assigned to this technician
  // Show entries where: task is assigned to technician OR action was performed by technician
  db.all(
    `SELECT th.*, t.taskType, t.projectId, p.projectNumber, p.projectName
     FROM task_history th
     INNER JOIN tasks t ON th.taskId = t.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.assignedTechnicianId = ?
     AND DATE(th.timestamp) = DATE(?)
     ORDER BY th.timestamp DESC`,
    [req.user.id, activityDate],
    (err, activity) => {
      if (err) {
        console.error('Error fetching technician activity:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log(`[TECHNICIAN ACTIVITY] Found ${activity.length} activity entries for ${activityDate}`);
      res.json(activity || []);
    }
  );
});

// ACTIVITY LOG: Show tasks by completedAt or submittedAt for a specific date (Admin only)
router.get('/dashboard/activity', authenticate, requireAdmin, (req, res) => {
  const activityDate = req.query.date || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  })();
  
  db.all(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectNumber, p.projectName
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE (
       -- Tasks completed (approved) on this date
       (t.completedAt IS NOT NULL AND DATE(t.completedAt) = DATE(?))
       OR
       -- Tasks submitted (ready for review) on this date
       (t.submittedAt IS NOT NULL AND DATE(t.submittedAt) = DATE(?))
     )
     ORDER BY 
       COALESCE(t.completedAt, t.submittedAt) DESC`,
    [activityDate, activityDate],
    (err, tasks) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(tasks);
    }
  );
});

// Get task history (audit trail)
router.get('/:id/history', authenticate, (req, res) => {
  const taskId = req.params.id;

  // Check task access
  db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check access: Technicians can only see their assigned tasks
    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get history entries
    db.all(
      `SELECT * FROM task_history 
       WHERE taskId = ? 
       ORDER BY timestamp DESC`,
      [taskId],
      (err, history) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(history || []);
      }
    );
  });
});

// Attach logTaskHistory to router so it can be imported by other route files
router.logTaskHistory = logTaskHistory;
module.exports = router;

