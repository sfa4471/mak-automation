const express = require('express');
const db = require('../db'); // Use new database abstraction
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all notifications for current user
router.get('/', authenticate, async (req, res) => {
  try {
    if (db.isSupabase()) {
      // Use Supabase with joins
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select(`
          *,
          workpackages:related_work_package_id(name, type),
          projects:related_project_id(project_number, project_name)
        `)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Transform the response to match expected format
      const transformed = (notifications || []).map(n => ({
        ...n,
        workPackageName: n.workpackages?.name || null,
        workPackageType: n.workpackages?.type || null,
        projectNumber: n.projects?.project_number || null,
        projectName: n.projects?.project_name || null,
        // Convert snake_case to camelCase for response
        userId: n.user_id,
        isRead: n.is_read,
        relatedTaskId: n.related_task_id,
        relatedWorkPackageId: n.related_work_package_id,
        relatedProjectId: n.related_project_id,
        createdAt: n.created_at
      }));

      res.json(transformed);
    } else {
      // SQLite fallback with raw query
      const notifications = await db.query(
        `SELECT n.*, 
         wp.name as workPackageName, wp.type as workPackageType,
         p.projectNumber, p.projectName
         FROM notifications n
         LEFT JOIN workpackages wp ON n.relatedWorkPackageId = wp.id
         LEFT JOIN projects p ON n.relatedProjectId = p.id
         WHERE n.userId = ?
         ORDER BY n.createdAt DESC`,
        [req.user.id]
      );
      res.json(notifications);
    }
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get unread notification count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const notifications = await db.all('notifications', { 
      userId: req.user.id, 
      isRead: 0 
    });
    res.json({ count: notifications.length });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;

    // Verify notification belongs to user
    const notification = await db.get('notifications', { 
      id: notificationId, 
      userId: req.user.id 
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await db.update('notifications', { isRead: 1 }, { id: notificationId });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', authenticate, async (req, res) => {
  try {
    const updated = await db.update(
      'notifications', 
      { isRead: 1 }, 
      { userId: req.user.id, isRead: 0 }
    );
    res.json({ success: true, updated });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create notification (internal helper function, can be called from other routes)
async function createNotification(userId, message, type = 'info', relatedWorkPackageId = null, relatedProjectId = null, relatedTaskId = null, tenantId = null) {
  try {
    const data = {
      userId,
      message,
      type,
      relatedWorkPackageId,
      relatedProjectId,
      relatedTaskId
    };
    if (db.isSupabase() && tenantId != null) data.tenant_id = tenantId;
    const notification = await db.insert('notifications', data);
    return notification.id;
  } catch (err) {
    console.error('Create notification error:', err);
    throw err;
  }
}

module.exports = { router, createNotification };

