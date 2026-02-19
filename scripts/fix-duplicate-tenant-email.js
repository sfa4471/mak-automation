/**
 * Fix: Ensure emailnishatparween@gmail.com exists only for WAAPIS (tenant id 3),
 * not for MAK or any duplicate WAAPIS tenant.
 *
 * Run: node scripts/fix-duplicate-tenant-email.js
 * Use .env.local for branch DB.
 */

require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local'), override: true });
const db = require('../server/db');

const EMAIL = 'emailnishatparween@gmail.com';
const KEEP_TENANT_ID = 3; // WAAPIS tenant we created in onboarding

async function main() {
  if (!db.isSupabase()) {
    console.error('This script requires Supabase (.env.local).');
    process.exit(1);
  }

  const usersWithEmail = await db.all('users', { email: EMAIL });
  if (!usersWithEmail.length) {
    console.log('No users found with email:', EMAIL);
    process.exit(0);
  }

  console.log('Users with email', EMAIL + ':');
  for (const u of usersWithEmail) {
    const tid = u.tenant_id ?? u.tenantId;
    const tenant = tid ? await db.get('tenants', { id: tid }) : null;
    const tenantName = tenant ? (tenant.name || `Tenant ${tid}`) : '—';
    console.log('  User id', u.id, '| tenant_id', tid, '|', tenantName);
  }

  const toRemove = usersWithEmail.filter(u => {
    const tid = u.tenant_id ?? u.tenantId;
    return tid !== KEEP_TENANT_ID; // remove if not the WAAPIS tenant we want to keep
  });

  if (toRemove.length === 0) {
    console.log('\nNo duplicate accounts to remove. Email is only in WAAPIS (tenant', KEEP_TENANT_ID + ').');
    process.exit(0);
  }

  console.log('\nRemoving', toRemove.length, 'user(s) so this email exists only for WAAPIS (tenant', KEEP_TENANT_ID + '):');
  for (const u of toRemove) {
    const tid = u.tenant_id ?? u.tenantId;
    const tenant = tid ? await db.get('tenants', { id: tid }) : null;
    const name = tenant ? tenant.name : `Tenant ${tid}`;
    console.log('  Deleting user id', u.id, '(' + name + ')');
    await db.delete('users', { id: u.id });
  }

  console.log('\nDone. Login with', EMAIL, 'will now go directly to WAAPIS (no company picker).');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
