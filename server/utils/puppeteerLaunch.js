/**
 * Shared Puppeteer launch options for PDF generation.
 * Supports Render and other cloud environments where Chrome must be installed
 * during build and found via PUPPETEER_CACHE_DIR or PUPPETEER_EXECUTABLE_PATH.
 */

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

/**
 * Returns launch options for puppeteer.launch() so Chrome works on Render and similar hosts.
 * - Uses PUPPETEER_EXECUTABLE_PATH if set (explicit Chrome path).
 * - Otherwise Puppeteer uses its default (or PUPPETEER_CACHE_DIR from env) to find Chrome.
 * - Adds headless args required for constrained environments.
 */
function getPuppeteerLaunchOptions(extraArgs = []) {
  const options = {
    headless: true,
    args: [...HEADLESS_ARGS, ...extraArgs]
  };

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executablePath && executablePath.trim()) {
    options.executablePath = executablePath.trim();
  }

  return options;
}

module.exports = { getPuppeteerLaunchOptions, HEADLESS_ARGS };
