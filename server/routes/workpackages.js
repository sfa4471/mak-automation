const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { createNotification } = require('./notifications');

const router = express.Router();

// Get work packages for a project
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
      query = `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
               FROM workpackages wp
               LEFT JOIN users u ON wp.assignedTo = u.id
               WHERE wp.projectId = ?
               ORDER BY wp.id`;
      params = [projectId];
    } else {
      query = `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
               FROM workpackages wp
               LEFT JOIN users u ON wp.assignedTo = u.id
               WHERE wp.projectId = ? AND wp.assignedTo = ?
               ORDER BY wp.id`;
      params = [projectId, req.user.id];
    }

    db.all(query, params, (err, workPackages) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(workPackages);
    });
  });
});

// Get single work package
router.get('/:id', authenticate, (req, res) => {
  const workPackageId = req.params.id;

  db.get(
    `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectName, p.projectNumber, p.projectSpec
     FROM workpackages wp
     LEFT JOIN users u ON wp.assignedTo = u.id
     INNER JOIN projects p ON wp.projectId = p.id
     WHERE wp.id = ?`,
    [workPackageId],
    (err, workPackage) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!workPackage) {
        return res.status(404).json({ error: 'Work package not found' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && workPackage.assignedTo !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(workPackage);
    }
  );
});

// Assign work package to technician (Admin only)
router.put('/:id/assign', authenticate, requireAdmin, [
  body('technicianId').isInt()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const workPackageId = req.params.id;
  const { technicianId } = req.body;

  // Verify technician exists
  db.get('SELECT id FROM users WHERE id = ? AND role = ?', [technicianId, 'TECHNICIAN'], (err, tech) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!tech) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    // Get work package and project info for notification
    db.get(
      `SELECT wp.*, p.projectNumber, p.projectName 
       FROM workpackages wp
       INNER JOIN projects p ON wp.projectId = p.id
       WHERE wp.id = ?`,
      [workPackageId],
      (err, wp) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!wp) {
          return res.status(404).json({ error: 'Work package not found' });
        }

        db.run(
          'UPDATE workpackages SET assignedTo = ?, status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          [technicianId, 'Assigned', workPackageId],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) {
              return res.status(404).json({ error: 'Work package not found' });
            }

            // Create notification for technician
            const message = `Admin assigned ${wp.name} for Project ${wp.projectNumber}`;
            createNotification(technicianId, message, 'info', workPackageId, wp.projectId).catch(console.error);

            db.get(
              `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
               FROM workpackages wp
               LEFT JOIN users u ON wp.assignedTo = u.id
               WHERE wp.id = ?`,
              [workPackageId],
              (err, workPackage) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                res.json(workPackage);
              }
            );
          }
        );
      }
    );
  });
});

// Update work package status
router.put('/:id/status', authenticate, [
  body('status').isIn(['Draft', 'Assigned', 'In Progress', 'Submitted', 'Approved', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW'])
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const workPackageId = req.params.id;
  const { status } = req.body;

  // Check access and get work package
  db.get(
    `SELECT wp.*, p.projectNumber, p.projectName 
     FROM workpackages wp
     INNER JOIN projects p ON wp.projectId = p.id
     WHERE wp.id = ?`,
    [workPackageId],
    (err, wp) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!wp) {
        return res.status(404).json({ error: 'Work package not found' });
      }

      // Technicians can only set IN_PROGRESS_TECH or READY_FOR_REVIEW
      if (req.user.role === 'TECHNICIAN') {
        if (wp.assignedTo !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (status !== 'IN_PROGRESS_TECH' && status !== 'READY_FOR_REVIEW') {
          return res.status(403).json({ error: 'Technicians can only set status to IN_PROGRESS_TECH or READY_FOR_REVIEW' });
        }
      }

      db.run(
        'UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [status, workPackageId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          // Create notification when technician starts working (Save Update)
          if (status === 'IN_PROGRESS_TECH' && req.user.role === 'TECHNICIAN') {
            // Get technician's name from database
            db.get('SELECT name, email FROM users WHERE id = ?', [req.user.id], (err, technician) => {
              if (err) {
                console.error('Error fetching technician name:', err);
                return;
              }
              
              const technicianName = technician?.name || technician?.email || 'Technician';
              
              // Get all admins
              db.all('SELECT id FROM users WHERE role = ?', ['ADMIN'], (err, admins) => {
                if (!err && admins) {
                  const message = `${technicianName} started working on ${wp.name} for Project ${wp.projectNumber}`;
                  admins.forEach(admin => {
                    createNotification(admin.id, message, 'info', workPackageId, wp.projectId).catch(console.error);
                  });
                }
              });
            });
          }

          // Create notification when technician sends update to admin
          if (status === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN') {
            // Get technician's name from database
            db.get('SELECT name, email FROM users WHERE id = ?', [req.user.id], (err, technician) => {
              if (err) {
                console.error('Error fetching technician name:', err);
                return;
              }
              
              const technicianName = technician?.name || technician?.email || 'Technician';
              
              // Get all admins
              db.all('SELECT id FROM users WHERE role = ?', ['ADMIN'], (err, admins) => {
                if (!err && admins) {
                  const message = `${technicianName} completed ${wp.name} for Project ${wp.projectNumber}`;
                  admins.forEach(admin => {
                    createNotification(admin.id, message, 'info', workPackageId, wp.projectId).catch(console.error);
                  });
                }
              });
            });
          }

          db.get('SELECT * FROM workpackages WHERE id = ?', [workPackageId], (err, workPackage) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(workPackage);
          });
        }
      );
    }
  );
});

// Get WP1 data
router.get('/:id/wp1', authenticate, (req, res) => {
  const workPackageId = req.params.id;

  // Check work package access
  db.get(
    `SELECT wp.*, p.specStrengthPsi, p.specAmbientTempF, p.specConcreteTempF, p.specSlump, p.specAirContentByVolume
     FROM workpackages wp
     INNER JOIN projects p ON wp.projectId = p.id
     WHERE wp.id = ?`,
    [workPackageId],
    (err, wp) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!wp) {
        return res.status(404).json({ error: 'Work package not found' });
      }
      if (wp.type !== 'WP1') {
        return res.status(400).json({ error: 'This endpoint is for WP1 only' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && wp.assignedTo !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      db.get('SELECT * FROM wp1_data WHERE workPackageId = ?', [workPackageId], (err, data) => {
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
          // Add project specs for auto-population
          data.projectSpecs = {
            specStrengthPsi: wp.specStrengthPsi,
            specAmbientTempF: wp.specAmbientTempF,
            specConcreteTempF: wp.specConcreteTempF,
            specSlump: wp.specSlump,
            specAirContentByVolume: wp.specAirContentByVolume,
          };
          res.json(data);
        } else {
          // Return empty structure with project specs
          res.json({
            workPackageId: parseInt(workPackageId),
            cylinders: [],
            projectSpecs: {
              specStrengthPsi: wp.specStrengthPsi,
              specAmbientTempF: wp.specAmbientTempF,
              specConcreteTempF: wp.specConcreteTempF,
              specSlump: wp.specSlump,
              specAirContentByVolume: wp.specAirContentByVolume,
            }
          });
        }
      });
    }
  );
});

// Save WP1 data
router.post('/:id/wp1', authenticate, (req, res) => {
  const workPackageId = req.params.id;

  // Check work package access
  db.get('SELECT * FROM workpackages WHERE id = ?', [workPackageId], (err, wp) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!wp) {
      return res.status(404).json({ error: 'Work package not found' });
    }
    if (wp.type !== 'WP1') {
      return res.status(400).json({ error: 'This endpoint is for WP1 only' });
    }

    // Check access
    if (req.user.role === 'TECHNICIAN' && wp.assignedTo !== req.user.id) {
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
      updateStatus // Optional: status to set when saving
    } = req.body;

    // Serialize cylinders
    const cylindersJson = JSON.stringify(cylinders || []);

    // Check if record exists
    db.get('SELECT id FROM wp1_data WHERE workPackageId = ?', [workPackageId], (err, existing) => {
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
           WHERE workPackageId = ?`,
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
            workPackageId
          ],
          function(err) {
            if (err) {
              console.error('Error updating wp1_data:', err);
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            // Update status if provided, otherwise auto-update based on role
            if (updateStatus) {
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [updateStatus, workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            } else if (req.user && req.user.role === 'TECHNICIAN' && (wp.status === 'Draft' || wp.status === 'Assigned')) {
              // Auto-update to IN_PROGRESS_TECH when technician first edits
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['IN_PROGRESS_TECH', workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            } else if (req.user && req.user.role === 'ADMIN' && (wp.status === 'Draft' || wp.status === 'Assigned')) {
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['In Progress', workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            }

            db.get('SELECT * FROM wp1_data WHERE workPackageId = ?', [workPackageId], (err, data) => {
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
            null, workPackageId, technician, weather, placementDate, specStrength, specStrengthDays,
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

            // Update status if provided, otherwise auto-update based on role
            if (updateStatus) {
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [updateStatus, workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            } else if (req.user && req.user.role === 'TECHNICIAN') {
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['IN_PROGRESS_TECH', workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            } else {
              db.run('UPDATE workpackages SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', ['In Progress', workPackageId], (err) => {
                if (err) console.error('Error updating workpackage status:', err);
              });
            }

            db.get('SELECT * FROM wp1_data WHERE workPackageId = ?', [workPackageId], (err, data) => {
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

