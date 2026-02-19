/**
 * Interactive: add a new company (tenant) and get a company-specific login.
 * Asks for company info and admin credentials, then creates the tenant + admin
 * and prints the login to use.
 *
 * Run: node scripts/create-tenant-interactive.js
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../server/db');

function ask(rl, question, defaultValue = '') {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : defaultValue);
    });
  });
}

function derivePrefix(name) {
  if (!name || !name.trim()) return '02';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return words.map(w => (w[0] || '').toUpperCase()).join('').slice(0, 4);
  }
  return name.trim().slice(0, 4).toUpperCase() || '02';
}

async function main() {
  if (!db.isSupabase()) {
    console.error('This script requires Supabase. Set SUPABASE_* in .env or .env.local.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n--- Add a new company (tenant) and get a company-specific login ---\n');

  const companyName = await ask(rl, 'Company name (e.g. XYZ Corp)', '');
  if (!companyName) {
    console.error('Company name is required.');
    rl.close();
    process.exit(1);
  }

  const adminEmail = await ask(rl, 'Admin email for this company (login)', '');
  if (!adminEmail) {
    console.error('Admin email is required.');
    rl.close();
    process.exit(1);
  }

  const adminPassword = await ask(rl, 'Admin password for this company', '');
  if (!adminPassword) {
    console.error('Admin password is required.');
    rl.close();
    process.exit(1);
  }

  const defaultPrefix = derivePrefix(companyName);
  const projectNumberPrefix = await ask(rl, 'Project number prefix (e.g. XYZ)', defaultPrefix) || defaultPrefix;
  const adminDisplayName = await ask(rl, 'Admin display name (optional)', 'Admin User');

  console.log('\nOptional company details (press Enter to skip):');
  const companyAddress = await ask(rl, '  Company address', '');
  const companyCity = await ask(rl, '  Company city', '');
  const companyState = await ask(rl, '  Company state', '');
  const companyZip = await ask(rl, '  Company zip', '');
  const companyPhone = await ask(rl, '  Company phone', '');
  const companyEmail = await ask(rl, '  Company email', '');
  const companyWebsite = await ask(rl, '  Company website', '');

  rl.close();

  const tenantPayload = {
    name: companyName,
    project_number_prefix: projectNumberPrefix,
    project_number_format: 'PREFIX-YYYY-NNNN',
    is_active: true
  };
  if (companyAddress) tenantPayload.company_address = companyAddress;
  if (companyCity) tenantPayload.company_city = companyCity;
  if (companyState) tenantPayload.company_state = companyState;
  if (companyZip) tenantPayload.company_zip = companyZip;
  if (companyPhone) tenantPayload.company_phone = companyPhone;
  if (companyEmail) tenantPayload.company_email = companyEmail;
  if (companyWebsite) tenantPayload.company_website = companyWebsite;

  const tenant = await db.insert('tenants', tenantPayload);
  const tenantId = tenant.id;

  const existing = await db.get('users', { email: adminEmail, tenant_id: tenantId });
  if (existing) {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    await db.update('users', { password: hashed, name: adminDisplayName || existing.name }, { id: existing.id });
  } else {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    await db.insert('users', {
      email: adminEmail,
      password: hashed,
      role: 'ADMIN',
      name: adminDisplayName || 'Admin User',
      tenant_id: tenantId
    });
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
