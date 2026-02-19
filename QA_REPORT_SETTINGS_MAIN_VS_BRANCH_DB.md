# QA Report: Settings UI Difference — Main DB vs Branch DB

**Date:** 2025-02-13  
**Scope:** Same backend/frontend code, different database; Settings shows different behavior (folder picker vs manual path / Configured Yes vs No).  
**Perspective:** Expert software developer (20+ years) — root cause and fix.

---

## 1. What You’re Seeing

| Context | What you see |
|--------|----------------|
| **Main database** | “Choose a folder on this device.” Folder shows e.g. ✓ TEST_2. “Works in Chrome and Edge.” Feels like a folder picker; path is configured. |
| **Branch database** | “Configure the base folder location…” Manual path input, placeholder `C:\Users\YourName\OneDrive\Projects`, Test Path, Save Settings, Clear. **Current Status: Configured: No.** |

You want to know **why** the same codebase behaves differently.

---

## 2. Important Clarification: One Settings UI in Code

In this repo there is **only one** Settings UI for project folder:

- **Single component:** `client/src/components/admin/Settings.tsx`
- **Single pattern:** Manual path input + Test Path + Save Settings + Clear + “Current Status / Configured: Yes|No”.

The exact strings **“Choose a folder on this device”** and **“Works in Chrome and Edge”** do **not** appear in the codebase. So either:

1. **Same UI, different data:** Same form in both cases; on main DB the path is **returned** from the server (so the input is pre-filled and status is “Configured: Yes”), while on branch DB the path is **not** returned (empty input, “Configured: No”). The “folder picker” feel on main may be from having already chosen a folder (e.g. TEST_2) and that path being saved and shown.  
2. **Different build/deploy:** Main might be an older or different build that had a real folder-picker UI; branch is the current code with only the manual path form.

For the rest of this report we assume **(1)** and explain why the **server** returns different data for the same frontend.

---

## 3. Root Cause: Tenant-Scoped `app_settings` vs No Tenant in Queries

### 3.1 Schema Difference

| Database | `app_settings` shape | How workflow path is stored |
|----------|----------------------|-----------------------------|
| **Main** | Often SQLite or Supabase **without** multi-tenant migration. Single row per `key`. No `tenant_id`. | One global row: `key = 'workflow_base_path'`, `value = <path>`. |
| **Branch** | Supabase **with** multi-tenant migration (`20250210000000_add_multi_tenancy.sql`). | `app_settings` has `tenant_id NOT NULL` and unique `(tenant_id, key)`. One row per tenant per key. |

So:

- **Main:** One global “workflow_base_path” → backend can read it with `db.get('app_settings', { key: 'workflow_base_path' })` and the UI shows it → “Configured: Yes” and path like TEST_2.
- **Branch:** Rows are per-tenant. If the backend does **not** pass `tenant_id`, the query is wrong or returns nothing.

### 3.2 What the Code Does Today

In `server/routes/settings.js`:

- **GET** `/api/settings/workflow/path`
- **GET** `/api/settings/workflow/status`
- **POST** `/api/settings/workflow/path` (set path)
- **POST** `/api/settings/workflow/path/test`

all use:

- `db.get('app_settings', { key: 'workflow_base_path' })`
- `db.update('app_settings', ..., { key: 'workflow_base_path' })`
- `db.insert('app_settings', { key: 'workflow_base_path', ... })`

**None of these pass `tenant_id`.**

So:

- **Main (e.g. SQLite):** No `tenant_id` column → one row per key → query returns that row → frontend gets path and “Configured: Yes.”
- **Branch (Supabase + multi-tenant):**  
  - Query without `tenant_id` can return no row (e.g. no row for this tenant yet) or the “wrong” tenant’s row.  
  - Insert/update without `tenant_id` can violate NOT NULL or unique constraint, or write to the wrong row.

Result: on branch DB the API often returns **no path** and **configured: false** → same Settings UI shows empty field and “Configured: No.” So the **difference in behavior is from data/query, not from a second UI**.

---

## 4. Why This Matches Your Description

- **Main DB:** Backend returns the single global `workflow_base_path` → input pre-filled, status “Configured: Yes.” If you had previously chosen a folder (e.g. TEST_2), that path is shown; it can feel like “folder picker” behavior even though the UI is still the manual path form.
- **Branch DB:** Backend does not scope by tenant → no (or wrong) row → empty path and “Configured: No,” and the full “Configure the base folder location…” manual path form is visible with no value.

So: **same UI, different API responses** because **branch DB is tenant-scoped but the settings routes never use `tenant_id`.**

---

## 5. Fix (What Must Change)

To make branch DB behave like main (per-tenant path, correctly shown and saved):

1. **Settings routes (`server/routes/settings.js`)**  
   - Resolve the logged-in user’s **tenant_id** (e.g. load user by `req.user.id`, then `user.tenant_id`; or add `tenant_id` to JWT and use it).  
   - When using **Supabase**, include **tenant_id** in every `app_settings` read and write for workflow path.  
   - When using **SQLite** (no `tenant_id` on `app_settings`), keep current behavior (no tenant_id).

2. **Path resolution (`server/utils/pdfFileManager.js`)**  
   - `getWorkflowBasePath()` (and thus `getEffectiveBasePath()`) must be **tenant-aware** when the DB is Supabase: they should accept an optional **tenant_id** and query `app_settings` with `(tenant_id, key)` so project/PDF paths use the correct tenant’s folder.  
   - Call sites (e.g. project creation, PDF save) that have request context should pass the current user’s (or project’s) **tenant_id** into this path resolution.

3. **Auth (optional but recommended)**  
   - Include `tenant_id` (and optionally `tenantName`) in the JWT so every protected route can scope by tenant without an extra DB lookup.  
   - Then settings and path resolution can use `req.user.tenantId` when present.

4. **Branch DB data**  
   - After the code fix, the first time an admin saves the workflow path in Settings, the app will create the `app_settings` row for **that tenant** with the correct `tenant_id`. No need to seed manually if the UI is used once per tenant.

---

## 6. Summary Table

| Item | Main DB | Branch DB | Cause |
|------|--------|-----------|--------|
| **Schema** | One row per key (no tenant_id) | One row per (tenant_id, key) | Multi-tenant migration on branch only. |
| **Settings API** | Queries by `key` only → returns row | Queries by `key` only → no/wrong row | Settings routes don’t pass tenant_id. |
| **What frontend gets** | path + configured: true | path: null, configured: false | Different API responses. |
| **What you see** | Path filled, “Configured: Yes” (and e.g. TEST_2) | Empty path, “Configured: No” + full manual form | Same UI, different data. |

**Conclusion:** The difference is **not** two different UIs in the same codebase; it’s **tenant-unaware settings logic** against a **tenant-scoped** branch DB. Making `app_settings` access and workflow path resolution **tenant-aware** when using Supabase will align branch DB behavior with main (per-tenant path shown and saved correctly).

---

## 7. Recommendation

- Implement the fix above (tenant_id in settings routes and in `getWorkflowBasePath` / `getEffectiveBasePath` with tenant passed from request/project context).  
- Optionally add `tenant_id` to the JWT to avoid extra user lookups.  
- After deployment, use Settings on branch DB once per tenant to create that tenant’s `workflow_base_path` row; then “Configured: Yes” and the path will show as on main.

If you truly have a **different** UI on main (real “Choose a folder on this device” + folder picker), that would be from a different build or repo; this codebase only contains the manual path form. Aligning behavior across DBs still requires the tenant-aware settings and path resolution described above.

---

## 8. Implementation (Done)

The following changes were applied so branch DB behaves like main for Settings and workflow path:

1. **`server/routes/settings.js`** — Added `getTenantIdForRequest(req)`. GET/POST workflow path and GET workflow status now scope `app_settings` by `tenant_id` when using Supabase.
2. **`server/utils/pdfFileManager.js`** — `getWorkflowBasePath(tenantId)` and `getEffectiveBasePath(tenantId)` accept optional `tenantId`; all call chains (ensureProjectDirectory, getPDFSavePath, saveReportPDF) pass it through so the correct tenant's path is used.
3. **`server/routes/projects.js`** — Project creation sets `tenant_id` from the current user when Supabase; `ensureProjectDirectory` is called with `project.tenant_id`.
4. **`server/routes/pdf.js`** — `getTenantIdForRequest(req)` added; all three `saveReportPDF` call sites pass the current user's `tenant_id`.

After deploying and restarting the server, use Settings on the branch DB once per tenant to set the workflow path; it will be stored and shown per tenant like on main.
