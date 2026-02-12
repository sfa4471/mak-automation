# Puppeteer / Chrome PDF on Render

PDF generation uses Puppeteer and headless Chrome. On Render, Chrome must be installed **during the build** into a directory that is **deployed with the app**. The default `/opt/render/.cache/puppeteer` often does not persist or is not writable, so we use a **project-local cache** (`.puppeteer-cache`).

## Do this on Render (required)

### 1. Environment variable

In **Render Dashboard** → your Web Service → **Environment**:

| Key | Value |
|-----|--------|
| `PUPPETEER_CACHE_DIR` | `./.puppeteer-cache` |

So at **build** and **runtime** Puppeteer uses the project folder `.puppeteer-cache` (Chrome is installed there during build and found there at runtime).

### 2. Build command

Set **Build Command** to (use one of these):

```bash
npm run build:render
```

or the full form:

```bash
npm install && npm run install-chrome && npm run build
```

- `npm run install-chrome` runs `scripts/install-chrome.js`, which sets `PUPPETEER_CACHE_DIR` to `./.puppeteer-cache` and runs `npx puppeteer browsers install chrome`, so Chrome is downloaded into the repo and deployed with the app.

### 3. Redeploy

Save, then trigger a **Manual Deploy** or push a commit. After the build finishes, PDF generation should work.

---

## What the project does

- **`scripts/install-chrome.js`** – Installs Chrome into `./.puppeteer-cache` (used in Render build).
- **`npm run install-chrome`** – Calls that script (used in Render Build Command).
- **`postinstall`** – Still runs `npx puppeteer browsers install chrome` (for local dev); `|| true` so a failed install doesn’t break `npm install`.
- **`server/utils/puppeteerLaunch.js`** – Launch options; respects `PUPPETEER_EXECUTABLE_PATH` if you set it.

---

## If you still see “Could not find Chrome”

1. **Check Render build log**  
   You should see “Installing Chrome for Puppeteer to /opt/render/project/src/.puppeteer-cache” (or similar) and “Chrome install complete.” If not, the Build Command may be wrong or the step may be failing.

2. **Confirm env on Render**  
   `PUPPETEER_CACHE_DIR` must be set to `./.puppeteer-cache` for the **Web Service** (so runtime uses the same path).

3. **Optional: explicit Chrome path**  
   If you know the exact Chrome path after install, set:
   - `PUPPETEER_EXECUTABLE_PATH` = path to the `chrome` (or `chromium`) binary inside `.puppeteer-cache`.  
   The server uses this in `server/utils/puppeteerLaunch.js`.

---

## Local development

- Run `npm install` (postinstall will try to install Chrome).  
- Or run `npm run install-chrome` to install into `./.puppeteer-cache`.  
- `.puppeteer-cache/` is in `.gitignore` and is not committed.

---

## 404 on `/api/proctor/project/81/proctor/2` (etc.)

Those 404s are **expected** when that proctor number does not exist for that project. The Density form tries to load proctor data for dropdowns; if no Proctor #2, #3, … exist yet, the server returns 404. They are **not** a sign that the API or PDF setup is broken. You can ignore them or add Proctor tasks for that project to fill the dropdowns.
