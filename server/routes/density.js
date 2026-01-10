const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get density report by taskId
router.get('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;

  // Check task access
  db.get(
    `SELECT t.*, p.projectName, p.projectNumber
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
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

      db.get('SELECT * FROM density_reports WHERE taskId = ?', [taskId], (err, data) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (data) {
          // Parse JSON fields
          try {
            data.testRows = JSON.parse(data.testRows || '[]');
            data.proctors = JSON.parse(data.proctors || '[]');
          } catch (e) {
            data.testRows = [];
            data.proctors = [];
          }
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
          
          res.json({
            taskId: parseInt(taskId),
            projectName: task.projectName,
            projectNumber: task.projectNumber,
            clientName: '',
            datePerformed: new Date().toISOString().split('T')[0],
            structure: '',
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
            timeStr: ''
          });
        }
      });
    }
  );
});

// Save density report by taskId
router.post('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;
  const {
    clientName,
    datePerformed,
    structure,
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
    assignedTechnicianId
  } = req.body;

  // Check task access
  db.get(
    `SELECT t.*, p.projectName, p.projectNumber
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
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

      // Check if record exists
      db.get('SELECT id FROM density_reports WHERE taskId = ?', [taskId], (err, existing) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        const testRowsJson = JSON.stringify(testRows || []);
        const proctorsJson = JSON.stringify(proctors || []);

        if (existing) {
          // Update
          db.run(
            `UPDATE density_reports SET
             clientName = ?, datePerformed = ?, structure = ?,
             testRows = ?, proctors = ?,
             densSpecPercent = ?, moistSpecMin = ?, moistSpecMax = ?,
             gaugeNo = ?, stdDensityCount = ?, stdMoistCount = ?, transDepthIn = ?,
             methodD2922 = ?, methodD3017 = ?, methodD698 = ?,
             remarks = ?, techName = ?, technicianId = ?, timeStr = ?,
             lastEditedByRole = ?, lastEditedByUserId = ?,
             updatedAt = CURRENT_TIMESTAMP
             WHERE taskId = ?`,
            [
              clientName || null,
              datePerformed || null,
              structure || null,
              testRowsJson,
              proctorsJson,
              densSpecPercent || null,
              moistSpecMin || null,
              moistSpecMax || null,
              gaugeNo || null,
              stdDensityCount || null,
              stdMoistCount || null,
              transDepthIn || null,
              methodD2922 ? 1 : 0,
              methodD3017 ? 1 : 0,
              methodD698 ? 1 : 0,
              remarks || null,
              techName || null,
              technicianId || null,
              timeStr || null,
              req.user.role,
              req.user.id,
              taskId
            ],
            function(err) {
              if (err) {
                console.error('Error updating density report:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
              }

              // Update task status if provided
              if (updateStatus) {
                // Mark report as submitted when status becomes READY_FOR_REVIEW
                const setSubmittedAt = updateStatus === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN' 
                  ? ', submittedAt = CURRENT_TIMESTAMP, reportSubmitted = 1' 
                  : updateStatus === 'READY_FOR_REVIEW'
                  ? ', reportSubmitted = 1'
                  : '';
                db.run(
                  `UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP${setSubmittedAt} WHERE id = ?`,
                  [updateStatus, taskId],
                  (err) => {
                    if (err) console.error('Error updating task status:', err);
                  }
                );
              }

              // Update task assignment if technician changed (admin only)
              if (req.user.role === 'ADMIN' && assignedTechnicianId && assignedTechnicianId !== task.assignedTechnicianId) {
                db.run(
                  'UPDATE tasks SET assignedTechnicianId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                  [assignedTechnicianId, taskId],
                  (err) => { if (err) console.error('Error updating task assignment:', err); }
                );
              }

              // Return updated data
              db.get('SELECT * FROM density_reports WHERE taskId = ?', [taskId], (err, updated) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                try {
                  updated.testRows = JSON.parse(updated.testRows || '[]');
                  updated.proctors = JSON.parse(updated.proctors || '[]');
                } catch (e) {
                  updated.testRows = [];
                  updated.proctors = [];
                }
                updated.projectName = task.projectName;
                updated.projectNumber = task.projectNumber;
                res.json(updated);
              });
            }
          );
        } else {
          // Insert
          db.run(
            `INSERT INTO density_reports (
             taskId, clientName, datePerformed, structure,
             testRows, proctors,
             densSpecPercent, moistSpecMin, moistSpecMax,
             gaugeNo, stdDensityCount, stdMoistCount, transDepthIn,
             methodD2922, methodD3017, methodD698,
             remarks, techName, technicianId, timeStr,
             lastEditedByRole, lastEditedByUserId
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              taskId,
              clientName || null,
              datePerformed || null,
              structure || null,
              testRowsJson,
              proctorsJson,
              densSpecPercent || null,
              moistSpecMin || null,
              moistSpecMax || null,
              gaugeNo || null,
              stdDensityCount || null,
              stdMoistCount || null,
              transDepthIn || null,
              methodD2922 ? 1 : 0,
              methodD3017 ? 1 : 0,
              methodD698 ? 1 : 0,
              remarks || null,
              techName || null,
              technicianId || null,
              timeStr || null,
              req.user.role,
              req.user.id
            ],
            function(err) {
              if (err) {
                console.error('Error inserting density report:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
              }

              // Update task status if provided
              if (updateStatus) {
                // Mark report as submitted when status becomes READY_FOR_REVIEW
                const setSubmittedAt = updateStatus === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN' 
                  ? ', submittedAt = CURRENT_TIMESTAMP, reportSubmitted = 1' 
                  : updateStatus === 'READY_FOR_REVIEW'
                  ? ', reportSubmitted = 1'
                  : '';
                db.run(
                  `UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP${setSubmittedAt} WHERE id = ?`,
                  [updateStatus, taskId],
                  (err) => {
                    if (err) console.error('Error updating task status:', err);
                  }
                );
              }

              // Update task assignment if technician changed (admin only)
              if (req.user.role === 'ADMIN' && assignedTechnicianId && assignedTechnicianId !== task.assignedTechnicianId) {
                db.run(
                  'UPDATE tasks SET assignedTechnicianId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                  [assignedTechnicianId, taskId],
                  (err) => { if (err) console.error('Error updating task assignment:', err); }
                );
              }

              // Return created data
              db.get('SELECT * FROM density_reports WHERE taskId = ?', [taskId], (err, created) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                try {
                  created.testRows = JSON.parse(created.testRows || '[]');
                  created.proctors = JSON.parse(created.proctors || '[]');
                } catch (e) {
                  created.testRows = [];
                  created.proctors = [];
                }
                created.projectName = task.projectName;
                created.projectNumber = task.projectNumber;
                res.json(created);
              });
            }
          );
        }
      });
    }
  );
});

module.exports = router;

