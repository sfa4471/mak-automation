const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { supabase, isAvailable, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory, getProjectDrawingsDir } = require('../utils/pdfFileManager');

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

  // customerDetails: JSONB (Supabase) or string (SQLite)
  if (project.customerDetails !== null && project.customerDetails !== undefined) {
    if (typeof project.customerDetails === 'string') {
      try {
        project.customerDetails = JSON.parse(project.customerDetails);
      } catch (e) {
        project.customerDetails = {};
      }
    } else if (typeof project.customerDetails !== 'object' || Array.isArray(project.customerDetails)) {
      project.customerDetails = {};
    }
  } else {
    project.customerDetails = {};
  }

  // ccEmails / bccEmails: array (Supabase) or string (SQLite)
  if (project.ccEmails !== null && project.ccEmails !== undefined) {
    if (typeof project.ccEmails === 'string') {
      try {
        project.ccEmails = JSON.parse(project.ccEmails);
      } catch (e) {
        project.ccEmails = [];
      }
    }
    if (!Array.isArray(project.ccEmails)) project.ccEmails = [];
  } else {
    project.ccEmails = [];
  }
  if (project.bccEmails !== null && project.bccEmails !== undefined) {
    if (typeof project.bccEmails === 'string') {
      try {
        project.bccEmails = JSON.parse(project.bccEmails);
      } catch (e) {
        project.bccEmails = [];
      }
    }
    if (!Array.isArray(project.bccEmails)) project.bccEmails = [];
  } else {
    project.bccEmails = [];
  }

  // drawings: JSONB array of { filename, displayName? }
  if (project.drawings !== null && project.drawings !== undefined) {
    if (typeof project.drawings === 'string') {
      try {
        project.drawings = JSON.parse(project.drawings);
      } catch (e) {
        project.drawings = [];
      }
    }
    if (!Array.isArray(project.drawings)) project.drawings = [];
  } else {
    project.drawings = [];
  }

  return project;
}

/**
 * Load project by id and enforce tenant + technician access. Returns project or sends error and returns null.
 */
async function loadProjectWithAccess(req, res, projectId) {
  const id = parseInt(projectId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return null;
  }
  const project = await db.get('projects', { id });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  if (db.isSupabase()) {
    const tenantId = req.user.tenantId ?? req.user.tenant_id ?? null;
    if (tenantId != null) {
      const projectTenantId = project.tenant_id ?? project.tenantId;
      if (projectTenantId !== tenantId) {
        res.status(404).json({ error: 'Project not found' });
        return null;
      }
    }
  }
  if (req.user.role === 'TECHNICIAN') {
    let hasAccess = false;
    if (db.isSupabase()) {
      const [tasksResult, wpResult] = await Promise.all([
        supabase.from('tasks').select('id').eq('project_id', id).eq('assigned_technician_id', req.user.id).limit(1),
        supabase.from('workpackages').select('id').eq('project_id', id).eq('assigned_to', req.user.id).limit(1)
      ]);
      hasAccess = (tasksResult.data && tasksResult.data.length > 0) || (wpResult.data && wpResult.data.length > 0);
    } else {
      const sqliteDb = require('../database');
      const [wpCount, taskCount] = await Promise.all([
        new Promise((resolve, reject) => {
          sqliteDb.get('SELECT COUNT(*) as count FROM workpackages WHERE projectId = ? AND assignedTo = ?', [id, req.user.id], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.count : 0);
          });
        }),
        new Promise((resolve, reject) => {
          sqliteDb.get('SELECT COUNT(*) as count FROM tasks WHERE projectId = ? AND assignedTechnicianId = ?', [id, req.user.id], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.count : 0);
          });
        })
      ]);
      hasAccess = wpCount > 0 || taskCount > 0;
    }
    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied' });
      return null;
    }
  }
  parseProjectJSONFields(project);
  return project;
}

// Generate project number: PREFIX-YYYY-NNNN (with year-based sequence)
// When Supabase + tenantId: uses tenant_project_counters and tenant's prefix (branch multi-tenant).
// Otherwise: uses project_counters (main or legacy).
async function generateProjectNumber(tenantId = null) {
  const year = new Date().getFullYear();
  const baseStart = (year - 2022) * 1000 + 1;
  const maxRetries = 20;
  let prefix = '02';

  if (db.isSupabase() && tenantId != null) {
    const tenant = await db.get('tenants', { id: tenantId });
    if (tenant && (tenant.project_number_prefix || tenant.projectNumberPrefix)) {
      prefix = tenant.project_number_prefix || tenant.projectNumberPrefix;
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let nextSeq;

      if (db.isSupabase() && tenantId != null) {
        // Branch multi-tenant: use tenant_project_counters
        const { data: existingCounter, error: selectError } = await supabase
          .from('tenant_project_counters')
          .select('next_seq')
          .eq('tenant_id', tenantId)
          .eq('year', year)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (!existingCounter) {
          nextSeq = 1;
          const { error: insertError } = await supabase
            .from('tenant_project_counters')
            .insert({ tenant_id: tenantId, year, next_seq: 2 });

          if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
              const { data: raceCounter, error: raceError } = await supabase
                .from('tenant_project_counters')
                .select('next_seq')
                .eq('tenant_id', tenantId)
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

        const { error: updateError } = await supabase
          .from('tenant_project_counters')
          .update({ next_seq: nextSeq + 1, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('year', year);

        if (updateError) {
          const { data: verifyCounter } = await supabase
            .from('tenant_project_counters')
            .select('next_seq')
            .eq('tenant_id', tenantId)
            .eq('year', year)
            .single();
          if (verifyCounter && verifyCounter.next_seq > nextSeq) continue;
          throw updateError;
        }

        const projectNumber = `${prefix}-${year}-${nextSeq.toString().padStart(4, '0')}`;
        const existConditions = { project_number: projectNumber };
        existConditions.tenant_id = tenantId;
        const existingProject = await db.get('projects', existConditions);
        if (!existingProject) return projectNumber;
        console.warn(`Project number ${projectNumber} already exists (counter out of sync), retrying...`);
        continue;
      }

      if (db.isSupabase()) {
        // Supabase without tenantId (legacy): use project_counters
        const { data: existingCounter, error: selectError } = await supabase
          .from('project_counters')
          .select('next_seq')
          .eq('year', year)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (!existingCounter) {
          nextSeq = baseStart;
          const { error: insertError } = await supabase
            .from('project_counters')
            .insert({ year, next_seq: nextSeq + 1 });

          if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
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

        const { error: updateError } = await supabase
          .from('project_counters')
          .update({ next_seq: nextSeq + 1, updated_at: new Date().toISOString() })
          .eq('year', year);

        if (updateError) {
          const { data: verifyCounter } = await supabase
            .from('project_counters')
            .select('next_seq')
            .eq('year', year)
            .single();
          if (verifyCounter && verifyCounter.next_seq > nextSeq) continue;
          throw updateError;
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
  body('projectNumber').notEmpty().trim(),
  body('projectName').notEmpty().trim(),
  body('customerEmails').optional().isArray(),
  body('customerEmails.*').optional().isEmail(),
  body('ccEmails').optional().isArray(),
  body('ccEmails.*').optional().isEmail(),
  body('bccEmails').optional().isArray(),
  body('bccEmails.*').optional().isEmail(),
  body('customerDetails').optional().isObject(),
  body('soilSpecs').optional().isObject(),
  body('concreteSpecs').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      projectNumber: rawProjectNumber, 
      projectName, 
      customerEmails,
      ccEmails,
      bccEmails,
      customerDetails,
      soilSpecs,
      concreteSpecs
    } = req.body;

    const trimmedProjectNumber = (rawProjectNumber || '').trim();
    if (!trimmedProjectNumber) {
      return res.status(400).json({ error: 'Project number is required' });
    }

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
    
    // Resolve tenant for Supabase multi-tenant (before duplicate check and project number)
    let tenantIdForCreate = null;
    if (db.isSupabase()) {
      const user = await db.get('users', { id: req.user.id });
      tenantIdForCreate = user && (user.tenant_id != null || user.tenantId != null)
        ? (user.tenant_id ?? user.tenantId)
        : null;
    }

    // Check for duplicate project name before creating (per-tenant when Supabase)
    const nameCheckConditions = { projectName: trimmedProjectName };
    if (db.isSupabase() && tenantIdForCreate != null) nameCheckConditions.tenant_id = tenantIdForCreate;
    const existingProjectByName = await db.get('projects', nameCheckConditions);
    if (existingProjectByName) {
      console.log('Duplicate project name detected:', {
        requestedName: trimmedProjectName,
        existingId: existingProjectByName.id
      });
      return res.status(400).json({ error: 'Project name already exists' });
    }

    // Check for duplicate project number (per-tenant when Supabase)
    const numberCheckConditions = { projectNumber: trimmedProjectNumber };
    if (db.isSupabase() && tenantIdForCreate != null) numberCheckConditions.tenant_id = tenantIdForCreate;
    const existingProjectByNumber = await db.get('projects', numberCheckConditions);
    if (existingProjectByNumber) {
      return res.status(400).json({ error: 'Project number already exists for this organization' });
    }

    // Use client-provided project number (folder and DB)
    const projectNumber = trimmedProjectNumber;

    // Prepare data for insertion
    const projectData = {
      projectNumber,
      projectName: trimmedProjectName
    };

    if (db.isSupabase()) {
      if (tenantIdForCreate != null) projectData.tenant_id = tenantIdForCreate;
      // Supabase: pass objects/arrays directly (will be stored as JSONB)
      projectData.customerEmails = customerEmails && customerEmails.length > 0 ? customerEmails : null;
      projectData.ccEmails = ccEmails && ccEmails.length > 0 ? ccEmails : null;
      projectData.bccEmails = bccEmails && bccEmails.length > 0 ? bccEmails : null;
      projectData.customerDetails = customerDetails && Object.keys(customerDetails).length > 0 ? customerDetails : null;
      projectData.soilSpecs = soilSpecs && Object.keys(soilSpecs).length > 0 ? soilSpecs : null;
      projectData.concreteSpecs = concreteSpecs && Object.keys(concreteSpecs).length > 0 ? concreteSpecs : null;
    } else {
      // SQLite: stringify JSON fields (no customerDetails/ccEmails/bccEmails columns in legacy schema)
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
      const tenantId = project && (project.tenant_id != null || project.tenantId != null)
        ? (project.tenant_id ?? project.tenantId)
        : null;
      await ensureProjectDirectory(projectNumber, tenantId);
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

// Get all projects (Admin sees all in their tenant, Technician sees assigned only in their tenant)
router.get('/', authenticate, async (req, res) => {
  try {
    let projects;
    const tenantId = req.user.tenantId ?? req.user.tenant_id ?? null;

    if (db.isSupabase()) {
      if (req.user.role === 'ADMIN') {
        // Admin: get projects for current tenant only (multi-tenant isolation)
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (tenantId != null) query = query.eq('tenant_id', tenantId);
        const { data, error } = await query;
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
          let techQuery = supabase
            .from('projects')
            .select('*')
            .in('id', projectIds)
            .order('created_at', { ascending: false });
          if (tenantId != null) techQuery = techQuery.eq('tenant_id', tenantId);
          const { data, error } = await techQuery;
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

    if (db.isSupabase()) {
      const tenantId = req.user.tenantId ?? req.user.tenant_id ?? null;
      if (tenantId != null) {
        const projectTenantId = project.tenant_id ?? project.tenantId;
        if (projectTenantId !== tenantId) {
          return res.status(404).json({ error: 'Project not found' });
        }
      }
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
  body('ccEmails').optional().isArray(),
  body('ccEmails.*').optional().isEmail(),
  body('bccEmails').optional().isArray(),
  body('bccEmails.*').optional().isEmail(),
  body('customerDetails').optional().isObject(),
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
      ccEmails,
      bccEmails,
      customerDetails,
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
    if (ccEmails !== undefined && ccEmails !== null && db.isSupabase()) {
      updateData.ccEmails = ccEmails;
    }
    if (bccEmails !== undefined && bccEmails !== null && db.isSupabase()) {
      updateData.bccEmails = bccEmails;
    }
    if (customerDetails !== undefined && customerDetails !== null && db.isSupabase()) {
      updateData.customerDetails = customerDetails;
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

    const existingProject = await db.get('projects', { id: projectId });
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (db.isSupabase()) {
      const tenantId = req.user.tenantId ?? req.user.tenant_id ?? null;
      if (tenantId != null) {
        const projectTenantId = existingProject.tenant_id ?? existingProject.tenantId;
        if (projectTenantId !== tenantId) {
          return res.status(404).json({ error: 'Project not found' });
        }
      }
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

    if (db.isSupabase()) {
      const tenantId = req.user.tenantId ?? req.user.tenant_id ?? null;
      if (tenantId != null) {
        const projectTenantId = project.tenant_id ?? project.tenantId;
        if (projectTenantId !== tenantId) {
          return res.status(404).json({ error: 'Project not found' });
        }
      }
    }

    parseProjectJSONFields(project);
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Database error: ' + (error.message || 'Unknown error') });
  }
});

// --- Project drawings (PDF upload / list / serve) ---
const MAX_DRAWING_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_DRAWINGS = 10;

const drawingsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DRAWING_SIZE, files: MAX_DRAWINGS },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || (file.originalname && file.originalname.toLowerCase().endsWith('.pdf'));
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  }
});

// Sanitize filename for storage (no path separators or traversal)
function safeDrawingFilename(name) {
  const base = path.basename(name || 'drawing').replace(/\.pdf$/i, '') || 'drawing';
  return base.replace(/[\\/:*?"<>|]/g, '_') + '.pdf';
}

// POST /projects/:id/drawings - upload PDF drawings (Admin only)
router.post('/:id/drawings', authenticate, requireAdmin, (req, res, next) => {
  drawingsUpload.array('drawings', MAX_DRAWINGS)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 20MB per file.' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Max ${MAX_DRAWINGS} files per upload.` });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const project = await loadProjectWithAccess(req, res, req.params.id);
    if (!project) return;

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    await ensureProjectDirectory(project.projectNumber, project.tenant_id ?? project.tenantId ?? null);
    const drawingsDir = await getProjectDrawingsDir(project.projectNumber, project.tenant_id ?? project.tenantId ?? null);
    if (!fs.existsSync(drawingsDir)) fs.mkdirSync(drawingsDir, { recursive: true });

    const existing = Array.isArray(project.drawings) ? project.drawings : [];
    const added = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const baseName = (file.originalname && path.basename(file.originalname)) || `drawing-${i + 1}`;
      const storedName = `${project.projectNumber}_${existing.length + added.length + 1}_${safeDrawingFilename(baseName)}`;
      const filePath = path.join(drawingsDir, storedName);
      fs.writeFileSync(filePath, file.buffer);
      const displayName = baseName.replace(/\.pdf$/i, '');
      added.push({ filename: storedName, displayName });
    }

    const newDrawings = [...existing, ...added];
    const updatePayload = db.isSupabase() ? { drawings: newDrawings } : { drawings: JSON.stringify(newDrawings) };
    await db.update('projects', updatePayload, { id: project.id });

    const updated = await db.get('projects', { id: project.id });
    parseProjectJSONFields(updated);
    res.status(201).json({ drawings: updated.drawings });
  } catch (error) {
    console.error('Error uploading project drawings:', error);
    res.status(500).json({ error: 'Failed to upload drawings: ' + (error.message || 'Unknown error') });
  }
});

// GET /projects/:id/drawings - list drawings (same access as project)
router.get('/:id/drawings', authenticate, async (req, res) => {
  try {
    const project = await loadProjectWithAccess(req, res, req.params.id);
    if (!project) return;
    res.json({ drawings: project.drawings || [] });
  } catch (error) {
    console.error('Error listing project drawings:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /projects/:id/drawings/:filename - serve one drawing PDF (same access as project)
router.get('/:id/drawings/:filename', authenticate, async (req, res) => {
  try {
    const project = await loadProjectWithAccess(req, res, req.params.id);
    if (!project) return;

    const rawFilename = req.params.filename;
    if (!rawFilename || rawFilename.includes('..') || path.isAbsolute(rawFilename) || rawFilename.includes(path.sep)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const list = project.drawings || [];
    const entry = list.find(d => d.filename === rawFilename);
    if (!entry) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    const drawingsDir = await getProjectDrawingsDir(project.projectNumber, project.tenant_id ?? project.tenantId ?? null);
    const filePath = path.join(drawingsDir, rawFilename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(entry.displayName || entry.filename)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error serving project drawing:', error);
    res.status(500).json({ error: 'Failed to load drawing' });
  }
});

// DELETE /projects/:id/drawings/:filename - remove one drawing (Admin only)
router.delete('/:id/drawings/:filename', authenticate, requireAdmin, async (req, res) => {
  try {
    const project = await loadProjectWithAccess(req, res, req.params.id);
    if (!project) return;

    const rawFilename = req.params.filename;
    if (!rawFilename || rawFilename.includes('..') || path.isAbsolute(rawFilename) || rawFilename.includes(path.sep)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const list = project.drawings || [];
    const index = list.findIndex(d => d.filename === rawFilename);
    if (index === -1) {
      return res.status(404).json({ error: 'Drawing not found' });
    }

    const drawingsDir = await getProjectDrawingsDir(project.projectNumber, project.tenant_id ?? project.tenantId ?? null);
    const filePath = path.join(drawingsDir, rawFilename);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.error('Error deleting drawing file:', unlinkErr);
      }
    }

    const newDrawings = list.filter(d => d.filename !== rawFilename);
    const updatePayload = db.isSupabase() ? { drawings: newDrawings } : { drawings: JSON.stringify(newDrawings) };
    await db.update('projects', updatePayload, { id: project.id });

    const updated = await db.get('projects', { id: project.id });
    parseProjectJSONFields(updated);
    res.json({ drawings: updated.drawings });
  } catch (error) {
    console.error('Error deleting project drawing:', error);
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
});

module.exports = router;

