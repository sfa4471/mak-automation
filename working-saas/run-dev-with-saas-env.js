/**
 * Run the app using .env.saas-dev so the working branch uses a separate
 * Supabase project (dev) and doesn't touch production.
 *
 * Usage (from repo root):
 *   node working-saas/run-dev-with-saas-env.js
 *
 * Before first use:
 *   1. Copy .env to .env.saas-dev
 *   2. In .env.saas-dev set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your dev Supabase project
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const envPath = path.join(repoRoot, '.env.saas-dev');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env.saas-dev. Copy .env to .env.saas-dev and set your dev Supabase credentials.');
  process.exit(1);
}

// Parse .env.saas-dev and merge into process.env
const content = fs.readFileSync(envPath, 'utf8');
content.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
      process.env[key] = val;
    }
  }
});

console.log('Using .env.saas-dev (dev Supabase). Starting dev server...\n');
const child = spawn('npm', ['run', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
