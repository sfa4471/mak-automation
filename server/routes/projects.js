const express = require('express');
const db = require('../db');
const { supabase, isAvailable, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory } = require('../utils/pdfFileManager');

const router = express.Router();

// Helper function to parse JSON fields from project
// Handles both snake_case (from Supabase before conversion) and camelCase (after conversion)
function parseProjectJSONFields(project) {
  if (!project) return project;
  
  // Handle customerEmails (camelCase) or customer_emails (snake_case)
  const customerEmailsField = project.customerEmails !== undefined ? 'customerEmails' : 
                              project.customer_emails !== undefined ? 'customer_emails' : null;
  
  if (customerEmailsField) {
    const value = project[customerEmailsField];
    if (typeof value === 'string') {
      try {
        project.customerEmails = JSON.parse(value);
      } catch (e) {
        project.customerEmails = [];
      }
    } else if (Array.isArray(value)) {
      project.customerEmails = value;
    } else {
      project.customerEmails = [];
    }
    // Remove snake_case version if it exists
    if (customerEmailsField === 'customer_emails') {
      delete project.customer_emails;
    }
  } else {
    project.customerEmails = [];
  }
  
  // Handle soilSpecs (camelCase) or soil_specs (snake_case)
  const soilSpecsField = project.soilSpecs !== undefined ? 'soilSpecs' : 
                          project.soil_specs !== undefined ? 'soil_specs' : null;
  
  if (soilSpecsField) {
    const value = project[soilSpecsField];
    if (typeof value === 'string') {
      try {
        project.soilSpecs = JSON.parse(value);
      } catch (e) {
        project.soilSpecs = {};
      }
    } else if (typeof value === 'object' && value !== null) {
      project.soilSpecs = value;
    } else {
      project.soilSpecs = {};
    }
    // Remove snake_case version if it exists
    if (soilSpecsField === 'soil_specs') {
      delete project.soil_specs;
    }
  } else {
    project.soilSpecs = {};
  }
  
  // Handle concreteSpecs (camelCase) or concrete_specs (snake_case)
  const concreteSpecsField = project.concreteSpecs !== undefined ? 'concreteSpecs' : 
                              project.concrete_specs !== undefined ? 'concrete_specs' : null;
  
  if (concreteSpecsField) {
    const value = project[concreteSpecsField];
    if (typeof value === 'string') {
      try {
        project.concreteSpecs = JSON.parse(value);
      } catch (e) {
        project.concreteSpecs = {};
      }
    } else if (typeof value === 'object' && value !== null) {
      project.concreteSpecs = value;
    } else {
      project.concreteSpecs = {};
    }
    // Remove snake_case version if it exists
    if (concreteSpecsField === 'concrete_specs') {
      delete project.concrete_specs;
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
    if (db.isSupabase()) {
      // Use Supabase with direct PostgreSQL operations
      const { supabase } = require('../db/supabase');
      
      // Try to get existing counter
      let { data: counter, error: getError } = await supabase
        .from('project_counters')
        .select('*')
        .eq('year', year)
        .single();
      
      let currentSeq;
      
      if (getError && getError.code === 'PGRST116') {
        // Counter doesn't exist - create it
        currentSeq = baseStart;
        const { data: inserted, error: insertError } = await supabase
          .from('project_counters')
          .insert({
            year: year,
            next_seq: baseStart + 1,
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (insertError) {
          // If insert fails (race condition - another request created it), fetch it
          const { data: retryCounter, error: retryError } = await supabase
            .from('project_counters')
            .select('*')
            .eq('year', year)
            .single();
          
          if (retryError) {
            console.error('Error creating/retrieving project counter:', retryError);
            throw new Error(`Failed to create project counter: ${retryError.message}`);
          }
          currentSeq = retryCounter.next_seq || baseStart;
        }
      } else if (getError) {
        console.error('Error getting project counter:', getError);
        throw new Error(`Failed to get project counter: ${getError.message}`);
      } else {
        // Counter exists
        currentSeq = counter.next_seq || baseStart;
      }
      
      // Increment atomically - use the current value, then update
      const { data: updated, error: updateError } = await supabase
        .from('project_counters')
        .update({
          next_seq: currentSeq + 1,
          updated_at: new Date().toISOString()
        })
        .eq('year', year)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating project counter:', updateError);
        throw new Error(`Failed to update project counter: ${updateError.message}`);
      }
      
      const projectNumber = `02-${year}-${currentSeq.toString().padStart(4, '0')}`;
      return projectNumber;
    } else {
      // SQLite fallback - ensure table exists first
      const sqliteDb = require('../database');
      
      // Check if table exists, create if not
      await new Promise((resolve, reject) => {
        sqliteDb.run(`
          CREATE TABLE IF NOT EXISTS project_counters (
            year INTEGER PRIMARY KEY,
            nextSeq INTEGER NOT NULL DEFAULT 1,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Get or create counter
      let counter = await new Promise((resolve, reject) => {
        sqliteDb.get(
          'SELECT * FROM project_counters WHERE year = ?',
          [year],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
      
      if (!counter) {
        // Create counter - use INSERT OR IGNORE to handle race conditions
        await new Promise((resolve, reject) => {
          sqliteDb.run(
            'INSERT OR IGNORE INTO project_counters (year, nextSeq) VALUES (?, ?)',
            [year, baseStart + 1],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        // Re-fetch to get the actual value
        counter = await new Promise((resolve, reject) => {
          sqliteDb.get(
            'SELECT * FROM project_counters WHERE year = ?',
            [year],
            (err, row) => {
              if (err) reject(err);
              else resolve(row || null);
            }
          );
        });
      }
      
      if (!counter) {
        throw new Error('Failed to create or retrieve project counter');
      }
      
      // Increment atomically
      const currentSeq = counter.nextSeq || baseStart;
      await new Promise((resolve, reject) => {
        sqliteDb.run(
          'UPDATE project_counters SET nextSeq = nextSeq + 1, updatedAt = CURRENT_TIMESTAMP WHERE year = ?',
          [year],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      const projectNumber = `02-${year}-${currentSeq.toString().padStart(4, '0')}`;
      return projectNumber;
    }
  } catch (err) {
    console.error('Error in generateProjectNumber:', err);
    console.error('Stack:', err.stack);
    throw new Error(`Failed to generate project number: ${err.message}`);
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
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        isSupabase: db.isSupabase()
      });
      
      // Provide more helpful error message
      let errorMessage = 'Database error: Failed to generate project number';
      if (err.message && err.message.includes('relation') && err.message.includes('does not exist')) {
        errorMessage = 'Database error: project_counters table does not exist. Please run database migrations.';
      } else if (err.message) {
        errorMessage = `Database error: ${err.message}`;
      }
      
      return res.status(500).json({ error: errorMessage });
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
    // Always include specs objects (even if empty) to ensure they're saved
    const projectData = {
      projectNumber,
      projectName,
      customerEmails: customerEmails && customerEmails.length > 0 ? customerEmails : [],
      soilSpecs: soilSpecs || {},
      concreteSpecs: concreteSpecs || {}
    };
    
    // Debug: Log what we're saving
    console.log('💾 Saving project data:', {
      projectNumber,
      projectName,
      customerEmailsCount: projectData.customerEmails.length,
      soilSpecsKeys: Object.keys(projectData.soilSpecs),
      soilSpecs: projectData.soilSpecs,
      concreteSpecsKeys: Object.keys(projectData.concreteSpecs),
      concreteSpecs: projectData.concreteSpecs
    });

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
        
        if (error) {
          console.error('Error fetching projects from Supabase:', error);
          throw error;
        }
        
        // Convert snake_case to camelCase and get work package counts
        projects = await Promise.all((data || []).map(async (project) => {
          // Convert snake_case keys to camelCase
          const camelProject = keysToCamelCase(project);
          
          // Get work package count
          const { count } = await supabase
            .from('workpackages')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id);
          
          return {
            ...camelProject,
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
        
        if (error) {
          console.error('Error fetching technician projects from Supabase:', error);
          throw error;
        }
        
        // Get unique projects (Supabase might return duplicates with joins)
        // Convert snake_case to camelCase
        const projectMap = new Map();
        (data || []).forEach(item => {
          if (!projectMap.has(item.id)) {
            const camelItem = keysToCamelCase(item);
            // Remove workpackages from the project object
            delete camelItem.workpackages;
            projectMap.set(item.id, camelItem);
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
    
    // Log for debugging (remove in production if too verbose)
    if (parsedProjects.length > 0) {
      console.log(`✅ Successfully fetched ${parsedProjects.length} project(s) for ${req.user.role}`);
    } else {
      console.log(`ℹ️  No projects found for ${req.user.role} (this may be normal if no projects exist)`);
    }
    
    res.json(parsedProjects);
  } catch (err) {
    console.error('❌ Error fetching projects:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      userRole: req.user?.role,
      isSupabase: db.isSupabase()
    });
    res.status(500).json({ 
      error: 'Database error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
    // Always include specs if provided (even if empty object) to ensure they're saved/updated
    if (soilSpecs !== undefined && soilSpecs !== null) {
      updateData.soilSpecs = soilSpecs;
    }
    if (concreteSpecs !== undefined && concreteSpecs !== null) {
      updateData.concreteSpecs = concreteSpecs;
    }
    
    // Debug: Log what we're updating
    console.log('💾 Updating project data:', {
      projectId,
      updateDataKeys: Object.keys(updateData),
      soilSpecsKeys: updateData.soilSpecs ? Object.keys(updateData.soilSpecs) : [],
      soilSpecs: updateData.soilSpecs,
      concreteSpecsKeys: updateData.concreteSpecs ? Object.keys(updateData.concreteSpecs) : [],
      concreteSpecs: updateData.concreteSpecs
    });

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

