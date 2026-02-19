const fs = require('fs');
const path = require('path');
const db = require('../db');

const LOGO_CONFIG = {
  path: path.join(__dirname, '..', 'public', 'MAK logo_consulting.jpg'),
  fallback: null
};

/**
 * Get tenant record by id (for PDF branding).
 * @param {number|string|null} tenantId
 * @returns {Promise<object|null>}
 */
async function getTenant(tenantId) {
  if (tenantId == null) return null;
  return db.get('tenants', { id: tenantId });
}

/**
 * Formatted company address string for PDFs (address + city/state/zip, newline-separated).
 * @param {object|null} tenant
 * @returns {string}
 */
function getTenantAddress(tenant) {
  if (!tenant) return '';
  const a = tenant.company_address ?? tenant.companyAddress ?? '';
  const city = tenant.company_city ?? tenant.companyCity ?? '';
  const state = tenant.company_state ?? tenant.companyState ?? '';
  const zip = tenant.company_zip ?? tenant.companyZip ?? '';
  const parts = [a, [city, state, zip].filter(Boolean).join(', ')].filter(Boolean);
  return parts.join('\n') || '';
}

/**
 * Get logo as base64 data URI; optional tenantId to use tenant's logo_path.
 * @param {number|string|null} tenantId
 * @returns {Promise<string|null>} data:image/...;base64,... or null
 */
async function getLogoBase64(tenantId) {
  let logoPath = LOGO_CONFIG.path;
  if (tenantId != null) {
    const tenant = await getTenant(tenantId);
    const tenantLogo = tenant?.logo_path ?? tenant?.logoPath;
    if (tenantLogo && typeof tenantLogo === 'string') {
      const fullPath = path.isAbsolute(tenantLogo) ? tenantLogo : path.join(__dirname, '..', 'public', tenantLogo);
      if (fs.existsSync(fullPath)) logoPath = fullPath;
    }
  }
  try {
    if (fs.existsSync(logoPath)) {
      const imageBuffer = fs.readFileSync(logoPath);
      const ext = path.extname(logoPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      const base64 = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    }
  } catch (err) {
    console.warn('Error loading logo:', err.message);
  }
  return null;
}

module.exports = {
  getTenant,
  getTenantAddress,
  getLogoBase64,
  LOGO_CONFIG
};
