const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { logTaskHistory } = require('./tasks');

const router = express.Router();

// Get WP1 data by taskId
router.get('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;

  // Check task access
  db.get(
    `SELECT t.*, p.projectName, p.projectNumber, p.specStrengthPsi, p.specAmbientTempF, 
     p.specConcreteTempF, p.specSlump, p.specAirContentByVolume, p.soilSpecs
     FROM tasks t
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ? AND t.taskType = 'COMPRESSIVE_STRENGTH'`,
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

      // Parse soilSpecs JSON
      let soilSpecs = {};
      if (task.soilSpecs) {
        try {
          soilSpecs = JSON.parse(task.soilSpecs);
        } catch (e) {
          soilSpecs = {};
        }
      }

      db.get('SELECT * FROM wp1_data WHERE taskId = ?', [taskId], (err, data) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        if (data) {
          // Parse cylinders JSON
          try {
            data.cylinders = JSON.parse(data.cylinders || '[]');
          } catch (e) {
            data.cylinders = [];
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
      });
    }
  );
});

// Save WP1 data by taskId
router.post('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;

  // Check task access
  db.get('SELECT * FROM tasks WHERE id = ? AND taskType = ?', [taskId, 'COMPRESSIVE_STRENGTH'], (err, task) => {
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

    // Serialize cylinders
    const cylindersJson = JSON.stringify(cylinders || []);

    // Check if record exists
    db.get('SELECT id FROM wp1_data WHERE taskId = ?', [taskId], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existing) {
        // Update
        db.run(
          `UPDATE wp1_data SET
           technician = ?, weather = ?, placementDate = ?, specStrength = ?, specStrengthDays = ?,
           structure = ?, sampleLocation = ?, supplier = ?, timeBatched = ?, classMixId = ?, timeSampled = ?,
           yardsBatched = ?, ambientTempMeasured = ?, ambientTempSpecs = ?, truckNo = ?, ticketNo = ?,
           concreteTempMeasured = ?, concreteTempSpecs = ?, plant = ?, slumpMeasured = ?, slumpSpecs = ?,
           yardsPlaced = ?, totalYards = ?, airContentMeasured = ?, airContentSpecs = ?,
           waterAdded = ?, unitWeight = ?, finalCureMethod = ?,
           specimenNo = ?, specimenQty = ?, specimenType = ?,
           cylinders = ?, remarks = ?,
           lastEditedByRole = ?, lastEditedByName = ?, lastEditedByUserId = ?,
           updatedAt = CURRENT_TIMESTAMP
           WHERE taskId = ?`,
          [
            technician, weather, placementDate, specStrength, specStrengthDays,
            structure, sampleLocation, supplier, timeBatched, classMixId, timeSampled,
            yardsBatched, ambientTempMeasured, ambientTempSpecs, truckNo, ticketNo,
            concreteTempMeasured, concreteTempSpecs, plant, slumpMeasured, slumpSpecs,
            yardsPlaced, totalYards, airContentMeasured, airContentSpecs,
            waterAdded, unitWeight, finalCureMethod,
            specimenNo, specimenQty, specimenType,
            cylindersJson, remarks,
            req.user ? req.user.role : null, 
            req.user ? (req.user.name || req.user.email) : null, 
            req.user ? req.user.id : null,
            taskId
          ],
          function(err) {
            if (err) {
              console.error('Error updating wp1_data:', err);
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            // Update task status if provided
            if (updateStatus) {
              // Mark report as submitted when status becomes READY_FOR_REVIEW
              const statusUpdate = updateStatus === 'READY_FOR_REVIEW'
                ? 'UPDATE tasks SET status = ?, reportSubmitted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
                : 'UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?';
              
              db.run(statusUpdate, [updateStatus, taskId], (err) => {
                if (err) {
                  console.error('Error updating task status:', err);
                } else {
                  // Log history
                  if (updateStatus === 'READY_FOR_REVIEW') {
                    logTaskHistory(taskId, req.user.role, req.user.name || req.user.email || 'User', req.user.id, 'SUBMITTED', 'Report submitted for review');
                  }
                }
              });
            }

            // Update task assignment if technician changed (admin only)
            if (req.user.role === 'ADMIN' && technician) {
              // Try to find technician by name or email
              db.get(
                'SELECT id FROM users WHERE (name = ? OR email = ?) AND role = ?',
                [technician, technician, 'TECHNICIAN'],
                (err, techUser) => {
                  if (err) {
                    console.error('Error finding technician:', err);
                  } else if (techUser && techUser.id !== task.assignedTechnicianId) {
                    // Update task assignment
                    db.run(
                      'UPDATE tasks SET assignedTechnicianId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                      [techUser.id, taskId],
                      (err) => {
                        if (err) {
                          console.error('Error updating task assignment:', err);
                        }
                      }
                    );
                  }
                }
              );
            }

            db.get('SELECT * FROM wp1_data WHERE taskId = ?', [taskId], (err, data) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              try {
                data.cylinders = JSON.parse(data.cylinders || '[]');
              } catch (e) {
                data.cylinders = [];
              }
              res.json(data);
            });
          }
        );
      } else {
        // Insert
        db.run(
          `INSERT INTO wp1_data (
           taskId, workPackageId, technician, weather, placementDate, specStrength, specStrengthDays,
           structure, sampleLocation, supplier, timeBatched, classMixId, timeSampled,
           yardsBatched, ambientTempMeasured, ambientTempSpecs, truckNo, ticketNo,
           concreteTempMeasured, concreteTempSpecs, plant, slumpMeasured, slumpSpecs,
           yardsPlaced, totalYards, airContentMeasured, airContentSpecs,
           waterAdded, unitWeight, finalCureMethod,
           specimenNo, specimenQty, specimenType, cylinders, remarks,
           lastEditedByRole, lastEditedByName, lastEditedByUserId
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId, null, technician, weather, placementDate, specStrength, specStrengthDays,
            structure, sampleLocation, supplier, timeBatched, classMixId, timeSampled,
            yardsBatched, ambientTempMeasured, ambientTempSpecs, truckNo, ticketNo,
            concreteTempMeasured, concreteTempSpecs, plant, slumpMeasured, slumpSpecs,
            yardsPlaced, totalYards, airContentMeasured, airContentSpecs,
            waterAdded, unitWeight, finalCureMethod,
            specimenNo, specimenQty, specimenType, cylindersJson, remarks,
            req.user ? req.user.role : null, 
            req.user ? (req.user.name || req.user.email) : null, 
            req.user ? req.user.id : null
          ],
          function(err) {
            if (err) {
              console.error('Error inserting wp1_data:', err);
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            // Update task status if provided
            if (updateStatus) {
              // Mark report as submitted when status becomes READY_FOR_REVIEW
              const statusUpdate = updateStatus === 'READY_FOR_REVIEW'
                ? 'UPDATE tasks SET status = ?, reportSubmitted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?'
                : 'UPDATE tasks SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?';
              
              db.run(statusUpdate, [updateStatus, taskId], (err) => {
                if (err) {
                  console.error('Error updating task status:', err);
                } else {
                  // Log history
                  if (updateStatus === 'READY_FOR_REVIEW') {
                    logTaskHistory(taskId, req.user.role, req.user.name || req.user.email || 'User', req.user.id, 'SUBMITTED', 'Report submitted for review');
                  }
                }
              });
            }

            // Update task assignment if technician changed (admin only)
            if (req.user.role === 'ADMIN' && technician) {
              // Try to find technician by name or email
              db.get(
                'SELECT id FROM users WHERE (name = ? OR email = ?) AND role = ?',
                [technician, technician, 'TECHNICIAN'],
                (err, techUser) => {
                  if (err) {
                    console.error('Error finding technician:', err);
                  } else if (techUser && techUser.id !== task.assignedTechnicianId) {
                    // Update task assignment
                    db.run(
                      'UPDATE tasks SET assignedTechnicianId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                      [techUser.id, taskId],
                      (err) => {
                        if (err) {
                          console.error('Error updating task assignment:', err);
                        }
                      }
                    );
                  }
                }
              );
            }

            db.get('SELECT * FROM wp1_data WHERE taskId = ?', [taskId], (err, data) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              try {
                data.cylinders = JSON.parse(data.cylinders || '[]');
              } catch (e) {
                data.cylinders = [];
              }
              res.json(data);
            });
          }
        );
      }
    });
  });
});

module.exports = router;

