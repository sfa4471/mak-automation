const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticate, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

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
  });
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  db.get('SELECT id, email, role, name FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Create technician (Admin only)
router.post('/technicians', authenticate, requireAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)',
    [email, hashedPassword, 'TECHNICIAN', name],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }

      res.status(201).json({
        id: this.lastID,
        email,
        role: 'TECHNICIAN',
        name
      });
    }
  );
});

// List all technicians (available to all authenticated users - needed for dropdowns in reports)
router.get('/technicians', authenticate, (req, res) => {
  db.all(
    "SELECT id, email, name FROM users WHERE role = 'TECHNICIAN' ORDER BY name",
    [],
    (err, technicians) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(technicians);
    }
  );
});

module.exports = router;

