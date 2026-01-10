const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory } = require('../utils/pdfFileManager');

const router = express.Router();

// Generate project number: MAK-YYYY-####
function generateProjectNumber() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `MAK-${year}-${randomNum}`;
}

// Create project (Admin only)
router.post('/', authenticate, requireAdmin, [
  body('projectName').notEmpty().trim(),
  body('projectSpec').optional(),
  body('customerEmail').optional().isEmail(),
  body('specStrengthPsi').optional(),
  body('specAmbientTempF').optional(),
  body('specConcreteTempF').optional(),
  body('specSlump').optional(),
  body('specAirContentByVolume').optional()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { 
    projectName, 
    projectSpec, 
    customerEmail,
    specStrengthPsi,
    specAmbientTempF,
    specConcreteTempF,
    specSlump,
    specAirContentByVolume
  } = req.body;
  let projectNumber;

  // Generate unique project number
  const generateUnique = () => {
    projectNumber = generateProjectNumber();
    db.get('SELECT id FROM projects WHERE projectNumber = ?', [projectNumber], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (row) {
        // If exists, try again
        generateUnique();
      } else {
        // Create project
        db.run(
          `INSERT INTO projects (projectNumber, projectName, projectSpec, customerEmail, 
           specStrengthPsi, specAmbientTempF, specConcreteTempF, specSlump, specAirContentByVolume) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectNumber, 
            projectName, 
            projectSpec || null, 
            customerEmail || null,
            specStrengthPsi || null,
            specAmbientTempF || null,
            specConcreteTempF || null,
            specSlump || null,
            specAirContentByVolume || null
          ],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }

            const projectId = this.lastID;

            // Create project folder structure for PDF storage (use project number, not ID)
            try {
              ensureProjectDirectory(projectNumber);
            } catch (folderError) {
              console.error('Error creating project folder:', folderError);
              // Continue even if folder creation fails
            }

            // Don't auto-create work packages anymore - tasks are created manually
            db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }
              res.status(201).json(project);
            });
          }
        );
      }
    });
  };

  generateUnique();
});

// Get all projects (Admin sees all, Technician sees assigned only)
router.get('/', authenticate, (req, res) => {
  if (req.user.role === 'ADMIN') {
    db.all(
      `SELECT p.*, 
       (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
       FROM projects p ORDER BY p.createdAt DESC`,
      [],
      (err, projects) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(projects);
      }
    );
  } else {
    // Technician: only projects with assigned work packages
    db.all(
      `SELECT DISTINCT p.* 
       FROM projects p
       INNER JOIN workpackages wp ON wp.projectId = p.id
       WHERE wp.assignedTo = ?
       ORDER BY p.createdAt DESC`,
      [req.user.id],
      (err, projects) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(projects);
      }
    );
  }
});

// Get single project
router.get('/:id', authenticate, (req, res) => {
  const projectId = req.params.id;

  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: Admin can see all, Technician only assigned
    if (req.user.role === 'TECHNICIAN') {
      db.get(
        'SELECT COUNT(*) as count FROM workpackages WHERE projectId = ? AND assignedTo = ?',
        [projectId, req.user.id],
        (err, row) => {
          if (err || row.count === 0) {
            return res.status(403).json({ error: 'Access denied' });
          }
          res.json(project);
        }
      );
    } else {
      res.json(project);
    }
  });
});

// Update project (Admin only)
router.put('/:id', authenticate, requireAdmin, [
  body('projectName').optional().notEmpty(),
  body('projectSpec').optional(),
  body('customerEmail').optional().isEmail(),
  body('specStrengthPsi').optional(),
  body('specAmbientTempF').optional(),
  body('specConcreteTempF').optional(),
  body('specSlump').optional(),
  body('specAirContentByVolume').optional()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const projectId = req.params.id;
  const { 
    projectName, 
    projectSpec, 
    customerEmail,
    specStrengthPsi,
    specAmbientTempF,
    specConcreteTempF,
    specSlump,
    specAirContentByVolume
  } = req.body;

  const updates = [];
  const values = [];

  if (projectName !== undefined) {
    updates.push('projectName = ?');
    values.push(projectName);
  }
  if (projectSpec !== undefined) {
    updates.push('projectSpec = ?');
    values.push(projectSpec);
  }
  if (customerEmail !== undefined) {
    updates.push('customerEmail = ?');
    values.push(customerEmail);
  }
  if (specStrengthPsi !== undefined) {
    updates.push('specStrengthPsi = ?');
    values.push(specStrengthPsi);
  }
  if (specAmbientTempF !== undefined) {
    updates.push('specAmbientTempF = ?');
    values.push(specAmbientTempF);
  }
  if (specConcreteTempF !== undefined) {
    updates.push('specConcreteTempF = ?');
    values.push(specConcreteTempF);
  }
  if (specSlump !== undefined) {
    updates.push('specSlump = ?');
    values.push(specSlump);
  }
  if (specAirContentByVolume !== undefined) {
    updates.push('specAirContentByVolume = ?');
    values.push(specAirContentByVolume);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updatedAt = CURRENT_TIMESTAMP');
  values.push(projectId);

  db.run(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(project);
      });
    }
  );
});

module.exports = router;

