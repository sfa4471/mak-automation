const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mak-lonestar-secret-key-change-in-production';

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const STAFF_REVIEWER_ROLES = new Set(['ADMIN', 'PM']);

/** True for roles that see all tenant tasks/projects and may review/edit submitted reports (Admin or PM). */
const isStaffReviewer = (role) => STAFF_REVIEWER_ROLES.has(role);

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireAdminOrPm = (req, res, next) => {
  if (!isStaffReviewer(req.user.role)) {
    return res.status(403).json({ error: 'Admin or PM access required' });
  }
  next();
};

const requireTechnician = (req, res, next) => {
  if (req.user.role !== 'TECHNICIAN') {
    return res.status(403).json({ error: 'Technician access required' });
  }
  next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireAdminOrPm,
  requireTechnician,
  isStaffReviewer,
  JWT_SECRET
};

