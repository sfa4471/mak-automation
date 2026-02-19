/**
 * Create a new tenant (company) and optionally its first admin user.
 * Uses the same DB as the app (.env / .env.local).
 *
 * Usage:
 *   node scripts/create-tenant.js "Company Name"
 *   node scripts/create-tenant.js "XYZ Corp" admin@xyz.com admin123
 *   node scripts/create-tenant.js "XYZ Corp" admin@xyz.com admin123 --prefix XC
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
const bcrypt = require('bcryptjs');
const db = require('../server/db');

const args = process.argv.slice(2);
let companyName = null;
let adminEmail = null;
let adminPassword = null;
let prefix = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--prefix' && args[i + 1]) {
    prefix = args[i + 1];
    i++;
  } else if (!companyName) {
    companyName = args[i];
  } else if (!adminEmail) {
    adminEmail = args[i];
  } else if (!adminPassword) {
    adminPassword = args[i];
  }
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
  if (!companyName || !companyName.trim()) {
    console.error('Usage: node scripts/create-tenant.js "Company Name" [adminEmail] [adminPassword] [--prefix PREFIX]');
    process.exit(1);
  }

  if (!db.isSupabase()) {
    console.error('This script only supports Supabase (multi-tenant). Configure SUPABASE_* in .env or .env.local.');
    process.exit(1);
  }

  const name = companyName.trim();
  const projectNumberPrefix = (prefix && prefix.trim()) || derivePrefix(name);

  console.log('Creating tenant:', name);
  console.log('Project number prefix:', projectNumberPrefix);

  const tenantPayload = {
    name,
    project_number_prefix: projectNumberPrefix,
    project_number_format: 'PREFIX-YYYY-NNNN',
    is_active: true
  };

  const tenant = await db.insert('tenants', tenantPayload);
  const tenantId = tenant.id;
  console.log('Tenant created: id =', tenantId);

  if (adminEmail && adminEmail.trim()) {
    const email = adminEmail.trim();
    const password = adminPassword && adminPassword.trim() ? adminPassword.trim() : 'changeme123';
    const existing = await db.get('users', { email, tenant_id: tenantId });
    if (existing) {
      const hashed = bcrypt.hashSync(password, 10);
      await db.update('users', { password: hashed, name: existing.name || 'Admin User' }, { id: existing.id });
      console.log('Admin user already existed; password reset.');
    } else {
      const hashed = bcrypt.hashSync(password, 10);
      await db.insert('users', {
        email,
        password: hashed,
        role: 'ADMIN',
        name: 'Admin User',
        tenant_id: tenantId
      });
      console.log('Admin user created for this tenant.');
    }
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  Login with these credentials; you will see only this tenant\'s data.');
  } else {
    console.log('No admin email provided. Create an admin with:');
    console.log('  node scripts/create-admin-user.js <email> <password>', tenantId);
  }

  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
