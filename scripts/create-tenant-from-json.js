/**
 * Create a tenant (and admin) from a JSON file. Same workflow as create-tenant-interactive.js
 * but non-interactive for QA and automation.
 *
 * Usage: node scripts/create-tenant-from-json.js scripts/waapis-tenant.json
 *
 * JSON shape:
 * {
 *   "companyName": "WAAPIS",
 *   "adminEmail": "email@example.com",
 *   "adminPassword": "secret",
 *   "projectNumberPrefix": "05",
 *   "adminDisplayName": "Fawad Akhtar",
 *   "companyAddress": "672 W Peninsula Dr, Coppell, TX, 75019",
 *   "companyCity": "Coppell",
 *   "companyState": "Texas",
 *   "companyZip": "75019",
 *   "companyPhone": "2817367177",
 *   "companyEmail": "email@example.com",
 *   "companyWebsite": "waapis.com",
 *   "companyContactName": "Fawad Akhtar",
 *   "peFirmReg": "14443",
 *   "licenseHolderName": "Fawad Akhtar",
 *   "licenseHolderTitle": "Geotechnical Engineer",
 *   "logoSourcePath": "optional/path/to/logo.png"
 * }
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../server/db');

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    console.error('Usage: node scripts/create-tenant-from-json.js <path-to-json>');
    process.exit(1);
  }

  if (!db.isSupabase()) {
    console.error('This script requires Supabase. Set SUPABASE_* in .env or .env.local.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const companyName = raw.companyName?.trim();
  const adminEmail = raw.adminEmail?.trim();
  const adminPassword = raw.adminPassword?.trim();

  if (!companyName || !adminEmail || !adminPassword) {
    console.error('JSON must include companyName, adminEmail, adminPassword.');
    process.exit(1);
  }

  const projectNumberPrefix = raw.projectNumberPrefix?.trim() || '02';
  const adminDisplayName = raw.adminDisplayName?.trim() || 'Admin User';

  console.log('\n--- Create tenant from JSON ---\n');
  console.log('Company:', companyName);
  console.log('Admin:', adminEmail);
  console.log('Project number prefix:', projectNumberPrefix);

  const tenantPayload = {
    name: companyName,
    project_number_prefix: projectNumberPrefix,
    project_number_format: 'PREFIX-YYYY-NNNN',
    is_active: true
  };
  if (raw.companyAddress) tenantPayload.company_address = raw.companyAddress.trim();
  if (raw.companyCity) tenantPayload.company_city = raw.companyCity.trim();
  if (raw.companyState) tenantPayload.company_state = raw.companyState.trim();
  if (raw.companyZip) tenantPayload.company_zip = raw.companyZip.trim();
  if (raw.companyPhone) tenantPayload.company_phone = raw.companyPhone.trim();
  if (raw.companyEmail) tenantPayload.company_email = raw.companyEmail.trim();
  if (raw.companyWebsite) tenantPayload.company_website = raw.companyWebsite.trim();

  const tenant = await db.insert('tenants', tenantPayload);
  const tenantId = tenant.id;

  // Optional columns (from migrations); update separately so missing columns don't fail insert
  const optionalUpdate = {};
  if (raw.companyContactName) optionalUpdate.company_contact_name = raw.companyContactName.trim();
  if (raw.peFirmReg) optionalUpdate.pe_firm_reg = raw.peFirmReg.trim();
  if (raw.licenseHolderName) optionalUpdate.license_holder_name = raw.licenseHolderName.trim();
  if (raw.licenseHolderTitle) optionalUpdate.license_holder_title = raw.licenseHolderTitle.trim();
  if (Object.keys(optionalUpdate).length > 0) {
    try {
      await db.update('tenants', optionalUpdate, { id: tenantId });
    } catch (e) {
      console.warn('Optional tenant fields (contact/P.E./license) not updated:', e.message);
    }
  }

  const existing = await db.get('users', { email: adminEmail, tenant_id: tenantId });
  if (existing) {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    await db.update('users', { password: hashed, name: adminDisplayName || existing.name }, { id: existing.id });
    console.log('Admin user already existed; password and name updated.');
  } else {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    await db.insert('users', {
      email: adminEmail,
      password: hashed,
      role: 'ADMIN',
      name: adminDisplayName,
      tenant_id: tenantId
    });
    console.log('Admin user created.');
  }

  // Optional: copy logo to tenant folder and set logo_path
  const logoSource = raw.logoSourceAbsolute
    ? path.resolve(raw.logoSourceAbsolute)
    : raw.logoSourcePath
      ? path.resolve(path.dirname(path.resolve(jsonPath)), raw.logoSourcePath)
      : null;
  if (logoSource && fs.existsSync(logoSource)) {
    const publicTenants = path.join(__dirname, '..', 'server', 'public', 'tenants');
    const tenantDir = path.join(publicTenants, String(tenantId));
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
    const ext = path.extname(logoSource).toLowerCase() || '.png';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.png';
    const destPath = path.join(tenantDir, 'logo' + safeExt);
    fs.copyFileSync(logoSource, destPath);
    const relativePath = `tenants/${tenantId}/logo${safeExt}`;
    await db.update('tenants', { logoPath: relativePath }, { id: tenantId });
    console.log('Logo copied and tenant logo_path set.');
  } else if (raw.logoSourcePath || raw.logoSourceAbsolute) {
    console.warn('Logo path not found; skipping logo.');
  }

  console.log('\n--- Company and login created ---\n');
  console.log('Company:', companyName, '(id', tenantId + ')');
  console.log('Project number prefix:', projectNumberPrefix);
  console.log('');
  console.log('Login for this company only:');
  console.log('  Email:   ', adminEmail);
  console.log('  Password:', adminPassword);
  console.log('');
  console.log('Use these credentials at: http://localhost:3000 (or your app URL)');
  console.log('You will see only', companyName + "'s data and settings.\n");
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
