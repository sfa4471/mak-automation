const express = require('express');
const db = require('../db');
const { supabase, isAvailable, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory } = require('../utils/pdfFileManager');

const router = express.Router();

// Helper function to parse JSON fields from project
// Handles both SQLite (JSON strings) and Supabase (JSONB objects)
function parseProjectJSONFields(project) {
  if (!project) return project;
  
  // customerEmails: can be string (SQLite) or array/object (Supabase)
  if (project.customerEmails !== null && project.customerEmails !== undefined) {
    if (typeof project.customerEmails === 'string') {
      try {
        project.customerEmails = JSON.parse(project.customerEmails);
      } catch (e) {
        project.customerEmails = [];
      }
    } else if (!Array.isArray(project.customerEmails)) {
      // If it's not a string and not an array, default to empty array
      project.customerEmails = [];
    }
  } else {
    project.customerEmails = [];
  }
  
  // soilSpecs: can be string (SQLite) or object (Supabase)
  if (project.soilSpecs !== null && project.soilSpecs !== undefined) {
    if (typeof project.soilSpecs === 'string') {
      try {
        project.soilSpecs = JSON.parse(project.soilSpecs);
      } catch (e) {
        project.soilSpecs = {};
      }
    } else if (typeof project.soilSpecs !== 'object' || Array.isArray(project.soilSpecs)) {
      // If it's not a string and not an object, default to empty object
      project.soilSpecs = {};
    }
  } else {
    project.soilSpecs = {};
  }
  
  // concreteSpecs: can be string (SQLite) or object (Supabase)
  if (project.concreteSpecs !== null && project.concreteSpecs !== undefined) {
    if (typeof project.concreteSpecs === 'string') {
      try {
        project.concreteSpecs = JSON.parse(project.concreteSpecs);
      } catch (e) {
        project.concreteSpecs = {};
      }
    } else if (typeof project.concreteSpecs !== 'object' || Array.isArray(project.concreteSpecs)) {
      // If it's not a string and not an object, default to empty object
      project.concreteSpecs = {};
    }
  } else {
    project.concreteSpecs = {};
  }
  
  return project;
}

// Generate project number: 02-YYYY-NNNN (with year-based sequence)
// Uses atomic counter to ensure uniqueness and handle concurrency
// Includes retry logic to handle race conditions and out-of-sync counters
async function generateProjectNumber() {
  const year = new Date().getFullYear();
  const baseStart = (year - 2022) * 1000 + 1;
  const maxRetries = 20;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let nextSeq;
      
      if (db.isSupabase()) {
        // Supabase: Get or create counter, then increment
        const { data: existingCounter, error: selectError } = await supabase
          .from('project_counters')
          .select('next_seq')
          .eq('year', year)
          .single();
        
        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }
        
        if (!existingCounter) {
          // First project for this year - try to insert
          nextSeq = baseStart;
          const { error: insertError } = await supabase
            .from('project_counters')
            .insert({ year, next_seq: nextSeq + 1 });
          
          // If insert fails due to race condition, fetch existing counter
          if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
              // Someone else created it - fetch and use it
              const { data: raceCounter, error: raceError } = await supabase
                .from('project_counters')
                .select('next_seq')
                .eq('year', year)
                .single();
              
              if (raceError) throw raceError;
              nextSeq = raceCounter.next_seq;
            } else {
              throw insertError;
            }
          }
        } else {
          nextSeq = existingCounter.next_seq;
        }
        
        // Atomically increment the counter
        // Note: Supabase JS client doesn't support true atomic increment,
        // so we use update and handle race conditions with retry logic
        const { error: updateError } = await supabase
          .from('project_counters')
          .update({ next_seq: nextSeq + 1, updated_at: new Date().toISOString() })
          .eq('year', year);
        
        if (updateError) {
          // If update failed, check if counter was already incremented (race condition)
          const { data: verifyCounter } = await supabase
            .from('project_counters')
            .select('next_seq')
            .eq('year', year)
            .single();
          
          if (verifyCounter && verifyCounter.next_seq > nextSeq) {
            // Counter was incremented by another request - use the new value for next iteration
            // We'll retry in the next loop iteration
            continue;
          } else {
            throw updateError;
          }
        }
      } else {
        // SQLite: Use atomic increment
        const sqliteDb = require('../database');
        nextSeq = await new Promise((resolve, reject) => {
          sqliteDb.serialize(() => {
            // Ensure counter exists
            sqliteDb.run(
              'INSERT OR IGNORE INTO project_counters (year, nextSeq) VALUES (?, ?)',
              [year, baseStart],
              (insertErr) => {
                if (insertErr) return reject(insertErr);
                
                // Atomically increment
                sqliteDb.run(
                  'UPDATE project_counters SET nextSeq = nextSeq + 1, updatedAt = CURRENT_TIMESTAMP WHERE year = ?',
                  [year],
                  (updateErr) => {
                    if (updateErr) return reject(updateErr);
                    
                    // Get the incremented value
                    sqliteDb.get(
                      'SELECT nextSeq FROM project_counters WHERE year = ?',
                      [year],
                      (selectErr, row) => {
                        if (selectErr) return reject(selectErr);
                        const usedSeq = row.nextSeq - 1; // The value we used
                        resolve(usedSeq);
                      }
                    );
                  }
                );
              }
            );
          });
        });
      }
      
      // Generate project number
      const projectNumber = `02-${year}-${nextSeq.toString().padStart(4, '0')}`;
      
      // Verify the project number doesn't already exist (handles out-of-sync counters)
      const existingProject = await db.get('projects', { projectNumber });
      if (!existingProject) {
        return projectNumber;
      }
      
      // Project number exists - counter is out of sync
      // The counter was already incremented above, so we just continue the loop
      // to get the next number (which will read the incremented counter value)
      console.warn(`Project number ${projectNumber} already exists (counter out of sync), retrying with next number...`);
      // Continue to next iteration - counter is already incremented, so next iteration will use nextSeq + 1
    } catch (error) {
      console.error(`Error generating project number (attempt ${attempt + 1}/${maxRetries}):`, error);
      if (attempt === maxRetries - 1) {
        throw new Error(`Failed to generate unique project number after ${maxRetries} attempts: ${error.message}`);
      }
      // Retry with small delay
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  
  throw new Error('Failed to generate project number after maximum retries');
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

    // Check for duplicate project name (case-sensitive, trimmed)
    const trimmedProjectName = projectName.trim();
    
    // Validate that project name is not empty after trimming
    if (!trimmedProjectName || trimmedProjectName.length === 0) {
      return res.status(400).json({ error: 'Project name cannot be empty' });
    }
    
    // Check for duplicate project name before creating
    const existingProjectByName = await db.get('projects', { projectName: trimmedProjectName });
    if (existingProjectByName) {
      console.log('Duplicate project name detected:', {
        requestedName: trimmedProjectName,
        existingId: existingProjectByName.id
      });
      return res.status(400).json({ error: 'Project name already exists' });
    }

    // Generate project number using atomic counter
    let projectNumber;
    try {
      projectNumber = await generateProjectNumber();
    } catch (genErr) {
      console.error('Error generating project number:', genErr);
      return res.status(500).json({ error: 'Database error: Failed to generate project number' });
    }

    if (!projectNumber) {
      return res.status(500).json({ error: 'Failed to generate project number' });
    }

    // Note: generateProjectNumber() already handles duplicate checking and retries
    // so we don't need to check again here

    // Prepare data for insertion
    // For SQLite, JSON fields need to be stringified; for Supabase, they should be objects/arrays
    const projectData = {
      projectNumber,
      projectName: trimmedProjectName
    };
    
    if (db.isSupabase()) {
      // Supabase: pass objects/arrays directly (will be stored as JSONB)
      projectData.customerEmails = customerEmails && customerEmails.length > 0 ? customerEmails : null;
      projectData.soilSpecs = soilSpecs && Object.keys(soilSpecs).length > 0 ? soilSpecs : null;
      projectData.concreteSpecs = concreteSpecs && Object.keys(concreteSpecs).length > 0 ? concreteSpecs : null;
    } else {
      // SQLite: stringify JSON fields
      projectData.customerEmails = customerEmails && customerEmails.length > 0 ? JSON.stringify(customerEmails) : null;
      projectData.soilSpecs = soilSpecs && Object.keys(soilSpecs).length > 0 ? JSON.stringify(soilSpecs) : null;
      projectData.concreteSpecs = concreteSpecs && Object.keys(concreteSpecs).length > 0 ? JSON.stringify(concreteSpecs) : null;
    }

    // Create project
    let project;
    try {
      project = await db.insert('projects', projectData);
    } catch (insertErr) {
      console.error('Error creating project:', insertErr);
      const errorMessage = insertErr.message || '';
      if (errorMessage.includes('UNIQUE') || errorMessage.includes('duplicate')) {
        if (errorMessage.toLowerCase().includes('project_name') || errorMessage.toLowerCase().includes('projectname')) {
          return res.status(400).json({ error: 'Project name already exists' });
        } else if (errorMessage.toLowerCase().includes('project_number') || errorMessage.toLowerCase().includes('projectnumber')) {
          return res.status(400).json({ error: 'Project number already exists' });
        }
        return res.status(400).json({ error: 'A project with this information already exists' });
      }
      return res.status(500).json({ error: 'Database error: ' + (insertErr.message || 'Unknown error') });
    }

    // Create project folder structure for PDF storage (use project number, not ID)
    try {
      await ensureProjectDirectory(projectNumber);
    } catch (folderError) {
      console.error('Error creating project folder:', folderError);
      // Continue even if folder creation fails
    }

    // Parse JSON fields for response
    parseProjectJSONFields(project);
    res.status(201).json(project);
  } catch (error) {
    console.error('Unexpected error creating project:', error);
    res.status(500).json({ error: 'Internal server error: ' + (error.message || 'Unknown error') });
  }
});

// Get all projects (Admin sees all, Technician sees assigned only)
router.get('/', authenticate, async (req, res) => {
  try {
    let projects;
    
    if (db.isSupabase()) {
      if (req.user.role === 'ADMIN') {
        // Admin: get all projects
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        projects = (data || []).map(keysToCamelCase);
      } else {
        // Technician: only projects with assigned tasks or work packages
        // First, get projects with assigned tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select('project_id')
          .eq('assigned_technician_id', req.user.id);
        
        if (tasksError) throw tasksError;
        
        // Then, get projects with assigned work packages
        const { data: wpData, error: wpError } = await supabase
          .from('workpackages')
          .select('project_id')
          .eq('assigned_to', req.user.id);
        
        if (wpError) throw wpError;
        
        // Combine unique project IDs
        const projectIds = [...new Set([
          ...(tasksData || []).map(t => t.project_id),
          ...(wpData || []).map(wp => wp.project_id)
        ])];
        
        if (projectIds.length === 0) {
          projects = [];
        } else {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .in('id', projectIds)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          projects = (data || []).map(keysToCamelCase);
        }
      }
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
      if (req.user.role === 'ADMIN') {
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT p.*, 
             (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
             FROM projects p ORDER BY p.createdAt DESC`,
            [],
            (err, rows) => {
              if (err) return reject(err);
              resolve(rows || []);
            }
          );
        });
      } else {
        // Technician: only projects with assigned work packages or tasks
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT DISTINCT p.* 
             FROM projects p
             WHERE p.id IN (
               SELECT DISTINCT projectId FROM workpackages WHERE assignedTo = ?
               UNION
               SELECT DISTINCT projectId FROM tasks WHERE assignedTechnicianId = ?
             )
             ORDER BY p.createdAt DESC`,
            [req.user.id, req.user.id],
            (err, rows) => {
              if (err) return reject(err);
              resolve(rows || []);
            }
          );
        });
      }
    }
    
    // Parse JSON fields for each project
    const parsedProjects = projects.map(p => parseProjectJSONFields(p));
    res.json(parsedProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Database error: ' + (error.message || 'Unknown error') });
  }
});

// Get single project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = await db.get('projects', { id: projectId });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access: Admin can see all, Technician only assigned
    if (req.user.role === 'TECHNICIAN') {
      let hasAccess = false;
      
      if (db.isSupabase()) {
        // Check if technician has tasks or work packages assigned to this project
        const [tasksResult, wpResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('id')
            .eq('project_id', projectId)
            .eq('assigned_technician_id', req.user.id)
            .limit(1),
          supabase
            .from('workpackages')
            .select('id')
            .eq('project_id', projectId)
            .eq('assigned_to', req.user.id)
            .limit(1)
        ]);
        
        hasAccess = (tasksResult.data && tasksResult.data.length > 0) || 
                   (wpResult.data && wpResult.data.length > 0);
      } else {
        // SQLite fallback - check both workpackages and tasks
        const sqliteDb = require('../database');
        const [wpCount, taskCount] = await Promise.all([
          new Promise((resolve, reject) => {
            sqliteDb.get(
              'SELECT COUNT(*) as count FROM workpackages WHERE projectId = ? AND assignedTo = ?',
              [projectId, req.user.id],
              (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.count : 0);
              }
            );
          }),
          new Promise((resolve, reject) => {
            sqliteDb.get(
              'SELECT COUNT(*) as count FROM tasks WHERE projectId = ? AND assignedTechnicianId = ?',
              [projectId, req.user.id],
              (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.count : 0);
              }
            );
          })
        ]);
        
        hasAccess = wpCount > 0 || taskCount > 0;
      }
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    parseProjectJSONFields(project);
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Database error: ' + (error.message || 'Unknown error') });
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
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

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

    // Build update data
    // For SQLite, JSON fields need to be stringified; for Supabase, they should be objects/arrays
    const updateData = {};
    
    if (projectName !== undefined) {
      updateData.projectName = projectName.trim();
    }
    if (customerEmails !== undefined && customerEmails !== null) {
      if (db.isSupabase()) {
        updateData.customerEmails = customerEmails;
      } else {
        updateData.customerEmails = JSON.stringify(customerEmails);
      }
    }
    if (soilSpecs !== undefined && soilSpecs !== null) {
      if (db.isSupabase()) {
        updateData.soilSpecs = soilSpecs;
      } else {
        updateData.soilSpecs = JSON.stringify(soilSpecs);
      }
    }
    if (concreteSpecs !== undefined && concreteSpecs !== null) {
      if (db.isSupabase()) {
        updateData.concreteSpecs = concreteSpecs;
      } else {
        updateData.concreteSpecs = JSON.stringify(concreteSpecs);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Update project
    const changes = await db.update('projects', updateData, { id: projectId });
    
    if (changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch updated project
    const project = await db.get('projects', { id: projectId });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    parseProjectJSONFields(project);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Database error: ' + (error.message || 'Unknown error') });
  }
});

module.exports = router;

