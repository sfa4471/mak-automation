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

/**
 * Get signature image as base64 data URI for PDF footer.
 * @param {number|string|null} tenantId
 * @param {object|null} tenant - Optional pre-loaded tenant (avoids extra DB call)
 * @returns {Promise<string|null>} data:image/...;base64,... or null
 */
async function getSignatureBase64(tenantId, tenant = null) {
  if (tenantId == null) return null;
  let signaturePath = null;
  if (tenant && (tenant.signature_url || tenant.signatureUrl)) {
    const rel = (tenant.signature_url || tenant.signatureUrl).replace(/^\/+/, '');
    signaturePath = path.join(__dirname, '..', 'public', rel);
  } else {
    const tenantDir = path.join(__dirname, '..', 'public', 'tenants', String(tenantId));
    if (fs.existsSync(tenantDir)) {
      const files = fs.readdirSync(tenantDir);
      const sigFile = files.find(f => /^signature\.(jpg|jpeg|png|gif|webp)$/i.test(path.basename(f)));
      if (sigFile) signaturePath = path.join(tenantDir, sigFile);
    }
  }
  if (!signaturePath || !fs.existsSync(signaturePath)) return null;
  try {
    const buf = fs.readFileSync(signaturePath);
    const ext = path.extname(signaturePath).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    console.warn('Error loading signature:', err.message);
  }
  return null;
}

/**
 * Build PDF footer data for bottom-right block: firm name, signature image, engineer name, title, firm reg, date.
 * @param {object|null} tenant
 * @param {{ reportDate?: string }} options - reportDate or use today
 * @returns {Promise<{ companyName: string, signatureDataUri: string|null, engineerName: string, engineerTitle: string, firmReg: string, date: string }>}
 */
async function getPdfFooterData(tenant, options = {}) {
  const companyName = (tenant?.name ?? tenant?.companyName ?? '').trim() || 'Company';
  const engineerName = (tenant?.license_holder_name ?? tenant?.licenseHolderName ?? '').trim() || '';
  const engineerTitle = (tenant?.license_holder_title ?? tenant?.licenseHolderTitle ?? '').trim() || '';
  const firmReg = (tenant?.pe_firm_reg ?? tenant?.peFirmReg ?? '').trim() || '';
  let dateStr = options.reportDate || '';
  if (!dateStr) {
    const d = new Date();
    dateStr = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } else if (dateStr.length === 10) {
    try {
      dateStr = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch (e) {
      dateStr = String(dateStr);
    }
  }
  const tenantId = tenant?.id ?? null;
  const signatureDataUri = await getSignatureBase64(tenantId, tenant);
  return { companyName, signatureDataUri, engineerName, engineerTitle, firmReg, date: dateStr };
}

/**
 * Escape HTML for safe injection into PDF templates.
 */
function escapeHtml(text) {
  if (text == null || text === '') return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Inline CSS for the shared PDF footer block (bottom-right, professional spacing). */
const PDF_FOOTER_STYLE = `
.pdf-footer-block {
  position: absolute;
  bottom: 0.5in;
  right: 0.5in;
  text-align: right;
  font-size: 9pt;
  line-height: 1.5;
  font-family: Arial, sans-serif;
  color: #333;
}
.pdf-footer-block .pdf-footer-firm { font-weight: bold; margin-bottom: 6px; }
.pdf-footer-block .pdf-footer-engineer { font-weight: bold; margin-top: 4px; }
.pdf-footer-block .pdf-footer-title,
.pdf-footer-block .pdf-footer-reg,
.pdf-footer-block .pdf-footer-date { margin-top: 4px; }
.pdf-footer-block img { display: block; max-width: 140px; max-height: 50px; object-fit: contain; margin: 6px 0; margin-left: auto; margin-right: 0; padding-left: 36px; }
`;

/**
 * Build the shared PDF footer HTML block (bottom-right): Firm name, Signature image, Engineer name, Title, Firm reg, Date.
 * @param {object} footerData - from getPdfFooterData()
 * @param {{ bottom?: string, right?: string }} [options] - Optional position overrides (e.g. { bottom: '0.2in', right: '0.2in' } for Proctor)
 * @returns {string} HTML fragment (style + div)
 */
function buildPdfFooterHtml(footerData, options) {
  const { companyName, signatureDataUri, engineerName, engineerTitle, firmReg, date } = footerData;
  const sigImg = signatureDataUri
    ? `<img src="${signatureDataUri}" alt="Signature" style="display:block;max-width:140px;max-height:50px;object-fit:contain;margin:6px 0;margin-left:auto;margin-right:0;padding-left:36px;" />`
    : '';
  const firmRegLabel = firmReg ? `Texas Firm Registration No. ${firmReg}` : '';
  const dateLabel = date ? `Date: ${date}` : 'Date: ';
  let style = PDF_FOOTER_STYLE;
  if (options && (options.bottom != null || options.right != null)) {
    style += '\n.pdf-footer-block { ';
    if (options.bottom != null) style += `bottom: ${options.bottom}; `;
    if (options.right != null) style += `right: ${options.right}; `;
    style += '}';
  }
  return `<style>${style}</style>
<div class="pdf-footer-block">
  <div class="pdf-footer-firm">${escapeHtml(companyName)}</div>
  ${sigImg}
  <div class="pdf-footer-engineer">${escapeHtml(engineerName)}</div>
  <div class="pdf-footer-title">${escapeHtml(engineerTitle)}</div>
  <div class="pdf-footer-reg">${escapeHtml(firmRegLabel)}</div>
  <div class="pdf-footer-date">${escapeHtml(dateLabel)}</div>
</div>`;
}

module.exports = {
  getTenant,
  getTenantAddress,
  getLogoBase64,
  getSignatureBase64,
  getPdfFooterData,
  buildPdfFooterHtml,
  escapeHtml,
  LOGO_CONFIG
};
