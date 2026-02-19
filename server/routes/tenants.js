/**
 * Tenant API – company info and branding (GET/PUT /api/tenants/me)
 * See IMPLEMENTATION_PLAN_TENANT_BRANDING.md Phase 6
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

async function getTenantIdForUser(req) {
  if (!db.isSupabase()) return null;
  try {
    const user = await db.get('users', { id: req.user.id });
    if (!user) return null;
    const tid = user.tenant_id ?? user.tenantId;
    return tid != null ? tid : null;
  } catch (e) {
    console.error('Error getting tenant_id for user:', e);
    return null;
  }
}

/** Safe tenant fields to return to client (no sensitive/internal) */
function toTenantResponse(tenant) {
  if (!tenant) return null;
  const apiBaseUrl = tenant.api_base_url ?? tenant.apiBaseUrl ?? null;
  return {
    id: tenant.id,
    name: tenant.name,
    companyAddress: tenant.companyAddress ?? tenant.company_address ?? null,
    companyCity: tenant.companyCity ?? tenant.company_city ?? null,
    companyState: tenant.companyState ?? tenant.company_state ?? null,
    companyZip: tenant.companyZip ?? tenant.company_zip ?? null,
    companyPhone: tenant.companyPhone ?? tenant.company_phone ?? null,
    companyEmail: tenant.companyEmail ?? tenant.company_email ?? null,
    companyWebsite: tenant.companyWebsite ?? tenant.company_website ?? null,
    companyContactName: tenant.companyContactName ?? tenant.company_contact_name ?? null,
    peFirmReg: tenant.peFirmReg ?? tenant.pe_firm_reg ?? null,
    licenseHolderName: tenant.licenseHolderName ?? tenant.license_holder_name ?? null,
    licenseHolderTitle: tenant.licenseHolderTitle ?? tenant.license_holder_title ?? null,
    logoPath: tenant.logoPath ?? tenant.logo_path ?? null,
    apiBaseUrl: apiBaseUrl && String(apiBaseUrl).trim() ? String(apiBaseUrl).trim() : null
  };
}

/**
 * GET /api/tenants/me
 * Returns current user's tenant (company info). Auth required.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req);
    if (tenantId == null) {
      return res.status(404).json({ error: 'No tenant associated with this user' });
    }
    const tenant = await db.get('tenants', { id: tenantId });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(toTenantResponse(tenant));
  } catch (err) {
    console.error('GET /api/tenants/me error:', err);
    res.status(500).json({ error: 'Failed to load company info' });
  }
});

/**
 * PUT /api/tenants/me
 * Update current tenant company info. Admin only.
 * Body: companyAddress, companyCity, companyState, companyZip, companyPhone, companyEmail,
 *       companyContactName, peFirmReg, licenseHolderName, licenseHolderTitle (all optional)
 */
router.put('/me', authenticate, requireAdmin, [
  body('companyAddress').optional().trim(),
  body('companyCity').optional().trim(),
  body('companyState').optional().trim(),
  body('companyZip').optional().trim(),
  body('companyPhone').optional().trim(),
  body('companyEmail').optional().trim(),
  body('companyWebsite').optional().trim(),
  body('companyContactName').optional().trim(),
  body('peFirmReg').optional().trim(),
  body('licenseHolderName').optional().trim(),
  body('licenseHolderTitle').optional().trim(),
  body('name').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = await getTenantIdForUser(req);
    if (tenantId == null) {
      return res.status(404).json({ error: 'No tenant associated with this user' });
    }

    const tenant = await db.get('tenants', { id: tenantId });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const updates = {};
    const allowed = [
      'companyAddress', 'companyCity', 'companyState', 'companyZip',
      'companyPhone', 'companyEmail', 'companyWebsite', 'companyContactName',
      'peFirmReg', 'licenseHolderName', 'licenseHolderTitle', 'name'
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key] === '' ? null : req.body[key];
      }
    }
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return res.json(toTenantResponse(tenant));
    }

    const optionalKeys = ['companyContactName', 'peFirmReg', 'licenseHolderName', 'licenseHolderTitle'];
    try {
      await db.update('tenants', updates, { id: tenantId });
    } catch (err) {
      if (err.message && err.message.includes("Could not find the") && err.message.includes("column")) {
        const fallback = { updated_at: updates.updated_at };
        for (const key of allowed) {
          if (!optionalKeys.includes(key) && updates[key] !== undefined) {
            fallback[key] = updates[key];
          }
        }
        if (Object.keys(fallback).length <= 1) {
          throw err;
        }
        await db.update('tenants', fallback, { id: tenantId });
      } else {
        throw err;
      }
    }
    const updated = await db.get('tenants', { id: tenantId });
    res.json(toTenantResponse(updated));
  } catch (err) {
    console.error('PUT /api/tenants/me error:', err);
    res.status(500).json({ error: 'Failed to update company info' });
  }
});

/**
 * POST /api/tenants/logo
 * Upload logo for current tenant. Admin only. Multipart form: field "logo".
 * Saves to public/tenants/{tenantId}/logo.{ext} and sets tenants.logo_path.
 */
const uploadDir = path.join(__dirname, '..', 'public', 'tenants');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = req.tenantIdForLogo;
    if (!tenantId) return cb(new Error('Tenant not resolved'));
    const dir = path.join(uploadDir, String(tenantId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const safe = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, 'logo' + safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    cb(null, !!ok);
  }
});

router.post('/logo', authenticate, requireAdmin, async (req, res, next) => {
  const tenantId = await getTenantIdForUser(req);
  if (tenantId == null) {
    return res.status(404).json({ error: 'No tenant associated with this user' });
  }
  req.tenantIdForLogo = tenantId;
  next();
}, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file uploaded' });
    }
    const tenantId = await getTenantIdForUser(req);
    const relativePath = `tenants/${tenantId}/logo${path.extname(req.file.filename)}`;
    await db.update('tenants', {
      logoPath: relativePath,
      updatedAt: new Date().toISOString()
    }, { id: tenantId });

    res.json({
      success: true,
      logoPath: relativePath,
      url: `/tenants/${tenantId}/logo${path.extname(req.file.filename)}`
    });
  } catch (err) {
    console.error('POST /api/tenants/logo error:', err);
    res.status(500).json({ error: 'Failed to save logo' });
  }
});

module.exports = router;
