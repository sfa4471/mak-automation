# QA Report: No Data (Projects / Tasks / Technicians) After Deploy

**Date:** 2025-02-11  
**Context:** Backend and frontend deployed successfully; user sees no projects, no tasks, no technicians.  
**Perspective:** Expert QA / 20+ year software developer — systematic root-cause and fixes.

---

## 1. How the app loads data (quick recap)

- **Dashboard** calls `GET /api/projects` → then for each project `GET /api/tasks/project/:id`, and `GET /api/workpackages/project/:id`.
- **Technicians** are loaded by Admin (e.g. Create Task, Manage Technicians) via `GET /api/auth/technicians`.
- All these routes use **tenant context**: they require `requireTenant` and filter by `tenant_id` (multi-tenant DB) or show all (legacy DB).

So if **projects list is empty**, the UI shows no projects and no tasks. If **technicians list is empty**, dropdowns/modals show no technicians.

---

## 2. Root causes (most likely first)

### A. Stale JWT missing `tenantId` (very common after deploy)

- After multi-tenant changes, the login response **always** puts `tenantId` (and `legacyDb`) in the JWT.
- If the user **did not log in again** after deploy, the browser still has an **old token** that may not include `tenantId`.
- Backend: `requireTenant` reads `req.user.tenantId ?? req.user.tenant_id`. If both are missing → **403 "Tenant context required"**.
- Frontend: 403 does **not** trigger the 401 interceptor (logout + redirect to login). So the app stays on the dashboard and list calls return 403; the client may treat that as “no data” or fail silently → **empty projects/tasks/technicians**.

**Fix:** User should **log out and log in again** to get a fresh JWT that includes `tenantId` and `legacyDb`.  
**Code fix:** Frontend should treat 403 with “Tenant context required” like 401: clear token and redirect to login (see Section 4).

---

### B. Production API URL not set (frontend calling wrong host)

- In production (non-localhost), the client uses:
  - `REACT_APP_API_BASE_URL` or
  - `REACT_APP_API_URL` or
  - if both are unset: **empty string** → requests go to **same origin**.
- If the **frontend** is on Vercel and the **backend** is on Render (or another host), and neither env var is set at **build time**, the browser will call e.g. `https://your-app.vercel.app/api/projects` → 404 (no API there) → no data.

**Fix:** In the host where you build the frontend (e.g. Vercel), set:
- `REACT_APP_API_BASE_URL=https://your-backend.onrender.com/api`  
  (or your real backend URL; must end with `/api` if your routes are under `/api`).  
Then **rebuild and redeploy** the frontend (React env vars are baked in at build time).

---

### C. Production database is the “branch” or an empty DB

- If the **deployed backend** uses the **branch** Supabase project (e.g. via env pointing to branch), that DB may have **no projects, no tasks, no technicians** (except the admin you created with `create-admin-user.js`).
- So “no data” is **expected** until you create projects/tasks/technicians there, or point production to the **main** Supabase project.

**Fix:** Confirm which Supabase project the production backend uses (`SUPABASE_URL` in backend env). If it should be main, set main project URL and keys; if it’s branch, either seed data or switch to main.

---

### D. Multi-tenant migration not run on production DB

- If production DB has **no** multi-tenancy migration (no `tenants` table, no `tenant_id` on `projects`/`tasks`/`users`), the backend may still send `tenantId` in the JWT and set `legacyDb = false` when a tenant row exists.
- If the migration was run only on a different DB, production could be in an inconsistent state (e.g. columns missing or not backfilled). Then tenant-scoped queries might return no rows or error.

**Fix:** Run the same multi-tenancy migration on the **production** Supabase project that the deployed backend uses, and ensure backfill (`tenant_id = 1`) was applied.

---

## 3. Quick diagnostic steps

1. **Re-login**  
   Log out, then log in again. If data appears, the issue was almost certainly a **stale JWT without tenantId** (Section 2A).

2. **Browser Network tab**  
   - Open DevTools → Network.  
   - Reload dashboard.  
   - Check:
     - `GET /api/projects` (or full backend URL):
       - **200** with `[]` → backend is reached; DB has no projects for this tenant (or wrong DB).  
       - **403** → likely “Tenant context required” (stale token).  
       - **401** → token missing or invalid (you’d usually be redirected to login).  
       - **404** → wrong API base URL (Section 2B).

3. **Check token payload (optional)**  
   - After login, decode the JWT at [jwt.io](https://jwt.io) (payload only; no need to send anywhere).  
   - Ensure it contains `tenantId` (and ideally `legacyDb`). If not, re-login.

4. **Backend env**  
   - On the server that runs the API, confirm `SUPABASE_URL` (and keys) point to the DB you expect (main vs branch).  
   - Confirm multi-tenancy migration has been run on that project.

---

## 4. Code fix: 403 “Tenant context required” → re-login

When the backend returns **403** with message “Tenant context required”, the user’s token is missing tenant context. The frontend should clear auth and send them to login so they get a new JWT.

**Change in `client/src/api/api.ts`:**

- In the response error interceptor, in addition to handling **401**, treat **403** with body containing “Tenant context required” (or similar) by:
  - Clearing token and tenant/user from storage.
  - Redirecting to `/login`.

This way, after a deploy that introduces tenant in the JWT, users with old tokens will be prompted to log in again and will then see data (assuming correct API URL and DB).

---

## 5. Summary

| Likely cause                         | Symptom              | Action |
|--------------------------------------|----------------------|--------|
| Stale JWT (no `tenantId`)           | 403 on list APIs     | Re-login; add 403 tenant handler in client (Section 4). |
| Wrong/missing production API URL    | 404 on /api/*        | Set `REACT_APP_API_BASE_URL` at build; rebuild frontend. |
| Production DB = branch / empty       | 200 with `[]`        | Point backend to main DB or seed branch DB. |
| Migration not run on production DB  | 500 or empty lists   | Run multi-tenancy migration on production Supabase. |

**Immediate steps for you:**  
1. Log out and log in again on the deployed app.  
2. If still no data, check Network tab for `/api/projects` (status and response body).  
3. Verify production backend env: `SUPABASE_URL` and, for frontend build, `REACT_APP_API_BASE_URL`.

---

## 6. Production checklist (after deploy)

- **Backend (e.g. Render):**  
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` point to the DB you want (main vs branch).  
  - Multi-tenancy migration has been run on that Supabase project.  
  - At least one admin user exists (create via `node scripts/create-admin-user.js` if using branch/empty DB).

- **Frontend (e.g. Vercel):**  
  - `REACT_APP_API_BASE_URL` is set to the **full backend API base** (e.g. `https://your-app.onrender.com/api`).  
  - Frontend was **rebuilt** after setting this (React env vars are fixed at build time).

- **Users:**  
  - After any deploy that changes JWT shape (e.g. adding `tenantId`), users should **log out and log in once** to get a fresh token. The app now redirects to login on 403 “Tenant context required” so stale tokens are cleared automatically.

---

## 7. PDF 404 after deploy (fixed)

**Cause 1 (wrong host):** PDF requests used `getApiBaseUrl()` from `utils/apiUrl.ts` (build-time only), so they could hit a different host than the API → 404.

**Cause 2 (double /api):** Even after switching to `api.ts`, the base URL sometimes still ended with `/api` (e.g. env or tenant override). Code then did `baseUrl + "/api/proctor/49/pdf"` → **/api/api/proctor/49/pdf** → 404 "Cannot POST /api/api/proctor/49/pdf".

**Fix:**  
- Added **`getApiPathPrefix()`** in `api.ts`: returns `/api` (same-origin) or `https://origin.com/api` (remote), so there is exactly one `/api` in the path.  
- All PDF and proctor PDF URLs now use **`getApiPathPrefix() + '/proctor/49/pdf'`** (or `/pdf/density/...`, etc.), so the path is always `/api/proctor/...` or `/api/pdf/...`, never `/api/api/...`.  
- **`getApiBaseUrlForFetch()`** was also hardened with `trim()` and the `URL` API so a base ending in `/api` is normalized to origin-only before any concatenation.

**Note:** A 404 on **GET /api/proctor/project/81/proctor/3** (and similar) is expected when that proctor number does not exist for that project yet. The server returns 404 in that case; it is not a double-/api or wrong-host issue.
