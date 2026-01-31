const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory } = require('../utils/pdfFileManager');

const router = express.Router();

// Helper function to parse JSON fields from project
function parseProjectJSONFields(project) {
  if (!project) return project;
  
  if (project.customerEmails) {
    try {
      project.customerEmails = JSON.parse(project.customerEmails);
    } catch (e) {
      project.customerEmails = [];
    }
  }
  if (project.soilSpecs) {
    try {
      project.soilSpecs = JSON.parse(project.soilSpecs);
    } catch (e) {
      project.soilSpecs = {};
    }
  }
  if (project.concreteSpecs) {
    try {
      project.concreteSpecs = JSON.parse(project.concreteSpecs);
    } catch (e) {
      project.concreteSpecs = {};
    }
  }
  return project;
}

// Generate project number: 02-YYYY-NNNN (with year-based sequence)
// Uses atomic counter to ensure uniqueness and handle concurrency
function generateProjectNumber(callback) {
  const year = new Date().getFullYear();
  const baseStart = (year - 2022) * 1000 + 1;
  
  // Get or create counter for this year, then increment atomically
  db.get('SELECT nextSeq FROM project_counters WHERE year = ?', [year], (selectErr, row) => {
    if (selectErr) {
      return callback(selectErr, null);
    }
    
    if (!row) {
      // First project for this year - create counter with nextSeq = baseStart + 1
      const nextSeq = baseStart;
      db.run(
        'INSERT INTO project_counters (year, nextSeq) VALUES (?, ?)',
        [year, nextSeq + 1],
        (insertErr) => {
          if (insertErr) {
            return callback(insertErr, null);
          }
          const projectNumber = `02-${year}-${nextSeq.toString().padStart(4, '0')}`;
          callback(null, projectNumber);
        }
      );
    } else {
      // Counter exists - use current value and increment
      const nextSeq = row.nextSeq;
      db.run(
        'UPDATE project_counters SET nextSeq = nextSeq + 1, updatedAt = CURRENT_TIMESTAMP WHERE year = ?',
        [year],
        (updateErr) => {
          if (updateErr) {
            return callback(updateErr, null);
          }
          const projectNumber = `02-${year}-${nextSeq.toString().padStart(4, '0')}`;
          callback(null, projectNumber);
        }
      );
    }
  });
}

// Create project (Admin only)
router.post('/', authenticate, requireAdmin, [
  body('projectName').notEmpty().trim(),
  body('customerEmails').optional().isArray(),
  body('customerEmails.*').optional().isEmail(),
  body('soilSpecs').optional().isObject(),
  body('concreteSpecs').optional().isObject()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { 
    projectName, 
    customerEmails,
    soilSpecs,
    concreteSpecs
  } = req.body;

  // Validate customerEmails if provided
  if (customerEmails && (!Array.isArray(customerEmails) || customerEmails.length === 0)) {
    return res.status(400).json({ error: 'customerEmails must be a non-empty array' });
  }

  // Validate no duplicate emails
  if (customerEmails) {
    const uniqueEmails = [...new Set(customerEmails)];
    if (uniqueEmails.length !== customerEmails.length) {
      return res.status(400).json({ error: 'Duplicate emails are not allowed' });
    }
  }

  // Generate project number using atomic counter
  generateProjectNumber((err, projectNumber) => {
    if (err) {
      console.error('Error generating project number:', err);
      return res.status(500).json({ error: 'Database error: Failed to generate project number' });
    }

    if (!projectNumber) {
      return res.status(500).json({ error: 'Failed to generate project number' });
    }

    // Check for duplicate (shouldn't happen with atomic counter, but safety check)
    db.get('SELECT id FROM projects WHERE projectNumber = ?', [projectNumber], (checkErr, row) => {
      if (checkErr) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (row) {
        // This should be extremely rare with atomic counter, but retry if it happens
        console.warn('Project number collision detected, retrying...');
        generateProjectNumber((retryErr, retryProjectNumber) => {
          if (retryErr || !retryProjectNumber) {
            return res.status(500).json({ error: 'Failed to generate unique project number' });
          }
          createProject(retryProjectNumber);
        });
      } else {
        createProject(projectNumber);
      }
    });
  });

  function createProject(projectNumber) {
    // Prepare data for insertion
    const customerEmailsJson = customerEmails && customerEmails.length > 0 
      ? JSON.stringify(customerEmails) 
      : null;
    const soilSpecsJson = soilSpecs && Object.keys(soilSpecs).length > 0 
      ? JSON.stringify(soilSpecs) 
      : null;
    const concreteSpecsJson = concreteSpecs && Object.keys(concreteSpecs).length > 0 
      ? JSON.stringify(concreteSpecs) 
      : null;

    // Create project
    db.run(
      `INSERT INTO projects (projectNumber, projectName, customerEmails, soilSpecs, concreteSpecs) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        projectNumber, 
        projectName, 
        customerEmailsJson,
        soilSpecsJson,
        concreteSpecsJson
      ],
      function(err) {
        if (err) {
          console.error('Error creating project:', err);
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Project number already exists' });
          }
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

        // Return created project
        db.get('SELECT * FROM projects WHERE id = ?', [projectId], (fetchErr, project) => {
          if (fetchErr) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Parse JSON fields for response
          parseProjectJSONFields(project);
          res.status(201).json(project);
        });
      }
    );
  }
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
        // Parse JSON fields for each project
        const parsedProjects = projects.map(p => parseProjectJSONFields(p));
        res.json(parsedProjects);
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
        // Parse JSON fields for each project
        const parsedProjects = projects.map(p => parseProjectJSONFields(p));
        res.json(parsedProjects);
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
          parseProjectJSONFields(project);
          res.json(project);
        }
      );
    } else {
      parseProjectJSONFields(project);
      res.json(project);
    }
  });
});

// Update project (Admin only)
router.put('/:id', authenticate, requireAdmin, [
  body('projectName').optional().notEmpty(),
  body('customerEmails').optional().isArray(),
  body('customerEmails.*').optional().isEmail(),
  body('soilSpecs').optional().isObject(),
  body('concreteSpecs').optional().isObject()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const projectId = req.params.id;
  const { 
    projectName, 
    customerEmails,
    soilSpecs,
    concreteSpecs
  } = req.body;

  // Validate customerEmails if provided
  if (customerEmails !== undefined && customerEmails !== null) {
    if (!Array.isArray(customerEmails) || customerEmails.length === 0) {
      return res.status(400).json({ error: 'customerEmails must be a non-empty array' });
    }
    const uniqueEmails = Array.from(new Set(customerEmails));
    if (uniqueEmails.length !== customerEmails.length) {
      return res.status(400).json({ error: 'Duplicate emails are not allowed' });
    }
  }

  const updates = [];
  const values = [];

  if (projectName !== undefined) {
    updates.push('projectName = ?');
    values.push(projectName);
  }
  if (customerEmails !== undefined && customerEmails !== null) {
    updates.push('customerEmails = ?');
    values.push(JSON.stringify(customerEmails));
  }
  if (soilSpecs !== undefined && soilSpecs !== null) {
    updates.push('soilSpecs = ?');
    values.push(JSON.stringify(soilSpecs));
  }
  if (concreteSpecs !== undefined && concreteSpecs !== null) {
    updates.push('concreteSpecs = ?');
    values.push(JSON.stringify(concreteSpecs));
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
        console.error('Error updating project:', err);
        console.error('SQL:', `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`);
        console.error('Values:', values);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
        if (err) {
          console.error('Error fetching updated project:', err);
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        parseProjectJSONFields(project);
        res.json(project);
      });
    }
  );
});

module.exports = router;

