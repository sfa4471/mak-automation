const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all notifications for current user
router.get('/', authenticate, (req, res) => {
  db.all(
    `SELECT n.*, 
     wp.name as workPackageName, wp.type as workPackageType,
     p.projectNumber, p.projectName
     FROM notifications n
     LEFT JOIN workpackages wp ON n.relatedWorkPackageId = wp.id
     LEFT JOIN projects p ON n.relatedProjectId = p.id
     WHERE n.userId = ?
     ORDER BY n.createdAt DESC`,
    [req.user.id],
    (err, notifications) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(notifications);
    }
  );
});

// Get unread notification count
router.get('/unread-count', authenticate, (req, res) => {
  db.get(
    'SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0',
    [req.user.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ count: row.count });
    }
  );
});

// Mark notification as read
router.put('/:id/read', authenticate, (req, res) => {
  const notificationId = req.params.id;

  // Verify notification belongs to user
  db.get(
    'SELECT * FROM notifications WHERE id = ? AND userId = ?',
    [notificationId, req.user.id],
    (err, notification) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      db.run(
        'UPDATE notifications SET isRead = 1 WHERE id = ?',
        [notificationId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ success: true });
        }
      );
    }
  );
});

// Mark all notifications as read
router.put('/mark-all-read', authenticate, (req, res) => {
  db.run(
    'UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0',
    [req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, updated: this.changes });
    }
  );
});

// Create notification (internal helper function, can be called from other routes)
function createNotification(userId, message, type = 'info', relatedWorkPackageId = null, relatedProjectId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (userId, message, type, relatedWorkPackageId, relatedProjectId)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, message, type, relatedWorkPackageId, relatedProjectId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

module.exports = { router, createNotification };

