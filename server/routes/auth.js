const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { supabase } = require('../db/supabase');
const { authenticate, requireAdmin, requireTechnician, JWT_SECRET } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/email');

const router = express.Router();

// Base URL for reset/set-password links in emails (set CLIENT_BASE_URL in env, e.g. http://localhost:3000)
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || process.env.REACT_APP_API_BASE_URL?.replace(/\/api\/?$/, '') || 'http://localhost:3000';
const RESET_TOKEN_EXPIRY_HOURS = 1;

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('tenantId').optional().isInt({ min: 1 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, tenantId: bodyTenantId } = req.body;

    // Log which database is being used for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Login attempt:', { 
        email, 
        usingSupabase: db.isSupabase(),
        usingSQLite: db.isSQLite()
      });
    }

    let user;

    if (db.isSupabase()) {
      // Branch DB (multi-tenant): same email can exist in multiple tenants
      const usersWithEmail = await db.all('users', { email });
      if (!usersWithEmail || usersWithEmail.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (usersWithEmail.length === 1) {
        user = usersWithEmail[0];
      } else {
        // Multiple tenants have this email - do not expose company names to the client
        if (bodyTenantId == null) {
          return res.status(400).json({
            code: 'MULTIPLE_TENANTS',
            error: 'Multiple accounts with this email. Please use the sign-in link from your company or contact your administrator.'
          });
        }
        user = usersWithEmail.find(u => (u.tenant_id ?? u.tenantId) === bodyTenantId) || null;
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
      }
    } else {
      // Main DB: single user per email
      user = await db.get('users', { email });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let tenantId = null;
    let tenantName = null;
    if (db.isSupabase() && (user.tenant_id != null || user.tenantId != null)) {
      tenantId = user.tenant_id ?? user.tenantId;
      const tenant = await db.get('tenants', { id: tenantId });
      tenantName = tenant ? (tenant.name || `Tenant ${tenantId}`) : null;
    }

    const jwtPayload = { id: user.id, email: user.email, role: user.role, name: user.name };
    if (tenantId != null) jwtPayload.tenantId = tenantId;
    if (tenantName != null) jwtPayload.tenantName = tenantName;

    const token = jwt.sign(
      jwtPayload,
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };
    if (tenantId != null) userResponse.tenantId = tenantId;
    if (tenantName != null) userResponse.tenantName = tenantName;

    res.json({
      token,
      user: userResponse
    });
  } catch (err) {
    console.error('Login error:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    // Provide more specific error message for debugging
    const errorMessage = err.message || 'Database error';
    res.status(500).json({ 
      error: 'Database error',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// Forgot password (branch DB + SendGrid only). Always returns same message to avoid email enumeration.
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
  body('tenantId').optional().isInt({ min: 1 }).toInt()
], async (req, res) => {
  const genericMessage = 'If an account exists for this email, you will receive a password reset link shortly.';
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    if (!db.isSupabase()) {
      return res.status(503).json({ error: 'Password reset is not available. Use the main app or contact support.' });
    }
    if (!emailService.isConfigured()) {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
    }

    const { email, tenantId: bodyTenantId } = req.body;
    if (process.env.NODE_ENV === 'development') {
      console.log('[auth] forgot-password: looking up user for email:', email);
    }
    const usersWithEmail = await db.all('users', { email });
    if (!usersWithEmail || usersWithEmail.length === 0) {
      if (process.env.NODE_ENV === 'development') console.log('[auth] forgot-password: no user found for', email);
      return res.json({ message: genericMessage });
    }
    let user = usersWithEmail.length === 1
      ? usersWithEmail[0]
      : (bodyTenantId != null ? usersWithEmail.find(u => (u.tenant_id ?? u.tenantId) === bodyTenantId) : usersWithEmail[0]);
    if (!user) {
      if (process.env.NODE_ENV === 'development') console.log('[auth] forgot-password: no user matched tenant');
      return res.json({ message: genericMessage });
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('[auth] forgot-password: user found id=', user.id, 'sending reset email to', user.email);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString()
      });
    if (insertError) {
      console.error('[auth] forgot-password insert token error:', insertError);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }

    const resetLink = `${CLIENT_BASE_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
    try {
      await emailService.sendPasswordResetEmail(user.email, resetLink);
    } catch (emailErr) {
      console.error('[auth] forgot-password SendGrid failed:', emailErr.message);
      if (emailErr.response?.body) console.error('[auth] SendGrid response:', JSON.stringify(emailErr.response.body, null, 2));
      if (process.env.NODE_ENV === 'development') {
        return res.status(502).json({ error: 'Email could not be sent. Check server console for SendGrid error. ' + (emailErr.response?.body?.errors?.[0]?.message || emailErr.message) });
      }
      return res.json({ message: genericMessage });
    }
    return res.json({ message: genericMessage });
  } catch (err) {
    console.error('[auth] forgot-password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Reset password (branch DB only). Token in body.
router.post('/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    if (!db.isSupabase()) {
      return res.status(503).json({ error: 'Password reset is not available.' });
    }

    const { token, newPassword } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: row, error: fetchError } = await supabase
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .single();
    if (fetchError || !row) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }
    if (row.used_at) {
      return res.status(400).json({ error: 'This reset link has already been used. Please request a new one.' });
    }
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await db.update('users', { password: hashedPassword }, { id: row.user_id });
    await supabase
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id);

    return res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    console.error('[auth] reset-password error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const response = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };
    if (db.isSupabase() && (user.tenant_id != null || user.tenantId != null)) {
      const tid = user.tenant_id ?? user.tenantId;
      response.tenantId = tid;
      const tenant = await db.get('tenants', { id: tid });
      response.tenantName = tenant ? (tenant.name || `Tenant ${tid}`) : null;
    }
    
    res.json(response);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create technician (Admin only)
router.post('/technicians', authenticate, requireAdmin, [
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

    const insertData = {
      email,
      password: hashedPassword,
      role: 'TECHNICIAN',
      name
    };
    if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
      const tenantId = req.user.tenantId ?? req.user.tenant_id;
      insertData.tenant_id = tenantId;
    }

    // Check if email already exists (per-tenant when Supabase)
    const existingConditions = { email };
    if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
      existingConditions.tenant_id = req.user.tenantId ?? req.user.tenant_id;
    }
    const existing = await db.get('users', existingConditions);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newUser = await db.insert('users', insertData);

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

// List all technicians (available to all authenticated users - needed for dropdowns in reports)
// When Supabase multi-tenant: only technicians in the current user's tenant
router.get('/technicians', authenticate, async (req, res) => {
  try {
    const conditions = { role: 'TECHNICIAN' };
    if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
      conditions.tenant_id = req.user.tenantId ?? req.user.tenant_id;
    }
    const technicians = await db.all('users', conditions, { 
      orderBy: 'name ASC' 
    });
    
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

// Change own password (Technician only)
router.put('/me/password', authenticate, requireTechnician, [
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

    // Update password
    await db.update('users', { password: hashedPassword }, { id: userId });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update technician (Admin only)
router.put('/technicians/:id', authenticate, requireAdmin, [
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

    // Check if technician exists
    const technician = await db.get('users', { id: technicianId });
    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    // Verify it's a technician
    if (technician.role !== 'TECHNICIAN') {
      return res.status(400).json({ error: 'User is not a technician' });
    }

    const updateData = {};

    // When Supabase multi-tenant: technician must belong to current user's tenant
    if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
      const techTenantId = technician.tenant_id ?? technician.tenantId;
      const userTenantId = req.user.tenantId ?? req.user.tenant_id;
      if (techTenantId !== userTenantId) {
        return res.status(404).json({ error: 'Technician not found' });
      }
    }

    // Update email if provided
    if (email !== undefined) {
      const existingConditions = { email };
      if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
        existingConditions.tenant_id = req.user.tenantId ?? req.user.tenant_id;
      }
      const existing = await db.get('users', existingConditions);
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

// Delete technician (Admin only)
router.delete('/technicians/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const technicianId = parseInt(req.params.id);

    // Check if technician exists
    const technician = await db.get('users', { id: technicianId });
    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    // Verify it's a technician
    if (technician.role !== 'TECHNICIAN') {
      return res.status(400).json({ error: 'User is not a technician' });
    }

    if (db.isSupabase() && (req.user.tenantId != null || req.user.tenant_id != null)) {
      const techTenantId = technician.tenant_id ?? technician.tenantId;
      const userTenantId = req.user.tenantId ?? req.user.tenant_id;
      if (techTenantId !== userTenantId) {
        return res.status(404).json({ error: 'Technician not found' });
      }
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

