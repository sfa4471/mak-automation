/**
 * Tenant API — current tenant info and settings (multi-tenant SaaS)
 * GET /api/tenants/me — current tenant info
 * PUT /api/tenants/me — update tenant company info (admin, own tenant)
 * POST /api/tenants/logo — upload logo (admin, own tenant) — stub
 */

const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// GET /api/tenants/me — return current tenant info for logged-in user (synthetic when legacy DB)
router.get('/me', authenticate, requireTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (req.legacyDb) {
      return res.json({
        tenantId,
        name: 'Default',
        subdomain: null,
        companyAddress: null,
        companyCity: null,
        companyState: null,
        companyZip: null,
        companyPhone: null,
        companyEmail: null,
        companyWebsite: null,
        logoPath: null,
        primaryColor: '#007bff',
        secondaryColor: '#6c757d',
        projectNumberPrefix: '02',
        projectNumberFormat: 'PREFIX-YYYY-NNNN'
      });
    }
    const tenant = await db.get('tenants', { id: tenantId });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({
      tenantId: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain ?? null,
      apiBaseUrl: tenant.api_base_url ?? tenant.apiBaseUrl ?? null,
      companyAddress: tenant.company_address ?? tenant.companyAddress ?? null,
      companyCity: tenant.company_city ?? tenant.companyCity ?? null,
      companyState: tenant.company_state ?? tenant.companyState ?? null,
      companyZip: tenant.company_zip ?? tenant.companyZip ?? null,
      companyPhone: tenant.company_phone ?? tenant.companyPhone ?? null,
      companyEmail: tenant.company_email ?? tenant.companyEmail ?? null,
      companyWebsite: tenant.company_website ?? tenant.companyWebsite ?? null,
      logoPath: tenant.logo_path ?? tenant.logoPath ?? null,
      primaryColor: tenant.primary_color ?? tenant.primaryColor ?? '#007bff',
      secondaryColor: tenant.secondary_color ?? tenant.secondaryColor ?? '#6c757d',
      projectNumberPrefix: tenant.project_number_prefix ?? tenant.projectNumberPrefix ?? '02',
      projectNumberFormat: tenant.project_number_format ?? tenant.projectNumberFormat ?? 'PREFIX-YYYY-NNNN'
    });
  } catch (err) {
    console.error('Get tenant me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/tenants/me — update current tenant company info (admin only)
router.put('/me', authenticate, requireTenant, requireAdmin, [
  body('name').optional().trim().notEmpty(),
  body('companyAddress').optional().trim(),
  body('companyCity').optional().trim(),
  body('companyState').optional().trim(),
  body('companyZip').optional().trim(),
  body('companyPhone').optional().trim(),
  body('companyEmail').optional().trim(),
  body('companyWebsite').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const tenantId = req.tenantId;
    const allowed = [
      'name', 'companyAddress', 'companyCity', 'companyState', 'companyZip',
      'companyPhone', 'companyEmail', 'companyWebsite'
    ];
    const update = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        update[key] = req.body[key];
      }
    }
    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    await db.update('tenants', update, { id: tenantId });
    const tenant = await db.get('tenants', { id: tenantId });
    res.json({
      tenantId: tenant.id,
      name: tenant.name,
      companyAddress: tenant.company_address ?? tenant.companyAddress,
      companyCity: tenant.company_city ?? tenant.companyCity,
      companyState: tenant.company_state ?? tenant.companyState,
      companyZip: tenant.company_zip ?? tenant.companyZip,
      companyPhone: tenant.company_phone ?? tenant.companyPhone,
      companyEmail: tenant.company_email ?? tenant.companyEmail,
      companyWebsite: tenant.company_website ?? tenant.companyWebsite
    });
  } catch (err) {
    console.error('Update tenant me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/tenants/logo — upload logo for current tenant (admin only)
// Stub: returns 501; implement with multer + save under server/public/tenants/{tenantId}/
router.post('/logo', authenticate, requireTenant, requireAdmin, (req, res) => {
  res.status(501).json({
    error: 'Logo upload not yet implemented. Use PUT /api/tenants/me to set company info. Logo path can be set via tenants.logo_path in DB.'
  });
});

module.exports = router;
