#!/usr/bin/env node
/**
 * Checklist for using branch DB as production (crestfield.app).
 * Loads .env.local and verifies it points to the branch Supabase project,
 * then prints what to set in production (Render) — no secrets printed.
 *
 * Run: node scripts/use-branch-db-as-production.js
 * Requires: .env.local with branch credentials (optional; script still prints checklist if missing).
 */

const path = require('path');
const fs = require('fs');

const BRANCH_PROJECT_REF = 'uklvgcrzhhtpqtiwrbfw';
const BRANCH_URL = `https://${BRANCH_PROJECT_REF}.supabase.co`;

const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
require('dotenv').config({ path: path.join(projectRoot, '.env.local'), override: true });

const url = process.env.SUPABASE_URL || '';
const hasAnon = !!process.env.SUPABASE_ANON_KEY;
const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = url.replace(/^https:\/\/([^.]+)\.supabase\.co.*/, '$1') || '';

console.log('\n=== Use branch DB as production (crestfield.app) ===\n');

if (url === BRANCH_URL && hasAnon && hasServiceRole) {
  console.log('  OK .env.local has branch credentials (uklvgcrzhhtpqtiwrbfw).');
  console.log('  Use these same values in Render (backend) Environment.\n');
} else if (url && hasAnon && hasServiceRole) {
  console.log('  Current env points to project:', projectRef);
  console.log('  To use branch DB in production, set the following in Render to your BRANCH project values.');
  console.log('  Branch URL:', BRANCH_URL);
  console.log('  Get keys from: Supabase Dashboard -> project uklvgcrzhhtpqtiwrbfw -> Settings -> API\n');
} else {
  console.log('  .env.local missing or incomplete. Get branch credentials from Supabase Dashboard:');
  console.log('  Project uklvgcrzhhtpqtiwrbfw -> Settings -> API\n');
}

console.log('On Render (backend service):');
console.log('  1. Environment -> Add/update:');
console.log('     SUPABASE_URL          = https://uklvgcrzhhtpqtiwrbfw.supabase.co');
console.log('     SUPABASE_ANON_KEY      = (branch anon key)');
console.log('     SUPABASE_SERVICE_ROLE_KEY = (branch service_role key)');
console.log('  2. Save Changes -> Redeploy');
console.log('\nFrontend (Vercel): No Supabase vars needed for DB. Ensure REACT_APP_API_BASE_URL points to your backend.');
console.log('\nSee USE_BRANCH_DB_AS_PRODUCTION.md for full steps.\n');
