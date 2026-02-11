const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Use new database abstraction layer
const { authenticate, requireAdmin, requireTechnician, JWT_SECRET } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const loginTenantId = req.body.tenantId ?? req.body.tenant_id ?? null;

    if (process.env.NODE_ENV === 'development') {
      console.log('Login attempt:', { 
        email, 
        tenantId: loginTenantId,
        usingSupabase: db.isSupabase(),
        usingSQLite: db.isSQLite()
      });
    }

    let user;
    if (loginTenantId != null) {
      user = await db.get('users', { email, tenant_id: Number(loginTenantId) });
    } else {
      const usersWithEmail = await db.all('users', { email });
      if (usersWithEmail.length === 0) user = null;
      else if (usersWithEmail.length === 1) user = usersWithEmail[0];
      else {
        return res.status(400).json({
          error: 'Multiple accounts with this email. Please specify your tenant (company) or log in from your company portal.',
          code: 'MULTIPLE_TENANTS'
        });
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let tenantId = user.tenant_id ?? user.tenantId;

    // If user has no tenant assigned, try to assign default tenant (only if tenants table exists and has a row)
    if (tenantId == null) {
      let defaultTenant = null;
      try {
        defaultTenant = await db.get('tenants', { id: 1 }) ||
          (await db.all('tenants', {}, { limit: 1, orderBy: 'id asc' }))?.[0];
      } catch (_) {
        // tenants table may not exist yet (multi-tenant migration not run)
      }
      if (defaultTenant) {
        const tid = defaultTenant.id ?? defaultTenant.Id;
        try {
          await db.update('users', { tenant_id: tid }, { id: user.id });
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Could not assign default tenant to user:', e?.message);
          }
        }
        tenantId = tid;
      }
      // Legacy: no tenants table (e.g. main DB) — use synthetic tenant 1 so login still works
      if (tenantId == null) {
        tenantId = 1;
      }
    }

    let tenant = null;
    try {
      tenant = await db.get('tenants', { id: tenantId });
    } catch (_) {
      // tenants table may not exist (e.g. main DB without multi-tenant migration)
    }
    // Legacy: no tenants table or tenant not found — allow login with default tenant info (e.g. main DB)
    const tenantName = tenant ? tenant.name : 'Default';
    const tenantSubdomain = tenant ? (tenant.subdomain ?? null) : null;
    const tenantApiBaseUrl = tenant ? (tenant.api_base_url ?? tenant.apiBaseUrl ?? null) : null;
    if (tenant && tenant.is_active === false && tenant.isActive === false) {
      return res.status(403).json({ error: 'Tenant account is inactive' });
    }
    const isLegacyDb = tenant == null; // no tenants table or no row (e.g. main DB)
    if (!tenant && tenantId == null) {
      tenantId = 1; // synthetic for legacy DB
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        tenantId: Number(tenantId),
        tenantName,
        tenantSubdomain,
        legacyDb: isLegacyDb
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      tenant: {
        tenantId: Number(tenantId),
        tenantName,
        tenantSubdomain,
        apiBaseUrl: tenantApiBaseUrl || undefined
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    const errorMessage = err.message || 'Database error';
    // Always include real error message so you can fix the cause (e.g. missing tenants table, wrong column)
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Get current user (includes tenant from JWT and apiBaseUrl for per-tenant backend)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let apiBaseUrl = null;
    const tenantId = req.user.tenantId ?? user.tenant_id ?? user.tenantId;
    if (tenantId != null) {
      try {
        const tenant = await db.get('tenants', { id: tenantId });
        if (tenant) apiBaseUrl = tenant.api_base_url ?? tenant.apiBaseUrl ?? null;
      } catch (_) { /* tenants table may not exist */ }
    }
    
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId,
      tenantName: req.user.tenantName,
      tenantSubdomain: req.user.tenantSubdomain ?? null,
      apiBaseUrl: apiBaseUrl || undefined
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create technician (Admin only, same tenant)
router.post('/technicians', authenticate, requireTenant, requireAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const tenantId = req.tenantId;
    const legacyDb = req.legacyDb;

    // Check if email already exists (per tenant in multi-tenant, globally in legacy)
    const existing = legacyDb
      ? await db.all('users', { email })
      : await db.all('users', { email, tenant_id: tenantId });
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const insertPayload = { email, password: hashedPassword, role: 'TECHNICIAN', name };
    if (!legacyDb) insertPayload.tenant_id = tenantId;
    const newUser = await db.insert('users', insertPayload);

    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      name: newUser.name
    });
  } catch (err) {
    console.error('Create technician error:', err);
    if (err.message && err.message.includes('unique') || err.message && err.message.includes('duplicate')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// List technicians (current tenant only in multi-tenant; all technicians in legacy DB)
router.get('/technicians', authenticate, requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const legacyDb = req.legacyDb;
    const technicians = legacyDb
      ? await db.all('users', { role: 'TECHNICIAN' }, { orderBy: 'name asc' })
      : await db.all('users', { role: 'TECHNICIAN', tenant_id: tenantId }, { orderBy: 'name asc' });
    
    // Return only needed fields
    const result = technicians.map(tech => ({
      id: tech.id,
      email: tech.email,
      name: tech.name
    }));
    
    res.json(result);
  } catch (err) {
    console.error('List technicians error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Change own password (Admin and Technician)
router.put('/me/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get current user with password
    const user = await db.get('users', { id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Check if new password is different from current
    if (bcrypt.compareSync(newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update password and clear must_change_password if set
    const updateData = { password: hashedPassword };
    if (user.mustChangePassword === 1 || user.must_change_password === 1) {
      updateData.mustChangePassword = 0;
    }
    await db.update('users', updateData, { id: userId });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update technician (Admin only, same tenant)
router.put('/technicians/:id', authenticate, requireTenant, requireAdmin, [
  body('email').optional().isEmail().normalizeEmail(),
  body('name').optional().notEmpty().trim(),
  body('password').optional().isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const technicianId = parseInt(req.params.id);
    const { email, name, password } = req.body;

    // Check if technician exists and belongs to same tenant (skip tenant check in legacy)
    const technician = await db.get('users', { id: technicianId });
    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }
    if (!req.legacyDb && (technician.tenant_id ?? technician.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify it's a technician
    if (technician.role !== 'TECHNICIAN') {
      return res.status(400).json({ error: 'User is not a technician' });
    }

    const updateData = {};

    // Update email if provided (unique per tenant in multi-tenant, by email in legacy)
    if (email !== undefined) {
      const existing = req.legacyDb
        ? await db.get('users', { email })
        : await db.get('users', { email, tenant_id: req.tenantId });
      if (existing && existing.id !== technicianId) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      updateData.email = email;
    }

    // Update name if provided
    if (name !== undefined) {
      updateData.name = name;
    }

    // Update password if provided
    if (password !== undefined) {
      updateData.password = bcrypt.hashSync(password, 10);
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Update the technician
    await db.update('users', updateData, { id: technicianId });

    // Get updated technician
    const updatedTechnician = await db.get('users', { id: technicianId });

    res.json({
      id: updatedTechnician.id,
      email: updatedTechnician.email,
      role: updatedTechnician.role,
      name: updatedTechnician.name
    });
  } catch (err) {
    console.error('Update technician error:', err);
    if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete technician (Admin only, same tenant)
router.delete('/technicians/:id', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const technicianId = parseInt(req.params.id);

    const technician = await db.get('users', { id: technicianId });
    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }
    if (!req.legacyDb && (technician.tenant_id ?? technician.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (technician.role !== 'TECHNICIAN') {
      return res.status(400).json({ error: 'User is not a technician' });
    }

    // Check for assigned workpackages
    let workpackages = [];
    if (db.isSupabase()) {
      const { supabase } = require('../db/supabase');
      const { data, error } = await supabase
        .from('workpackages')
        .select('id')
        .eq('assigned_to', technicianId);
      
      if (error) throw error;
      workpackages = data || [];
    } else {
      const sqliteDb = require('../database');
      workpackages = await new Promise((resolve, reject) => {
        sqliteDb.all(
          'SELECT id FROM workpackages WHERE assignedTo = ?',
          [technicianId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }

    // Check for assigned tasks
    let tasks = [];
    if (db.isSupabase()) {
      const { supabase } = require('../db/supabase');
      const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_technician_id', technicianId);
      
      if (error) throw error;
      tasks = data || [];
    } else {
      const sqliteDb = require('../database');
      tasks = await new Promise((resolve, reject) => {
        sqliteDb.all(
          'SELECT id FROM tasks WHERE assignedTechnicianId = ?',
          [technicianId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
    }

    // If there are assignments, prevent deletion
    if (workpackages.length > 0 || tasks.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete technician. Please reassign all active tasks assigned to this technician before deletion.' 
      });
    }

    // Delete the technician
    await db.delete('users', { id: technicianId });

    res.json({ message: 'Technician deleted successfully' });
  } catch (err) {
    console.error('Delete technician error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

