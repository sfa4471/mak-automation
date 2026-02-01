const express = require('express');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { createNotification } = require('./notifications');

const router = express.Router();

// Get work packages for a project
router.get('/project/:projectId', authenticate, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Check project access
    const project = await db.get('projects', { id: projectId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let workPackages;
    
    if (db.isSupabase()) {
      let query = supabase
        .from('workpackages')
        .select(`
          *,
          users:assigned_to(name, email)
        `)
        .eq('project_id', projectId);
      
      if (req.user.role !== 'ADMIN') {
        query = query.eq('assigned_to', req.user.id);
      }
      
      const { data, error } = await query.order('id', { ascending: true });
      
      if (error) throw error;
      
      workPackages = (data || []).map(wp => ({
        ...wp,
        assignedTechnicianName: wp.users?.name || null,
        assignedTechnicianEmail: wp.users?.email || null,
        users: undefined
      }));
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
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

      workPackages = await new Promise((resolve, reject) => {
        sqliteDb.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
    
    res.json(workPackages);
  } catch (err) {
    console.error('Error fetching work packages:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single work package
router.get('/:id', authenticate, async (req, res) => {
  try {
    const workPackageId = parseInt(req.params.id);

    let workPackage;
    
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('workpackages')
        .select(`
          *,
          users:assigned_to(name, email),
          projects:project_id(project_name, project_number, project_spec)
        `)
        .eq('id', workPackageId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Work package not found' });
        }
        throw error;
      }
      
      workPackage = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        projectName: data.projects?.project_name || null,
        projectNumber: data.projects?.project_number || null,
        projectSpec: data.projects?.project_spec || null,
        users: undefined,
        projects: undefined
      };
    } else {
      // SQLite fallback
      const sqliteDb = require('../database');
      workPackage = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
           p.projectName, p.projectNumber, p.projectSpec
           FROM workpackages wp
           LEFT JOIN users u ON wp.assignedTo = u.id
           INNER JOIN projects p ON wp.projectId = p.id
           WHERE wp.id = ?`,
          [workPackageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!workPackage) {
      return res.status(404).json({ error: 'Work package not found' });
    }

    // Check access
    if (req.user.role === 'TECHNICIAN' && workPackage.assignedTo !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(workPackage);
  } catch (err) {
    console.error('Error fetching work package:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Assign work package to technician (Admin only)
router.put('/:id/assign', authenticate, requireAdmin, [
  body('technicianId').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const workPackageId = parseInt(req.params.id);
    const { technicianId } = req.body;

    // Verify technician exists
    const tech = await db.get('users', { id: technicianId, role: 'TECHNICIAN' });
    if (!tech) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    // Get work package and project info for notification
    let wp;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('workpackages')
        .select(`
          *,
          projects:project_id(project_number, project_name)
        `)
        .eq('id', workPackageId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Work package not found' });
      }
      
      wp = {
        ...data,
        projectNumber: data.projects?.project_number,
        projectName: data.projects?.project_name,
        projectId: data.project_id
      };
    } else {
      const sqliteDb = require('../database');
      wp = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT wp.*, p.projectNumber, p.projectName 
           FROM workpackages wp
           INNER JOIN projects p ON wp.projectId = p.id
           WHERE wp.id = ?`,
          [workPackageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
      
      if (!wp) {
        return res.status(404).json({ error: 'Work package not found' });
      }
    }

    // Update work package
    const changes = await db.update('workpackages', {
      assignedTo: technicianId,
      status: 'Assigned',
      updatedAt: new Date().toISOString()
    }, { id: workPackageId });

    if (changes === 0) {
      return res.status(404).json({ error: 'Work package not found' });
    }

    // Create notification for technician
    const message = `Admin assigned ${wp.name} for Project ${wp.projectNumber}`;
    createNotification(technicianId, message, 'info', workPackageId, wp.projectId).catch(console.error);

    // Get updated work package
    let workPackage;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('workpackages')
        .select(`
          *,
          users:assigned_to(name, email)
        `)
        .eq('id', workPackageId)
        .single();
      
      if (error) throw error;
      
      workPackage = {
        ...data,
        assignedTechnicianName: data.users?.name || null,
        assignedTechnicianEmail: data.users?.email || null,
        users: undefined
      };
    } else {
      const sqliteDb = require('../database');
      workPackage = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT wp.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail
           FROM workpackages wp
           LEFT JOIN users u ON wp.assignedTo = u.id
           WHERE wp.id = ?`,
          [workPackageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }
    
    res.json(workPackage);
  } catch (err) {
    console.error('Error assigning work package:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update work package status
router.put('/:id/status', authenticate, [
  body('status').isIn(['Draft', 'Assigned', 'In Progress', 'Submitted', 'Approved', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const workPackageId = parseInt(req.params.id);
    const { status } = req.body;

    // Check access and get work package
    let wp;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('workpackages')
        .select(`
          *,
          projects:project_id(project_number, project_name)
        `)
        .eq('id', workPackageId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Work package not found' });
      }
      
      wp = {
        ...data,
        projectNumber: data.projects?.project_number,
        projectName: data.projects?.project_name,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      wp = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT wp.*, p.projectNumber, p.projectName 
           FROM workpackages wp
           INNER JOIN projects p ON wp.projectId = p.id
           WHERE wp.id = ?`,
          [workPackageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
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

    // Update status
    await db.update('workpackages', {
      status: status,
      updatedAt: new Date().toISOString()
    }, { id: workPackageId });

    // Create notification when technician starts working
    if (status === 'IN_PROGRESS_TECH' && req.user.role === 'TECHNICIAN') {
      const technician = await db.get('users', { id: req.user.id });
      const technicianName = technician?.name || technician?.email || 'Technician';
      
      const admins = await db.all('users', { role: 'ADMIN' });
      if (admins && admins.length > 0) {
        const message = `${technicianName} started working on ${wp.name} for Project ${wp.projectNumber}`;
        admins.forEach(admin => {
          createNotification(admin.id, message, 'info', workPackageId, wp.projectId).catch(console.error);
        });
      }
    }

    // Create notification when technician sends update to admin
    if (status === 'READY_FOR_REVIEW' && req.user.role === 'TECHNICIAN') {
      const technician = await db.get('users', { id: req.user.id });
      const technicianName = technician?.name || technician?.email || 'Technician';
      
      const admins = await db.all('users', { role: 'ADMIN' });
      if (admins && admins.length > 0) {
        const message = `${technicianName} completed ${wp.name} for Project ${wp.projectNumber}`;
        admins.forEach(admin => {
          createNotification(admin.id, message, 'info', workPackageId, wp.projectId).catch(console.error);
        });
      }
    }

    // Return updated work package
    const updatedWorkPackage = await db.get('workpackages', { id: workPackageId });
    res.json(updatedWorkPackage);
  } catch (err) {
    console.error('Error updating work package status:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Get WP1 data
router.get('/:id/wp1', authenticate, async (req, res) => {
  try {
    const workPackageId = parseInt(req.params.id);

    // Check work package access
    let wp;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('workpackages')
        .select(`
          *,
          projects:project_id(spec_strength_psi, spec_ambient_temp_f, spec_concrete_temp_f, spec_slump, spec_air_content_by_volume)
        `)
        .eq('id', workPackageId)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Work package not found' });
      }
      
      wp = {
        ...data,
        specStrengthPsi: data.projects?.spec_strength_psi,
        specAmbientTempF: data.projects?.spec_ambient_temp_f,
        specConcreteTempF: data.projects?.spec_concrete_temp_f,
        specSlump: data.projects?.spec_slump,
        specAirContentByVolume: data.projects?.spec_air_content_by_volume,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      wp = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT wp.*, p.specStrengthPsi, p.specAmbientTempF, p.specConcreteTempF, p.specSlump, p.specAirContentByVolume
           FROM workpackages wp
           INNER JOIN projects p ON wp.projectId = p.id
           WHERE wp.id = ?`,
          [workPackageId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
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

    const data = await db.get('wp1_data', { workPackageId });

    if (data) {
      // Parse cylinders JSON
      if (typeof data.cylinders === 'string') {
        try {
          data.cylinders = JSON.parse(data.cylinders || '[]');
        } catch (e) {
          data.cylinders = [];
        }
      } else {
        data.cylinders = data.cylinders || [];
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
  } catch (err) {
    console.error('Error fetching WP1 data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save WP1 data
router.post('/:id/wp1', authenticate, async (req, res) => {
  try {
    const workPackageId = parseInt(req.params.id);

    // Check work package access
    const wp = await db.get('workpackages', { id: workPackageId });
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

    // Prepare data for insertion/update
    const wp1Data = {
      taskId: null,
      workPackageId: workPackageId,
      technician: technician || null,
      weather: weather || null,
      placementDate: placementDate || null,
      specStrength: specStrength || null,
      specStrengthDays: specStrengthDays || null,
      structure: structure || null,
      sampleLocation: sampleLocation || null,
      supplier: supplier || null,
      timeBatched: timeBatched || null,
      classMixId: classMixId || null,
      timeSampled: timeSampled || null,
      yardsBatched: yardsBatched || null,
      ambientTempMeasured: ambientTempMeasured || null,
      ambientTempSpecs: ambientTempSpecs || null,
      truckNo: truckNo || null,
      ticketNo: ticketNo || null,
      concreteTempMeasured: concreteTempMeasured || null,
      concreteTempSpecs: concreteTempSpecs || null,
      plant: plant || null,
      slumpMeasured: slumpMeasured || null,
      slumpSpecs: slumpSpecs || null,
      yardsPlaced: yardsPlaced || null,
      totalYards: totalYards || null,
      airContentMeasured: airContentMeasured || null,
      airContentSpecs: airContentSpecs || null,
      waterAdded: waterAdded || null,
      unitWeight: unitWeight || null,
      finalCureMethod: finalCureMethod || null,
      specimenNo: specimenNo || null,
      specimenQty: specimenQty || null,
      specimenType: specimenType || null,
      cylinders: cylinders || [],
      remarks: remarks || null,
      lastEditedByRole: req.user.role,
      lastEditedByName: req.user.name || req.user.email || null,
      lastEditedByUserId: req.user.id,
      updatedAt: new Date().toISOString()
    };

    // Check if record exists
    const existing = await db.get('wp1_data', { workPackageId });

    if (existing) {
      // Update
      await db.update('wp1_data', wp1Data, { workPackageId });
    } else {
      // Insert
      await db.insert('wp1_data', wp1Data);
    }

    // Update status if provided, otherwise auto-update based on role
    if (updateStatus) {
      await db.update('workpackages', {
        status: updateStatus,
        updatedAt: new Date().toISOString()
      }, { id: workPackageId });
    } else if (req.user.role === 'TECHNICIAN' && (wp.status === 'Draft' || wp.status === 'Assigned')) {
      // Auto-update to IN_PROGRESS_TECH when technician first edits
      await db.update('workpackages', {
        status: 'IN_PROGRESS_TECH',
        updatedAt: new Date().toISOString()
      }, { id: workPackageId });
    } else if (req.user.role === 'ADMIN' && (wp.status === 'Draft' || wp.status === 'Assigned')) {
      await db.update('workpackages', {
        status: 'In Progress',
        updatedAt: new Date().toISOString()
      }, { id: workPackageId });
    }

    // Return updated data
    const data = await db.get('wp1_data', { workPackageId });
    
    if (data) {
      // Parse cylinders JSON
      if (typeof data.cylinders === 'string') {
        try {
          data.cylinders = JSON.parse(data.cylinders || '[]');
        } catch (e) {
          data.cylinders = [];
        }
      } else {
        data.cylinders = data.cylinders || [];
      }
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error saving WP1 data:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

