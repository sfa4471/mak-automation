# QA Report: Workflow Path "Does Not Exist" on crestfield.app (Cloud Backend)

**Prepared as:** Expert QA analysis (architecture and root-cause focus)  
**Issue:** Folder `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE` reported as not existing; status shows **Configured: Yes**, **Valid: No**, **Writable: No**. User confirms folder exists and is connected to OneDrive; it worked before.  
**Context:** User accesses the app via **https://www.crestfield.app** (production / main code).

---

## 1. Executive summary

The behavior is **by design given the current architecture**, not a bug in path or OneDrive logic. The workflow base path is **validated on the server**. When you use **crestfield.app**, the frontend talks to a **cloud backend** (e.g. Render). That backend runs on **Linux** and has **no access to your PC’s C: drive**. So:

- The path is **stored** (Configured: **Yes**).
- The server **checks** that path on **its own** filesystem → path does not exist there → **Valid: No**, **Writable: No**.
- The message *"Folder … does not exist. Please create it … Or ensure OneDrive is synced"* is misleading in this setup, because the problem is **where** the check runs (cloud server), not whether the folder exists on your machine.

It “worked before” when the **backend was running on your Windows PC** (e.g. `npm run dev`), so the server could see `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE`. With crestfield.app, the server is in the cloud and can never see that path.

---

## 2. Root cause (architecture)

| Component        | When using crestfield.app | Where path is checked |
|-----------------|---------------------------|-------------------------|
| Frontend         | Vercel (crestfield.app)   | —                       |
| Backend (API)    | Render / cloud (Linux)   | **On the server**        |
| Workflow path    | `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE` | **Server filesystem** |

- **Settings → Workflow path:**  
  - GET/POST `/api/settings/workflow/path` and GET `/api/settings/workflow/status` run on the **backend**.
- **Validation:**  
  - `server/utils/pdfFileManager.js` → `validatePath()` uses `fs.existsSync()` / `fs.statSync()` / `fs.accessSync()` **on the machine where Node runs** (the cloud server).
- **Result:**  
  - On Render (Linux), `C:\Users\fadyn\...` does not exist and is not writable → **Valid: No**, **Writable: No**, and the “folder does not exist” message is returned.

So the issue is **not**:

- OneDrive sync on your PC  
- The folder missing in File Explorer  
- Permissions on your machine  

It **is**:

- **Cloud backend cannot access a path that only exists on your local Windows PC.**

---

## 3. Evidence in code

- **Where the error message is produced**  
  `server/utils/pdfFileManager.js` (around 118–131): when `fs.existsSync(trimmedPath)` is false for the OneDrive path, it returns the message you see (create folder in File Explorer / ensure OneDrive is synced).

- **Where status is computed**  
  `server/routes/settings.js`: GET `/api/settings/workflow/status` loads `workflow_base_path` from the DB, then calls `validatePath(workflowPath)` from `pdfFileManager.js`. The result is what the UI shows as Configured / Valid / Writable.

- **Where validation runs**  
  All of this runs in the Node process on the **host where the API is deployed** (e.g. Render), i.e. **not** on your PC.

---

## 4. Why it worked before

- **Before:** Backend ran **locally** on your Windows machine (e.g. `npm run dev`). The same machine had `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE`, so `fs.existsSync()` and writability checks succeeded.
- **Now:** You use **crestfield.app** → frontend on Vercel, API on Render (or similar) → validation runs on the cloud server → Windows path never exists there.

So the path and OneDrive setup on your PC are unchanged; only the **runtime context** of the backend changed (local vs cloud).

---

## 5. Recommendations

### A. Use workflow path only when the backend runs on the same machine as the path (recommended mental model)

- **crestfield.app (production):**  
  - Workflow/OneDrive path is intended for **server-accessible** storage.  
  - A path like `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE` will **always** show Invalid/Not Writable because the cloud server cannot see it.  
- **Local run (`npm run dev`):**  
  - Backend and path are on the same PC → validation and PDF/project folder creation can work as before.

### B. Make the UI explain “cloud vs local path” (implemented in codebase)

- **Server:** If the path looks like a **Windows absolute path** (e.g. `C:\`, `D:\`) and the server is **not** Windows (`process.platform !== 'win32'`), the API should return a **specific** error/message (e.g. “This path is on a Windows PC. The app is currently using a cloud server that cannot access your computer. Use this path when running the app locally, or use a path that exists on the server.”).
- **Client:** Settings can show this message when status is Valid: No / Writable: No and the backend returns this “local path on cloud” reason, so users are not told to “create the folder” or “sync OneDrive” when the real issue is cloud vs local.

### C. For production (crestfield.app) if you need server-side project/PDF storage

- Configure a path that **exists on the cloud server** (e.g. a directory on Render’s filesystem or a mounted volume), **or** use cloud storage (e.g. S3) if you add that integration.  
- Do **not** expect `C:\Users\...` or any other local PC path to ever become Valid/Writable when the API runs in the cloud.

### D. For local OneDrive workflow (same machine as backend)

- Run the app locally (`npm run dev`).  
- Set workflow path to `C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE`.  
- Ensure the folder exists and OneDrive is synced; then Valid and Writable can show Yes again.

---

## 6. Summary table

| Scenario                          | Backend runs on   | Path like `C:\Users\...\MAK_DRIVE` | Valid / Writable |
|-----------------------------------|-------------------|-------------------------------------|-------------------|
| crestfield.app (production)       | Cloud (e.g. Render) | Checked on server (Linux)           | **No / No** (expected) |
| Local dev (`npm run dev`)         | Your Windows PC   | Checked on same PC                  | **Yes / Yes** if folder exists and is synced |

---

## 7. Conclusion

The “folder does not exist” and **Valid: No**, **Writable: No** on crestfield.app are caused by **validating a Windows path on a cloud (non-Windows) backend** that cannot access your computer. Improving the error message (and optionally allowing “store but do not validate” for known local paths) will make this clear to users; the next step in code is to add the server-side “Windows path on non-Windows server” detection and the corresponding user-facing message in Settings.
