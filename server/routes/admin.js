const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { sendApprovedReportsForAllTenants } = require('../jobs/sendApprovedReports');

const router = express.Router();

// Health check for admin routes
router.get('/health', authenticate, requireTenant, requireAdmin, (req, res) => {
  res.json({ status: 'ok' });
});

// POST /api/admin/jobs/send-approved-reports
router.post('/jobs/send-approved-reports', authenticate, requireTenant, requireAdmin, async (req, res) => {
  try {
    const summary = await sendApprovedReportsForAllTenants();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('Error running send-approved-reports job:', err);
    res.status(500).json({ success: false, error: 'Failed to run send-approved-reports job' });
  }
});

module.exports = router;

