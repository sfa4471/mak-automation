/**
 * Tenant PDF Helpers
 * Shared helpers for resolving tenant and building branding (logo, address, Rebar footer)
 * for PDF generation in pdf.js and proctor.js.
 * See IMPLEMENTATION_PLAN_TENANT_BRANDING.md
 */

const path = require('path');
const fs = require('fs');
const db = require('../db');

// Fallback when no tenant or Supabase not in use (current MAK behaviour)
const FALLBACK = {
  companyName: 'MAK Lonestar Consulting, LLC',
  address: '940 N Beltline Road, Suite 107, Irving, TX 75061',
  phone: 'Tel (214) 718-1250',
  phoneShort: '214-718-1250',
  email: 'maklonestarservices@gmail.com',
  peFirmRegLine: 'Texas Board of Professional Engineers Firm Reg, F-24443',
  licenseHolderName: 'Muhammad Awais Khan, P.E.',
  licenseHolderTitle: 'Geotechnical Engineer'
};

const MAK_LOGO_PATH = path.join(__dirname, '..', 'public', 'MAK logo_consulting.jpg');

/**
 * Resolve tenant_id for a PDF request from req.user or from task/project.
 * @param {object} req - Express request (with req.user)
 * @param {object} taskOrProject - Optional task or project row (may have tenant_id / tenantId)
 * @returns {Promise<string|null>} tenant_id or null
 */
async function getTenantIdForPdf(req, taskOrProject) {
  if (!db.isSupabase()) return null;
  try {
    const fromUser = req.user && (req.user.tenantId != null || req.user.tenant_id != null)
      ? (req.user.tenantId ?? req.user.tenant_id)
      : null;
    if (fromUser != null) return String(fromUser);

    if (taskOrProject) {
      const tid = taskOrProject.tenant_id ?? taskOrProject.tenantId;
      if (tid != null) return String(tid);
    }

    if (req.user && req.user.id) {
      const user = await db.get('users', { id: req.user.id });
      if (user) {
        const tid = user.tenant_id ?? user.tenantId;
        if (tid != null) return String(tid);
      }
    }
  } catch (e) {
    console.error('Error getting tenant_id for PDF:', e.message);
  }
  return null;
}

/**
 * Load tenant row by id. Returns null if not found or not Supabase.
 * @param {string|null} tenantId
 * @returns {Promise<object|null>}
 */
async function getTenantById(tenantId) {
  if (!tenantId || !db.isSupabase()) return null;
  try {
    const tenant = await db.get('tenants', { id: parseInt(tenantId, 10) });
    return tenant || null;
  } catch (e) {
    console.error('Error loading tenant:', e.message);
    return null;
  }
}

/**
 * Get logo as base64 data URI for embedding in HTML/PDF.
 * If tenantId is null or tenant has no logo_path, uses MAK fallback logo.
 * @param {string|null} tenantId
 * @param {object|null} tenant - Optional pre-loaded tenant (avoids extra DB call)
 * @returns {string|null} data:image/...;base64,... or null
 */
function getLogoBase64(tenantId, tenant = null) {
  let logoPath = null;
  if (tenantId && tenant && tenant.logoPath) {
    const rel = tenant.logoPath.replace(/^\/+/, '');
    logoPath = path.join(__dirname, '..', 'public', rel);
  } else if (tenantId) {
    const tenantDir = path.join(__dirname, '..', 'public', 'tenants', tenantId);
    if (fs.existsSync(tenantDir)) {
      const files = fs.readdirSync(tenantDir);
      const logoFile = files.find(f => /^logo\.(jpg|jpeg|png|gif|webp)$/i.test(path.basename(f)));
      if (logoFile) logoPath = path.join(tenantDir, logoFile);
    }
  }
  if (!logoPath || !fs.existsSync(logoPath)) {
    logoPath = MAK_LOGO_PATH;
  }
  try {
    if (fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      const ext = path.extname(logoPath).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch (err) {
    console.warn('Error loading logo:', err.message);
  }
  return null;
}

/**
 * Format tenant address (single line): address, city, state zip.
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantAddress(tenant) {
  if (!tenant) return FALLBACK.address;
  const parts = [
    tenant.companyAddress || tenant.company_address,
    [tenant.companyCity || tenant.company_city, tenant.companyState || tenant.company_state, tenant.companyZip || tenant.company_zip].filter(Boolean).join(', ')
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : FALLBACK.address;
}

/**
 * Tenant contact name (company_contact_name).
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantContactName(tenant) {
  if (!tenant) return '';
  return tenant.companyContactName || tenant.company_contact_name || '';
}

/**
 * Company name for PDFs (tenant.name or fallback).
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantCompanyName(tenant) {
  if (!tenant || !(tenant.name || tenant.companyName)) return FALLBACK.companyName;
  return tenant.name || tenant.companyName || FALLBACK.companyName;
}

/**
 * Company phone for PDFs.
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantPhone(tenant) {
  if (!tenant) return FALLBACK.phone;
  const p = tenant.companyPhone || tenant.company_phone;
  return (p && p.trim()) ? (p.match(/^tel\s/i) ? p : `Tel ${p}`) : FALLBACK.phone;
}

/**
 * Company phone short (no "Tel ") for signature line.
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantPhoneShort(tenant) {
  if (!tenant) return FALLBACK.phoneShort;
  const p = tenant.companyPhone || tenant.company_phone;
  return (p && p.trim()) ? p.replace(/^\s*Tel\s+/i, '') : FALLBACK.phoneShort;
}

/**
 * Company email for PDFs.
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantEmail(tenant) {
  if (!tenant) return FALLBACK.email;
  const e = tenant.companyEmail || tenant.company_email;
  return (e && e.trim()) ? e : FALLBACK.email;
}

/**
 * Rebar footer fields: companyName, peFirmRegLine, licenseHolderName, licenseHolderTitle, companyPhone, companyEmail.
 * @param {object|null} tenant
 * @returns {{ companyName: string, peFirmRegLine: string, licenseHolderName: string, licenseHolderTitle: string, companyPhone: string, companyEmail: string }}
 */
function getTenantRebarFooter(tenant) {
  const name = getTenantCompanyName(tenant);
  const peReg = (tenant && (tenant.peFirmReg || tenant.pe_firm_reg))
    ? `Texas Board of Professional Engineers Firm Reg, ${tenant.peFirmReg || tenant.pe_firm_reg}`
    : FALLBACK.peFirmRegLine;
  const licenseName = (tenant && (tenant.licenseHolderName || tenant.license_holder_name)) || FALLBACK.licenseHolderName;
  const licenseTitle = (tenant && (tenant.licenseHolderTitle || tenant.license_holder_title)) || FALLBACK.licenseHolderTitle;
  return {
    companyName: name,
    peFirmRegLine: peReg,
    licenseHolderName: licenseName,
    licenseHolderTitle: licenseTitle,
    companyPhone: getTenantPhone(tenant),
    companyEmail: getTenantEmail(tenant)
  };
}

module.exports = {
  getTenantIdForPdf,
  getTenantById,
  getLogoBase64,
  getTenantAddress,
  getTenantContactName,
  getTenantCompanyName,
  getTenantPhone,
  getTenantPhoneShort,
  getTenantEmail,
  getTenantRebarFooter,
  FALLBACK,
  MAK_LOGO_PATH
};
