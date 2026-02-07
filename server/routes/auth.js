const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Use new database abstraction layer
const { authenticate, requireAdmin, requireTechnician, JWT_SECRET } = require('../middleware/auth');
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

    // Log which database is being used for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Login attempt:', { 
        email, 
        usingSupabase: db.isSupabase(),
        usingSQLite: db.isSQLite()
      });
    }

    const user = await db.get('users', { email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
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
      }
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

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });
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

    // Check if email already exists
    const existing = await db.get('users', { email });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const newUser = await db.insert('users', {
      email,
      password: hashedPassword,
      role: 'TECHNICIAN',
      name
    });

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
router.get('/technicians', authenticate, async (req, res) => {
  try {
    const technicians = await db.all('users', { role: 'TECHNICIAN' }, { 
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

    // Update email if provided
    if (email !== undefined) {
      // Check email uniqueness (excluding current user)
      const existing = await db.get('users', { email });
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

