const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { supabase, isAvailable, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');
const { ensureProjectDirectory, getProjectDrawingsDir } = require('../utils/pdfFileManager');

const router = express.Router();

// Multer for drawings upload (memory storage; we write to project dir in handler)
const uploadDrawings = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf') return cb(new Error('Only PDF files are allowed for drawings'));
    cb(null, true);
  }
});

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

  // drawings: array of { filename, displayName? }
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

// Fallback: derive next sequence from existing project numbers when tenant_project_counters is missing.
// Uses global max (all projects matching prefix-year) so the number is unique when DB has unique(project_number) only.
async function generateProjectNumberFallback(tenantId, prefix, year) {
  const pattern = `${prefix}-${year}-`;
  let projects = [];
  if (db.isSupabase()) {
    const { data, error } = await supabase
      .from('projects')
      .select('project_number')
      .like('project_number', `${pattern}%`);
    if (error) throw error;
    projects = data || [];
  } else {
    const sqliteDb = require('../database');
    projects = await new Promise((resolve, reject) => {
      sqliteDb.all(
        'SELECT project_number as projectNumber FROM projects WHERE project_number LIKE ?',
        [`${pattern}%`],
        (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });
  }
  let maxSeq = 0;
  for (const row of projects) {
    const pn = row.project_number || row.projectNumber || '';
    const numPart = pn.substring(pattern.length);
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return maxSeq + 1;
}

// Generate project number per tenant: PREFIX-YYYY-NNNN (uses tenant_project_counters and tenant prefix)
async function generateProjectNumber(tenantId) {
  const year = new Date().getFullYear();
  const maxRetries = 20;

  let tenant = null;
  if (tenantId != null) {
    try {
      tenant = await db.get('tenants', { id: tenantId });
    } catch (e) {
      console.warn('Tenant lookup failed (tenants table may not exist), using default prefix:', e.message);
    }
  }
  const prefix = (tenant && (tenant.project_number_prefix ?? tenant.projectNumberPrefix)) || '02';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let nextSeq;

      if (db.isSupabase()) {
        try {
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
        } catch (counterErr) {
          // Table may not exist (e.g. multi-tenancy migration not run); use fallback from existing projects
          console.warn('tenant_project_counters unavailable, using fallback:', counterErr.message);
          nextSeq = await generateProjectNumberFallback(tenantId, prefix, year);
        }
      } else {
        const sqliteDb = require('../database');
        nextSeq = await new Promise((resolve, reject) => {
          sqliteDb.serialize(() => {
            sqliteDb.run(
              'INSERT OR IGNORE INTO tenant_project_counters (tenant_id, year, next_seq) VALUES (?, ?, 1)',
              [tenantId, year],
              (insertErr) => {
                if (insertErr) return reject(insertErr);
                sqliteDb.run(
                  'UPDATE tenant_project_counters SET next_seq = next_seq + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND year = ?',
                  [tenantId, year],
                  (updateErr) => {
                    if (updateErr) return reject(updateErr);
                    sqliteDb.get(
                      'SELECT next_seq FROM tenant_project_counters WHERE tenant_id = ? AND year = ?',
                      [tenantId, year],
                      (selectErr, row) => {
                        if (selectErr) return reject(selectErr);
                        resolve((row && row.next_seq ? row.next_seq : 1) - 1);
                      }
                    );
                  }
                );
              }
            );
          });
        });
      }

      const projectNumber = `${prefix}-${year}-${(nextSeq || 1).toString().padStart(4, '0')}`;
      const existingProject = await db.get('projects', { projectNumber, tenantId });
      if (!existingProject) {
        return projectNumber;
      }
      console.warn(`Project number ${projectNumber} already exists for tenant ${tenantId}, retrying...`);
    } catch (error) {
      console.error(`Error generating project number (attempt ${attempt + 1}/${maxRetries}):`, error);
      if (attempt === maxRetries - 1) {
        throw new Error(`Failed to generate unique project number after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw new Error('Failed to generate project number after maximum retries');
}

// Create project (Admin only, tenant-scoped)
router.post('/', authenticate, requireTenant, requireAdmin, [
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
    
    const tenantId = req.tenantId;
    const existingProjectByName = await db.get('projects', { projectName: trimmedProjectName, tenantId });
    if (existingProjectByName) {
      console.log('Duplicate project name detected:', {
        requestedName: trimmedProjectName,
        existingId: existingProjectByName.id
      });
      return res.status(400).json({ error: 'Project name already exists' });
    }

    // Generate project number using per-tenant counter
    let projectNumber;
    try {
      projectNumber = await generateProjectNumber(tenantId);
    } catch (genErr) {
      console.error('Error generating project number:', genErr);
      return res.status(500).json({ error: 'Database error: Failed to generate project number' });
    }

    if (!projectNumber) {
      return res.status(500).json({ error: 'Failed to generate project number' });
    }

    // Note: generateProjectNumber() already handles duplicate checking and retries
    // so we don't need to check again here

    // Prepare data for insertion (include tenant_id)
    const projectData = {
      projectNumber,
      projectName: trimmedProjectName,
      tenantId
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

    // Create project (retry with next project number if duplicate project_number, e.g. fallback race)
    let project;
    const maxInsertRetries = 5;
    for (let insertAttempt = 0; insertAttempt < maxInsertRetries; insertAttempt++) {
      try {
        project = await db.insert('projects', projectData);
        break;
      } catch (insertErr) {
        const errorMessage = insertErr.message || '';
        const isDuplicateProjectNumber = (errorMessage.includes('UNIQUE') || errorMessage.includes('duplicate')) &&
          (errorMessage.includes('project_number') || errorMessage.includes('projectnumber'));
        if (isDuplicateProjectNumber && insertAttempt < maxInsertRetries - 1) {
          const match = projectData.projectNumber.match(/^(.+-)(\d+)$/);
          if (match) {
            const prefixPart = match[1];
            const nextSeq = parseInt(match[2], 10) + 1;
            projectData.projectNumber = `${prefixPart}${nextSeq.toString().padStart(4, '0')}`;
            continue;
          }
        }
        console.error('Error creating project:', insertErr);
        if (errorMessage.includes('UNIQUE') || errorMessage.includes('duplicate')) {
          if (errorMessage.toLowerCase().includes('project_name') || errorMessage.toLowerCase().includes('projectname')) {
            return res.status(400).json({ error: 'Project name already exists' });
          }
          if (errorMessage.toLowerCase().includes('project_number') || errorMessage.toLowerCase().includes('projectnumber')) {
            return res.status(400).json({ error: 'Project number already exists' });
          }
          return res.status(400).json({ error: 'A project with this information already exists' });
        }
        return res.status(500).json({ error: 'Database error: ' + (insertErr.message || 'Unknown error') });
      }
    }
    if (!project) {
      return res.status(500).json({ error: 'Failed to create project after retries' });
    }

    // Create project folder structure for PDF storage (use project number, not ID)
    try {
      await ensureProjectDirectory(project.projectNumber || projectData.projectNumber);
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

// Get all projects (tenant-scoped: Admin sees all for tenant, Technician sees assigned only; legacy DB: no tenant filter)
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const legacyDb = req.legacyDb;
    let projects;

    if (db.isSupabase()) {
      if (req.user.role === 'ADMIN') {
        let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (!legacyDb) query = query.eq('tenant_id', tenantId);
        const { data, error } = await query;
        if (error) throw error;
        projects = (data || []).map(keysToCamelCase);
      } else {
        // Technician: only projects with assigned tasks/work packages
        let tasksQuery = supabase.from('tasks').select('project_id').eq('assigned_technician_id', req.user.id);
        let wpQuery = supabase.from('workpackages').select('project_id').eq('assigned_to', req.user.id);
        if (!legacyDb) {
          tasksQuery = tasksQuery.eq('tenant_id', tenantId);
          wpQuery = wpQuery.eq('tenant_id', tenantId);
        }
        const { data: tasksData, error: tasksError } = await tasksQuery;
        if (tasksError) throw tasksError;
        const { data: wpData, error: wpError } = await wpQuery;
        if (wpError) throw wpError;

        const projectIds = [...new Set([
          ...(tasksData || []).map(t => t.project_id),
          ...(wpData || []).map(wp => wp.project_id)
        ])];
        if (projectIds.length === 0) {
          projects = [];
        } else {
          let listQuery = supabase.from('projects').select('*').in('id', projectIds).order('created_at', { ascending: false });
          if (!legacyDb) listQuery = listQuery.eq('tenant_id', tenantId);
          const { data, error } = await listQuery;
          if (error) throw error;
          projects = (data || []).map(keysToCamelCase);
        }
      }
    } else {
      const sqliteDb = require('../database');
      if (req.user.role === 'ADMIN') {
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT p.*, 
             (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
             FROM projects p WHERE p.tenantId = ? ORDER BY p.createdAt DESC`,
            [tenantId],
            (err, rows) => {
              if (err) return reject(err);
              resolve(rows || []);
            }
          );
        });
      } else {
        projects = await new Promise((resolve, reject) => {
          sqliteDb.all(
            `SELECT DISTINCT p.* FROM projects p
             WHERE p.tenantId = ? AND p.id IN (
               SELECT DISTINCT projectId FROM workpackages WHERE assignedTo = ? AND tenantId = ?
               UNION
               SELECT DISTINCT projectId FROM tasks WHERE assignedTechnicianId = ? AND tenantId = ?
             )
             ORDER BY p.createdAt DESC`,
            [tenantId, req.user.id, tenantId, req.user.id, tenantId],
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

// Get single project (tenant-scoped)
router.get('/:id', authenticate, requireTenant, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.tenantId;

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!req.legacyDb && (project.tenant_id ?? project.tenantId) !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check access: Admin can see all in tenant, Technician only assigned
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

// Update project (Admin only, same tenant)
router.put('/:id', authenticate, requireTenant, requireAdmin, [
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
    const tenantId = req.tenantId;

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const existingProject = await db.get('projects', { id: projectId });
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if ((existingProject.tenant_id ?? existingProject.tenantId) !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
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

// --- Project drawings (PDF upload/list/serve/delete) ---

// Helper: safe filename for drawing (no path traversal, PDF only)
function safeDrawingFilename(originalName) {
  const base = (originalName || 'drawing.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(base).toLowerCase();
  const name = path.basename(base, ext) || 'drawing';
  return `${name}${ext === '.pdf' ? ext : '.pdf'}`;
}

// Ensure filename is unique in directory
function uniqueDrawingPath(dir, baseName) {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let filename = baseName;
  let n = 0;
  while (fs.existsSync(path.join(dir, filename))) {
    n += 1;
    filename = `${stem}_${n}${ext}`;
  }
  return filename;
}

// POST /api/projects/:id/drawings — upload PDF drawings (Admin only)
router.post('/:id/drawings', authenticate, requireTenant, requireAdmin, uploadDrawings.array('drawings', 10), async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const project = await db.get('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if ((project.tenant_id ?? project.tenantId) !== tenantId) return res.status(403).json({ error: 'Access denied' });

    const projectNumber = project.project_number ?? project.projectNumber;
    if (!projectNumber) return res.status(500).json({ error: 'Project has no project number' });

    await ensureProjectDirectory(projectNumber);
    const drawingsDir = await getProjectDrawingsDir(projectNumber, tenantId);
    if (!fs.existsSync(drawingsDir)) fs.mkdirSync(drawingsDir, { recursive: true });

    let drawings = [];
    if (project.drawings != null) {
      if (typeof project.drawings === 'string') {
        try { drawings = JSON.parse(project.drawings); } catch (e) { drawings = []; }
      } else if (Array.isArray(project.drawings)) drawings = [...project.drawings];
    }

    const files = req.files || [];
    if (files.length === 0) {
      parseProjectJSONFields(project);
      return res.json({ drawings: project.drawings || [] });
    }

    for (const file of files) {
      const baseName = safeDrawingFilename(file.originalname);
      const filename = uniqueDrawingPath(drawingsDir, baseName);
      const filePath = path.join(drawingsDir, filename);
      fs.writeFileSync(filePath, file.buffer);
      drawings.push({ filename, displayName: file.originalname || filename });
    }

    const updatePayload = db.isSupabase() ? { drawings } : { drawings: JSON.stringify(drawings) };
    await db.update('projects', updatePayload, { id: projectId });
    res.json({ drawings });
  } catch (err) {
    if (err.message && err.message.includes('Only PDF')) return res.status(400).json({ error: err.message });
    console.error('Error uploading drawings:', err);
    res.status(500).json({ error: err.message || 'Failed to upload drawings' });
  }
});

// GET /api/projects/:id/drawings/:filename — serve one drawing PDF
router.get('/:id/drawings/:filename', authenticate, requireTenant, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.tenantId;
    const filename = path.basename(req.params.filename);
    if (isNaN(projectId) || !filename) return res.status(400).json({ error: 'Invalid project ID or filename' });

    const project = await db.get('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if ((project.tenant_id ?? project.tenantId) !== tenantId) return res.status(403).json({ error: 'Access denied' });

    let drawings = project.drawings;
    if (typeof drawings === 'string') { try { drawings = JSON.parse(drawings); } catch (e) { drawings = []; } }
    if (!Array.isArray(drawings)) drawings = [];
    const entry = drawings.find(d => (d.filename === filename));
    if (!entry) return res.status(404).json({ error: 'Drawing not found' });

    const projectNumber = project.project_number ?? project.projectNumber;
    const drawingsDir = await getProjectDrawingsDir(projectNumber, tenantId);
    const filePath = path.join(drawingsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error('Error serving drawing:', err);
    res.status(500).json({ error: err.message || 'Failed to serve drawing' });
  }
});

// DELETE /api/projects/:id/drawings/:filename — remove one drawing (Admin only)
router.delete('/:id/drawings/:filename', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.tenantId;
    const filename = path.basename(req.params.filename);
    if (isNaN(projectId) || !filename) return res.status(400).json({ error: 'Invalid project ID or filename' });

    const project = await db.get('projects', { id: projectId });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if ((project.tenant_id ?? project.tenantId) !== tenantId) return res.status(403).json({ error: 'Access denied' });

    let drawings = project.drawings;
    if (typeof drawings === 'string') { try { drawings = JSON.parse(drawings); } catch (e) { drawings = []; } }
    if (!Array.isArray(drawings)) drawings = [];
    const filtered = drawings.filter(d => d.filename !== filename);
    if (filtered.length === drawings.length) return res.status(404).json({ error: 'Drawing not found' });

    const projectNumber = project.project_number ?? project.projectNumber;
    const drawingsDir = await getProjectDrawingsDir(projectNumber, tenantId);
    const filePath = path.join(drawingsDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const updatePayload = db.isSupabase() ? { drawings: filtered } : { drawings: JSON.stringify(filtered) };
    await db.update('projects', updatePayload, { id: projectId });
    res.json({ drawings: filtered });
  } catch (err) {
    console.error('Error deleting drawing:', err);
    res.status(500).json({ error: err.message || 'Failed to delete drawing' });
  }
});

module.exports = router;

