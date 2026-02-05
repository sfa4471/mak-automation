const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Use new database abstraction layer
const { authenticate, requireAdmin, JWT_SECRET } = require('../middleware/auth');
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

module.exports = router;

