const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { logTaskHistory } = require('./tasks');

const router = express.Router();

// Get rebar report by taskId
router.get('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;

  // Check task access
  db.get(
    `SELECT t.*, p.projectName, p.projectNumber
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ? AND t.taskType = 'REBAR'`,
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

      db.get('SELECT * FROM rebar_reports WHERE taskId = ?', [taskId], (err, data) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
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
            db.get('SELECT name, email FROM users WHERE id = ?', [data.technicianId], (err, tech) => {
              if (!err && tech) {
                data.techName = tech.name || tech.email || '';
              }
              res.json(data);
            });
          } else {
            res.json(data);
          }
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
      });
    }
  );
});

// Save rebar report by taskId
router.post('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;
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
  db.get(
    `SELECT t.*, p.projectName, p.projectNumber
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ? AND t.taskType = 'REBAR'`,
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

      // Check if report exists
      db.get('SELECT id FROM rebar_reports WHERE taskId = ?', [taskId], (err, existing) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Get technician name if technicianId is provided
        let finalTechName = techName || '';
        if (technicianId) {
          db.get('SELECT name, email FROM users WHERE id = ?', [technicianId], (err, tech) => {
            if (!err && tech) {
              finalTechName = tech.name || tech.email || '';
            }
            saveReport();
          });
        } else {
          saveReport();
        }

        function saveReport() {
          if (existing) {
            // Update existing report
            db.run(
              `UPDATE rebar_reports SET
                clientName = ?,
                reportDate = ?,
                inspectionDate = ?,
                generalContractor = ?,
                locationDetail = ?,
                wireMeshSpec = ?,
                drawings = ?,
                technicianId = ?,
                techName = ?,
                updatedAt = CURRENT_TIMESTAMP
                WHERE taskId = ?`,
              [
                clientName || null,
                reportDate || null,
                inspectionDate || null,
                generalContractor || null,
                locationDetail || null,
                wireMeshSpec || null,
                drawings || null,
                technicianId || null,
                finalTechName || null,
                taskId
              ],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Database error: ' + err.message });
                }

                // Update task status if provided
                if (updateStatus) {
                  // Mark report as submitted when status becomes READY_FOR_REVIEW
                  const statusUpdate = updateStatus === 'READY_FOR_REVIEW'
                    ? 'UPDATE tasks SET status = ?, reportSubmitted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
                    : 'UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?';
                  
                  db.run(
                    statusUpdate,
                    [updateStatus, taskId],
                    (err) => {
                      if (err) {
                        console.error('Error updating task status:', err);
                      } else {
                        // Log history
                        if (updateStatus === 'READY_FOR_REVIEW') {
                          logTaskHistory(taskId, req.user.role, req.user.name || req.user.email || 'User', req.user.id, 'SUBMITTED', 'Report submitted for review');
                        }
                      }
                    }
                  );
                }

                // Update assigned technician if provided (admin can change)
                if (assignedTechnicianId !== undefined && req.user.role === 'ADMIN') {
                  db.run(
                    'UPDATE tasks SET assignedTechnicianId = ? WHERE id = ?',
                    [assignedTechnicianId || null, taskId],
                    (err) => {
                      if (err) {
                        console.error('Error updating assigned technician:', err);
                      }
                    }
                  );
                }

                res.json({ success: true, id: existing.id });
              }
            );
          } else {
            // Insert new report
            db.run(
              `INSERT INTO rebar_reports (
                taskId, clientName, reportDate, inspectionDate, generalContractor,
                locationDetail, wireMeshSpec, drawings, technicianId, techName
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                taskId,
                clientName || null,
                reportDate || null,
                inspectionDate || null,
                generalContractor || null,
                locationDetail || null,
                wireMeshSpec || null,
                drawings || null,
                technicianId || null,
                finalTechName || null
              ],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Database error: ' + err.message });
                }

                // Update task status if provided
                if (updateStatus) {
                  // Mark report as submitted when status becomes READY_FOR_REVIEW
                  const statusUpdate = updateStatus === 'READY_FOR_REVIEW'
                    ? 'UPDATE tasks SET status = ?, reportSubmitted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
                    : 'UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?';
                  
                  db.run(
                    statusUpdate,
                    [updateStatus, taskId],
                    (err) => {
                      if (err) {
                        console.error('Error updating task status:', err);
                      } else {
                        // Log history
                        if (updateStatus === 'READY_FOR_REVIEW') {
                          logTaskHistory(taskId, req.user.role, req.user.name || req.user.email || 'User', req.user.id, 'SUBMITTED', 'Report submitted for review');
                        }
                      }
                    }
                  );
                }

                // Update assigned technician if provided (admin can change)
                if (assignedTechnicianId !== undefined && req.user.role === 'ADMIN') {
                  db.run(
                    'UPDATE tasks SET assignedTechnicianId = ? WHERE id = ?',
                    [assignedTechnicianId || null, taskId],
                    (err) => {
                      if (err) {
                        console.error('Error updating assigned technician:', err);
                      }
                    }
                  );
                }

                res.json({ success: true, id: this.lastID });
              }
            );
          }
        }
      });
    }
  );
});

module.exports = router;

