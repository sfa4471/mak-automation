# QA Report: PDF Generation & Report Tables — Multi-Tenant Fix

**Date:** 2025-02-13  
**Scope:** Branch DB (multi-tenant) — Rebar (and all task-type) PDF/save 500 and 404  
**Context:** QA / 20+ year software & database experience

---

## 1. Symptoms You Saw

- **500 Internal Server Error** on `GET/POST /api/rebar/task/7` when loading or auto-saving the rebar form.
- **404 Not Found** on `/api/pdf/rebar/7` with message: *"No report data found. Please save the form first."*
- RebarForm.tsx: *"Error auto-saving initial data"* and *"PDF generation error: No report data found. Please save the form first."*

So: save was failing (500), so no rebar report row existed, so PDF correctly returned 404 and the client showed “save the form first”.

---

## 2. Root Cause (Database + Multi-Tenancy)

After the **multi-tenancy migration** (`20250210000000_add_multi_tenancy.sql`), these tables have a **NOT NULL** `tenant_id` column:

- `rebar_reports`
- `density_reports`
- `wp1_data`
- `proctor_data`

The report routes (rebar, density, wp1, workpackages, proctor) were still:

- **Inserting** without `tenant_id` → Supabase raised a NOT NULL constraint violation → **500**.
- **Getting/updating** only by `taskId` (or `workPackageId`). That did not cause the 500, but for consistency and correct scoping we now also scope by `tenant_id` where applicable.

So the **primary** fix was: **set `tenant_id` on every insert (and optionally on update) for all report tables**, using the task’s (or work package’s) tenant.

---

## 3. Fixes Applied (Code Changes)

### 3.1 Rebar (`server/routes/rebar.js`)

- **GET /api/rebar/task/:taskId**  
  - Resolve `tenant_id` from the loaded task (`task.tenant_id ?? task.tenantId`).  
  - Fetch rebar report with `{ taskId, tenant_id }` when using Supabase so the read is tenant-scoped.

- **POST /api/rebar/task/:taskId**  
  - Resolve `tenant_id` from the task.  
  - Add `tenant_id` to `rebarData` on insert.  
  - Use `{ taskId, tenant_id }` for the “existing” check and for update conditions.

Result: Rebar save succeeds; PDF can find the report.

### 3.2 Density (`server/routes/density.js`)

- **GET /api/density/task/:taskId**  
  - Resolve `tenant_id` from the task; get density report with `{ taskId, tenant_id }` when using Supabase.

- **POST /api/density/task/:taskId**  
  - Add `tenant_id` to `densityData` (from task).  
  - Use `{ taskId, tenant_id }` for get/existing check and update.  
  - Use the same conditions when returning the created/updated record.

### 3.3 WP1 by task (`server/routes/wp1.js`)

- **GET /api/wp1/task/:taskId**  
  - Resolve `tenant_id` from the task; get `wp1_data` with `{ taskId, tenant_id }` when using Supabase.

- **POST /api/wp1/task/:taskId**  
  - Add `tenant_id` to `wp1Data` (from task).  
  - Use `{ taskId, tenant_id }` for existing check and update; use same conditions when re-fetching after insert/update.

### 3.4 WP1 by work package (`server/routes/workpackages.js`)

- **GET /:id/wp1**  
  - Resolve `tenant_id` from the work package; get `wp1_data` with `{ workPackageId, tenant_id }` when using Supabase.

- **POST /:id/wp1**  
  - Add `tenant_id` to `wp1Data` (from work package).  
  - Use `{ workPackageId, tenant_id }` for existing check, update, and final get.

### 3.5 Proctor (`server/routes/proctor.js`)

- **GET /api/proctor/task/:taskId** (and the GET used by the “Proctor #N” fetch)  
  - Resolve `tenant_id` from the task; get `proctor_data` with `{ taskId, tenant_id }` when using Supabase.

- **POST save**  
  - Add `tenant_id` to `proctorData` (from task).  
  - Use `{ taskId, tenant_id }` for existing check, update, and re-fetch after insert.

### 3.6 PDF routes (`server/routes/pdf.js`)

- **GET /api/pdf/rebar/:taskId**  
  - Resolve `tenant_id` from the task; fetch rebar report with `{ taskId, tenant_id }` so the PDF uses the correct tenant’s report.

- **GET /api/pdf/density/:taskId**  
  - Same pattern: resolve `tenant_id` from the task and fetch density report with `{ taskId, tenant_id }`.

No change to the PDF logic itself—only that report data is now loaded with tenant scoping and that the underlying save (rebar/density/wp1/proctor) succeeds because `tenant_id` is set.

---

## 4. Summary Table

| Area        | Table / API              | Change                                                                 |
|------------|---------------------------|------------------------------------------------------------------------|
| Rebar      | `rebar_reports`           | Add `tenant_id` to get/insert/update; scope by task’s tenant            |
| Density    | `density_reports`         | Add `tenant_id` to get/insert/update; scope by task’s tenant            |
| WP1 (task) | `wp1_data`                | Add `tenant_id` to get/insert/update; scope by task’s tenant            |
| WP1 (WP)   | `wp1_data`                | Add `tenant_id` to get/insert/update; scope by work package’s tenant    |
| Proctor    | `proctor_data`            | Add `tenant_id` to get/insert/update; scope by task’s tenant            |
| PDF        | Rebar / Density           | Load report by `taskId` + `tenant_id` for current task                 |

---

## 5. How to Verify

1. **Restart the server** so it picks up the code changes (and, if applicable, `.env.local` for branch DB).
2. **Rebar**  
   - Open a REBAR task (e.g. task 7).  
   - Confirm the form loads (no 500 on GET).  
   - Save / auto-save (no 500 on POST).  
   - Click “Download PDF” — should get 200 and the PDF (no 404 “No report data found”).
3. **Other task types**  
   - Repeat for Density, WP1 (Compressive Strength), and Proctor: load form, save, generate PDF. All should work without 500/404 from missing or unscoped report data.
4. **Branch DB**  
   - Ensure you’re on branch DB (`.env.local` with branch Supabase URL; server log shows branch project and “from .env.local — branch DB”). Then run the same checks.

---

## 6. Why This Fixes “All Other Tasks” Too

The same schema rule applies to every report table that has **NOT NULL tenant_id**:

- **rebar_reports** → rebar tasks and rebar PDF.
- **density_reports** → density tasks and density PDF.
- **wp1_data** → WP1 (compressive strength) tasks and work packages, and WP1 PDF.
- **proctor_data** → proctor tasks and any proctor-based flows.

By adding `tenant_id` to every get/insert/update for these tables (and scoping PDF report fetches by tenant), we:

- Eliminate the 500 on save for rebar and for all other report types.
- Ensure PDF endpoints find the correct report and return 200 instead of 404 when the form has been saved.

---

## 7. No Schema or Migration Required

All changes are in application code. The branch (and main) DB already have `tenant_id` on these tables from the multi-tenancy migration. No new migration or manual SQL is required.

If you want, we can add a short “PDF & report tables multi-tenant” note to your main deployment or QA checklist so future branches or environments are verified the same way.
