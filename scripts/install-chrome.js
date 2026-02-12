#!/usr/bin/env node
/**
 * Install Puppeteer Chrome into project-local .puppeteer-cache.
 * Use this in Render Build Command so Chrome is deployed with the app:
 *   npm install && npm run install-chrome && npm run build
 * Set Environment on Render: PUPPETEER_CACHE_DIR=./.puppeteer-cache (for runtime).
 */
const path = require('path');
const { execSync } = require('child_process');

const cacheDir = path.join(process.cwd(), '.puppeteer-cache');
const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir };

console.log('Installing Chrome for Puppeteer to', cacheDir);
execSync('npx puppeteer browsers install chrome', { stdio: 'inherit', env });
console.log('Chrome install complete.');
