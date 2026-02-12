/**
 * Shared Puppeteer launch options for PDF generation.
 * Supports Render and other cloud environments where Chrome must be installed
 * during build and found via PUPPETEER_CACHE_DIR or PUPPETEER_EXECUTABLE_PATH.
 */

const path = require('path');
const fs = require('fs');

/** Standard args for headless Chrome in Docker/Render (no GPU, no sandbox). */
const HEADLESS_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
  '--disable-features=VizDisplayCompositor'
];

/** Cached path to Chrome in .puppeteer-cache (resolved once per process). */
let cachedProjectChromePath = null;

/**
 * Find Chrome executable under a Puppeteer cache directory.
 * Layout: cacheDir/chrome/linux-<rev>/chrome-linux64/chrome (or chrome-win/Chromium/chrome.exe).
 * Returns null if not found.
 */
function findChromeInCacheDir(cacheDir) {
  try {
    const chromeDir = path.join(cacheDir, 'chrome');
    if (!fs.existsSync(chromeDir)) return null;
    const platforms = fs.readdirSync(chromeDir);
    for (const platform of platforms) {
      const platformPath = path.join(chromeDir, platform);
      if (!fs.statSync(platformPath).isDirectory()) continue;
      // e.g. chrome-linux64, chrome-win, chromium-mac
      const subdirs = fs.readdirSync(platformPath);
      for (const sub of subdirs) {
        const subPath = path.join(platformPath, sub);
        if (!fs.statSync(subPath).isDirectory()) continue;
        const candidates = ['chrome', 'chromium', 'chrome.exe', 'Chromium'];
        for (const name of candidates) {
          const exe = path.join(subPath, name);
          if (fs.existsSync(exe)) return exe;
          const winExe = path.join(subPath, name, 'chrome.exe');
          if (fs.existsSync(winExe)) return winExe;
        }
      }
    }
  } catch (err) {
    console.warn('puppeteerLaunch: error scanning cache dir:', err.message);
  }
  return null;
}

/**
 * Returns launch options for puppeteer.launch() so Chrome works on Render and similar hosts.
 * - Uses PUPPETEER_EXECUTABLE_PATH if set (explicit Chrome path).
 * - On Render, falls back to Chrome in .puppeteer-cache if env cache path is wrong.
 * - Adds headless args required for constrained environments.
 */
function getPuppeteerLaunchOptions(extraArgs = []) {
  const options = {
    headless: true,
    args: [...HEADLESS_ARGS, ...extraArgs]
  };

  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executablePath && executablePath.trim()) {
    options.executablePath = executablePath.trim();
    return options;
  }

  // On Render, Puppeteer may still resolve to /opt/render/.cache/puppeteer.
  // Explicitly use Chrome from project .puppeteer-cache if present.
  if (process.env.RENDER === 'true') {
    if (cachedProjectChromePath !== null) {
      if (cachedProjectChromePath) options.executablePath = cachedProjectChromePath;
      return options;
    }
    const projectCache = path.join(process.cwd(), '.puppeteer-cache');
    cachedProjectChromePath = findChromeInCacheDir(projectCache) || false;
    if (cachedProjectChromePath) {
      console.log('Using Chrome from project cache:', cachedProjectChromePath);
      options.executablePath = cachedProjectChromePath;
    }
  }

  return options;
}

module.exports = { getPuppeteerLaunchOptions, HEADLESS_ARGS };
