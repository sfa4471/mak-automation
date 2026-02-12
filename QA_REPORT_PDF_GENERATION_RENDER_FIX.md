# QA Report: PDF Generation Error on Render (Chrome Not Found)

**Issue:** After deploy, density (and other) PDF generation fails with:

```
Could not find Chrome (ver. 143.0.7499.169). This can occur if either
 1. you did not perform an installation before running the script (e.g. `npx puppeteer browsers install chrome`) or
 2. your cache path is incorrectly configured (which is: /opt/render/.cache/puppeteer).
```

**Root cause:** On Render, Puppeteer was looking for Chrome in `/opt/render/.cache/puppeteer`, but Chrome was either not installed during build or was installed into the project’s `.puppeteer-cache` directory. The runtime cache path was never pointed at the project directory.

---

## Fixes Applied

### 1. Server startup (Render)

- **File:** `server/index.js`
- On Render (`RENDER=true`), if `PUPPETEER_CACHE_DIR` is not set, it is set to `./.puppeteer-cache` (project root) so Puppeteer looks for Chrome in the same place it’s installed during build.

### 2. Launch fallback (explicit Chrome path)

- **File:** `server/utils/puppeteerLaunch.js`
- When `RENDER=true` and `PUPPETEER_EXECUTABLE_PATH` is not set, the server scans `./.puppeteer-cache` for the Chrome binary (e.g. `chrome` or `chromium`) and, if found, sets `executablePath` so Puppeteer uses that binary regardless of env cache path.
- Result is resilient to Render’s default cache path and works as long as Chrome is present in `.puppeteer-cache` after build.

### 3. Single Render build script

- **File:** `package.json`
- New script: `build:render` = `npm install && npm run install-chrome && npm run build`
- Ensures Chrome is installed into `.puppeteer-cache` during the Render build.

### 4. Docs

- **File:** `RENDER_PUPPETEER_SETUP.md`
- Build command section updated to recommend `npm run build:render` (or the equivalent long form).

---

## What You Must Do on Render

1. **Build command**  
   In Render Dashboard → your Web Service → **Build Command**, set:
   ```bash
   npm run build:render
   ```
   (Or: `npm install && npm run install-chrome && npm run build`.)

2. **Environment (optional but recommended)**  
   In **Environment**, add:
   - Key: `PUPPETEER_CACHE_DIR`
   - Value: `./.puppeteer-cache`

3. **Redeploy**  
   Save and trigger a new deploy (e.g. Manual Deploy or push a commit). After the build, you should see in the build log:
   - “Installing Chrome for Puppeteer to …/.puppeteer-cache”
   - “Chrome install complete.”

4. **Verify**  
   Generate a density PDF again. The 500 error from “Could not find Chrome” should be gone.

---

## Other Messages You Saw (for context)

- **“No soil specs defined in Project Details”**  
  Warning from the Density form when the project has no soil specs. Add soil specs in Project Details if you want them on the PDF; the PDF can still generate without them.

- **404 on `/api/proctor/project/81/proctor/2` (and 3, 4, 5, 6)**  
  Normal when those proctor numbers don’t exist for that project. The form requests proctor data for dropdowns; 404 just means “no proctor #N.” It does not indicate a broken API or PDF setup.

- **500 on `/api/pdf/density/50`**  
  This was the real failure, caused by Chrome not being found. The changes above address this.

---

## Summary

- **Code:** Render now uses the project’s `.puppeteer-cache` for Chrome (startup env + explicit executable path fallback).
- **Build:** Use `npm run build:render` on Render so Chrome is installed during build.
- **After redeploy:** PDF generation should work; other messages (soil specs, proctor 404s) are expected in the scenarios described above.
