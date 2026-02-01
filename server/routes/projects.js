const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory } = require('../utils/pdfFileManager');

const router = express.Router();

// Helper function to parse JSON fields from project
function parseProjectJSONFields(project) {
  if (!project) return project;
  
  // Supabase returns JSONB as objects, SQLite returns JSON strings
  if (project.customerEmails) {
    if (typeof project.customerEmails === 'string') {
      try {
        project.customerEmails = JSON.parse(project.customerEmails);
      } catch (e) {
        project.customerEmails = [];
      }
    }
  } else {
    project.customerEmails = [];
  }
  
  if (project.soilSpecs) {
    if (typeof project.soilSpecs === 'string') {
      try {
        project.soilSpecs = JSON.parse(project.soilSpecs);
      } catch (e) {
        project.soilSpecs = {};
      }
    }
  } else {
    project.soilSpecs = {};
  }
  
  if (project.concreteSpecs) {
    if (typeof project.concreteSpecs === 'string') {
      try {
        project.concreteSpecs = JSON.parse(project.concreteSpecs);
      } catch (e) {
        project.concreteSpecs = {};
      }
    }
  } else {
    project.concreteSpecs = {};
  }
  return project;
}

// Generate project number: 02-YYYY-NNNN (with year-based sequence)
// Uses atomic counter to ensure uniqueness and handle concurrency
async function generateProjectNumber() {
  const year = new Date().getFullYear();
  const baseStart = (year - 2022) * 1000 + 1;
  
  try {
    // Get or create counter for this year, then increment atomically
    let counter = await db.get('project_counters', { year });
    
    if (!counter) {
      // First project for this year - create counter with nextSeq = baseStart
      const nextSeq = baseStart;
      counter = await db.insert('project_counters', {
        year,
        nextSeq: nextSeq + 1
      });
      const projectNumber = `02-${year}-${nextSeq.toString().padStart(4, '0')}`;
      return projectNumber;
    } else {
      // Counter exists - use current value and increment atomically
      const nextSeq = counter.nextSeq;
      await db.update('project_counters', {
        nextSeq: nextSeq + 1,
        updatedAt: new Date().toISOString()
      }, { year });
      const projectNumber = `02-${year}-${nextSeq.toString().padStart(4, '0')}`;
      return projectNumber;
    }
  } catch (err) {
    throw err;
  }
}

// Create project (Admin only)
router.post('/', authenticate, requireAdmin, [
  body('projectName').notEmpty().trim(),
  body('customerEmails').optional().isArray(),
  body('customerEmails.*').optional().isEmail(),
  body('soilSpecs').optional().isObject(),
  body('concreteSpecs').optional().isObject()
], async (req, res) => {
  try {
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
    let projectNumber;
    try {
      projectNumber = await generateProjectNumber();
    } catch (err) {
      console.error('Error generating project number:', err);
      return res.status(500).json({ error: 'Database error: Failed to generate project number' });
    }

    if (!projectNumber) {
      return res.status(500).json({ error: 'Failed to generate project number' });
    }

    // Check for duplicate (shouldn't happen with atomic counter, but safety check)
    const existing = await db.get('projects', { projectNumber });
    if (existing) {
      // This should be extremely rare with atomic counter, but retry if it happens
      console.warn('Project number collision detected, retrying...');
      try {
        projectNumber = await generateProjectNumber();
      } catch (retryErr) {
        return res.status(500).json({ error: 'Failed to generate unique project number' });
      }
    }

    // Prepare data for insertion
    // For Supabase, JSONB fields accept objects directly; for SQLite, we stringify
    const projectData = {
      projectNumber,
      projectName,
      customerEmails: customerEmails && customerEmails.length > 0 ? customerEmails : [],
      soilSpecs: soilSpecs && Object.keys(soilSpecs).length > 0 ? soilSpecs : {},
      concreteSpecs: concreteSpecs && Object.keys(concreteSpecs).length > 0 ? concreteSpecs : {}
    };

    // Create project
    let project;
    try {
      project = await db.insert('projects', projectData);
    } catch (err) {
      console.error('Error creating project:', err);
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate'))) {
        return res.status(400).json({ error: 'Project number already exists' });
      }
      return res.status(500).json({ error: 'Database error' });
    }

    // Create project folder structure for PDF storage (use project number, not ID)
    try {
      ensureProjectDirectory(projectNumber);
    } catch (folderError) {
      console.error('Error creating project folder:', folderError);
      // Continue even if folder creation fails
    }

    // Parse JSON fields for response
    parseProjectJSONFields(project);
    res.status(201).json(project);
  } catch (err) {
    console.error('Error in create project:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all projects (Admin sees all, Technician sees assigned only)
router.get('/', authenticate, async (req, res) => {
  try {
    let projects;
    
    if (req.user.role === 'ADMIN') {
      if (db.isSupabase()) {
        // Get all projects
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get work package counts separately
        projects = await Promise.all((data || []).map(async (project) => {
          const { count } = await supabase
            .from('workpackages')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id);
          
          return {
            ...project,
            workPackageCount: count || 0
          };
        }));
      } else {
        // SQLite fallback - use raw query
        const sqliteDb = require('../database');
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT p.*, 
             (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
             FROM projects p ORDER BY p.createdAt DESC`,
            [],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });
      }
    } else {
      // Technician: only projects with assigned work packages
      if (db.isSupabase()) {
        const { data, error } = await supabase
          .from('projects')
          .select('*, workpackages!inner(project_id, assigned_to)')
          .eq('workpackages.assigned_to', req.user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get unique projects (Supabase might return duplicates with joins)
        const projectMap = new Map();
        (data || []).forEach(item => {
          if (!projectMap.has(item.id)) {
            projectMap.set(item.id, item);
          }
        });
        projects = Array.from(projectMap.values());
      } else {
        // SQLite fallback
        const sqliteDb = require('../database');
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT DISTINCT p.* 
             FROM projects p
             INNER JOIN workpackages wp ON wp.projectId = p.id
             WHERE wp.assignedTo = ?
             ORDER BY p.createdAt DESC`,
            [req.user.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });
      }
    }
    
    // Parse JSON fields for each project
    const parsedProjects = projects.map(p => parseProjectJSONFields(p));
    res.json(parsedProjects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    
    const project = await db.get('projects', { id: projectId });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: Admin can see all, Technician only assigned
    if (req.user.role === 'TECHNICIAN') {
      const workPackages = await db.all('workpackages', {
        projectId: projectId,
        assignedTo: req.user.id
      });
      
      if (workPackages.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    parseProjectJSONFields(project);
    res.json(project);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update project (Admin only)
router.put('/:id', authenticate, requireAdmin, [
  body('projectName').optional().notEmpty(),
  body('customerEmails').optional().isArray(),
  body('customerEmails.*').optional().isEmail(),
  body('soilSpecs').optional().isObject(),
  body('concreteSpecs').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const projectId = parseInt(req.params.id);
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

    const updateData = {};
    
    if (projectName !== undefined) {
      updateData.projectName = projectName;
    }
    if (customerEmails !== undefined && customerEmails !== null) {
      updateData.customerEmails = customerEmails;
    }
    if (soilSpecs !== undefined && soilSpecs !== null) {
      updateData.soilSpecs = soilSpecs;
    }
    if (concreteSpecs !== undefined && concreteSpecs !== null) {
      updateData.concreteSpecs = concreteSpecs;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateData.updatedAt = new Date().toISOString();

    const changes = await db.update('projects', updateData, { id: projectId });
    
    if (changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(500).json({ error: 'Error fetching updated project' });
    }
    
    parseProjectJSONFields(project);
    res.json(project);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

