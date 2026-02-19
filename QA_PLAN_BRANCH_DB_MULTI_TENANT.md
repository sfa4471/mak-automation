# QA Plan: Branch Database Multi-Tenant Support (Main DB Untouched)

**Date:** 2025-02-13  
**Scope:** Branch database only. Make branch DB fully support multi-tenant (multiple companies/clients). **Do not change main database schema or behavior.**  
**QA Perspective:** Expert in software development and database management (20+ years). Plan is double-checked for correctness and safe rollout.

---

## 1. Guardrails (Non-Negotiables)

| Rule | Meaning |
|------|--------|
| **Main DB untouched** | No migrations run on main. No code that changes behavior when using main (SQLite or Supabase without multi-tenant migration). |
| **Branch-only code** | All new logic is conditional: `db.isSupabase()` and/or presence of `tenant_id`. When not Supabase (or no tenant), behavior stays as today. |
| **No shared schema change on main** | Multi-tenant migration (`20250210000000_add_multi_tenancy.sql`) is applied **only** to the branch Supabase project. Main DB is never migrated. |

---

## 2. Prerequisites (Branch DB)

- [ ] Branch Supabase project exists (e.g. `uklvgcrzhhtpqtiwrbfw`).
- [ ] Multi-tenant migration has been run **only** on branch: `supabase/migrations/20250210000000_add_multi_tenancy.sql`.
- [ ] Default tenant exists: `tenants.id = 1` (e.g. "MAK Lone Star Consulting").
- [ ] At least one admin user in branch DB with `tenant_id = 1`: run `node scripts/create-admin-user.js` with `.env.local` pointing at branch.
- [ ] App uses branch when `.env.local` is present (Supabase URL/keys for branch); main when no `.env.local` or main env.

---

## 3. Current State (Already Done for Branch)

| Area | Status | Notes |
|------|--------|--------|
| **Schema (branch)** | Done | Migration adds `tenants`, `tenant_project_counters`, `tenant_id` on users, projects, workpackages, tasks, app_settings, etc.; unique (tenant_id, key) for app_settings; (tenant_id, project_number) for projects. |
| **Settings (workflow path)** | Done | GET/POST workflow path and status scope by `tenant_id` when Supabase; `getTenantIdForRequest()` used. |
| **Path resolution** | Done | `getWorkflowBasePath(tenantId)`, `getEffectiveBasePath(tenantId)`; project create and PDF save pass `tenant_id`. |
| **Project create** | Done | When Supabase, project insert includes `tenant_id` from current user; `ensureProjectDirectory(projectNumber, project.tenant_id)`. |
| **PDF save** | Done | All `saveReportPDF` call sites pass `tenant_id` from `getTenantIdForRequest(req)`. |

---

## 4. Gaps and Implementation Plan (Branch Only)

### 4.1 Login and tenant context (Critical)

**Gap:**  
- Today login uses `db.get('users', { email })`. On branch DB, unique is `(tenant_id, email)`, so same email can exist in multiple tenants. `db.get` with `.single()` would throw or return wrong user.  
- JWT and response do not include `tenantId`/`tenantName`, so downstream routes and frontend cannot rely on tenant without an extra DB lookup.

**Plan (branch only):**

1. When `db.isSupabase()`:
   - Use `db.all('users', { email })` (or Supabase `.eq('email', email)` without `.single()`).
   - If 0 rows → 401 Invalid credentials.
   - If 1 row → verify password; then load tenant (e.g. `db.get('tenants', { id: user.tenant_id })`), include `tenantId` and `tenantName` in JWT and in response.
   - If 2+ rows and request has no `tenantId` → 400 with `code: 'MULTIPLE_TENANTS'` and list of tenants (id, name) so client can show tenant picker and re-login with `tenantId`.
   - If 2+ rows and request has `tenantId` → find user where `user.tenant_id === tenantId`, verify password, then sign and return with tenant info.
2. When not Supabase: keep current behavior (single user by email, no tenant in JWT).
3. JWT payload when Supabase and user has tenant: add `tenantId`, `tenantName` (optional). Response `user` object: add `tenantId`, `tenantName`.

**Main:** Unchanged; main does not use Supabase multi-tenant schema, so `db.get('users', { email })` remains and no tenant in JWT.

---

### 4.2 Project number generation (Critical)

**Gap:**  
- Branch DB has `tenant_project_counters(tenant_id, year, next_seq)`. Current code uses `project_counters` (single global counter). So on branch, all tenants would share one sequence and project numbers could conflict; also tenant 2 would not have its own sequence.

**Plan (branch only):**

1. When `db.isSupabase()` and `tenantId` is provided:
   - Use table `tenant_project_counters`: get/insert row for `(tenant_id, year)`, increment `next_seq`, generate project number using tenant’s prefix if available (e.g. from `tenants.project_number_prefix`) or default `02`, format `PREFIX-YYYY-NNNN`.
2. When `db.isSupabase()` and no `tenantId` (e.g. legacy): keep using `project_counters` if that table still exists on branch, or treat as tenant 1 and use `tenant_project_counters` for tenant 1.
3. When not Supabase: keep current `project_counters` logic (SQLite or single counter).

**Main:** Unchanged; main does not use Supabase or uses single counter.

---

### 4.3 Project list and project by ID (Critical)

**Gap:**  
- GET `/api/projects`: On branch, Admin currently gets all projects (no `tenant_id` filter). Company B would see Company A’s projects.  
- GET `/api/projects/:id`: No check that the project belongs to the current user’s tenant; cross-tenant data leak possible.

**Plan (branch only):**

1. GET `/api/projects` when `db.isSupabase()`:
   - Resolve current user’s `tenant_id` (e.g. from JWT `req.user.tenantId` or from `db.get('users', { id: req.user.id })`).
   - Admin: filter projects by `tenant_id = <current user's tenant_id>`.
   - Technician: same tenant filter; then further restrict to projects with assigned tasks/workpackages for this user (within that tenant).
2. GET `/api/projects/:id` when `db.isSupabase()`:
   - After loading project by id, verify `project.tenant_id === current user's tenant_id`; if not, return 404 (project not found).
3. When not Supabase: keep current behavior (no tenant filter).

**Main:** Unchanged.

---

### 4.4 Other routes (Phase 2 – list only; no change in this phase)

- Workpackages, tasks, wp1, proctor, density, rebar, notifications: ensure all list/get/create/update/delete operations scope by `tenant_id` when Supabase (e.g. filter by tenant, or ensure resource’s tenant matches `req.user.tenantId`).  
- Technician create: when Supabase, create technician under current user’s tenant (`tenant_id` on user insert).  
- These can be done in a follow-up; the plan above covers the critical path: login, project numbers, project list/detail, settings, and PDF path (already done).

---

## 5. Verification Checklist (Double-Check It Works)

### 5.1 Main DB unchanged

- [ ] With main DB (no `.env.local`, or main Supabase without multi-tenant migration): login works as before; no tenant in JWT or response; project create works; project list returns all projects; Settings workflow path is single global path.
- [ ] No new migrations applied to main. No code path that assumes `tenant_id` exists on main (e.g. SQLite has no `tenant_id` on `app_settings`).

### 5.2 Branch DB – single tenant (tenant 1)

- [ ] Login with admin (tenant_id = 1): success; JWT and response include `tenantId: 1` and `tenantName`.
- [ ] Settings: set workflow path; GET path and status return that path; “Configured: Yes.”
- [ ] Create project: project has `tenant_id = 1`; project number uses `tenant_project_counters` for tenant 1; folder created under tenant 1’s path.
- [ ] GET /projects: returns only tenant 1’s projects.
- [ ] GET /projects/:id for a tenant-1 project: 200. GET /projects/:id for a tenant-2 project (if any): 404 when logged in as tenant 1.
- [ ] Generate PDF: PDF saved under tenant 1’s workflow path.

### 5.3 Branch DB – two tenants

- [ ] Create tenant 2 (e.g. “Company B”) in `tenants`; create admin user with `tenant_id = 2`.
- [ ] Login as tenant 2 admin: JWT has `tenantId: 2`, `tenantName` for Company B.
- [ ] Settings: tenant 2 sets path to `C:\CompanyB\PDFs`; tenant 1’s path remains unchanged; each sees only their path.
- [ ] Create project as tenant 2: project has `tenant_id = 2`; project number from `tenant_project_counters` for tenant 2 (e.g. 02-2025-0001 for tenant 2 independent of tenant 1’s sequence).
- [ ] GET /projects as tenant 2: only tenant 2’s projects; tenant 1’s projects not visible.
- [ ] GET /projects/:id: tenant 2 cannot access tenant 1’s project (404).
- [ ] PDF for tenant 2 project: saved under `C:\CompanyB\PDFs`.

### 5.4 Login – multiple tenants same email

- [ ] Two users with same email in different tenants (e.g. admin@example.com in tenant 1 and tenant 2). Login with email/password only: API returns 400 MULTIPLE_TENANTS with tenant list. Login with email + password + tenantId: success and JWT has correct tenant.

---

## 6. Implementation Order

1. **Login + tenant in JWT/response** (Section 4.1).  
2. **Project number generation** using `tenant_project_counters` when Supabase + tenantId (Section 4.2).  
3. **GET /projects and GET /projects/:id** tenant-scoped (Section 4.3).  
4. Run verification checklist (Section 5); fix any gaps.  
5. Document any Phase 2 items (workpackages, tasks, etc.) for future sprint.

---

## 7. Summary

| Item | Action | Main affected? |
|------|--------|----------------|
| Migration | Already applied on branch only | No |
| Settings + path resolution | Done; tenant-scoped when Supabase | No |
| Login | Use all users by email when Supabase; return and JWT include tenantId/tenantName; MULTIPLE_TENANTS when same email in multiple tenants | No |
| Project number | Use tenant_project_counters when Supabase + tenantId | No |
| GET projects / GET project/:id | Filter/validate by tenant when Supabase | No |

All changes are conditional on `db.isSupabase()` and/or `tenant_id`; main database remains untouched and behavior unchanged.

---

## 8. Implementation Status (Completed 2025-02-13)

| Item | Done | Notes |
|------|------|--------|
| **Login + tenant** | Yes | When Supabase: `db.all('users', { email })`; 0 → 401, 1 → success with tenant in JWT/response; 2+ → 400 MULTIPLE_TENANTS or login with body `tenantId`. JWT and response include `tenantId`, `tenantName`. |
| **GET /me** | Yes | When Supabase and user has tenant_id, response includes `tenantId`, `tenantName`. |
| **Technician create/list/update/delete** | Yes | Create: insert with current user's tenant_id; list: filter by tenant_id; update/delete: verify technician in same tenant. |
| **generateProjectNumber(tenantId)** | Yes | When Supabase + tenantId: uses `tenant_project_counters`, tenant's prefix; when Supabase no tenantId: legacy `project_counters`; SQLite: unchanged. |
| **Project create** | Yes | Resolve tenant before name check and project number; duplicate name per tenant; pass tenantId to generateProjectNumber; insert with tenant_id. |
| **GET /projects** | Yes | When Supabase: Admin filtered by req.user.tenantId; Technician list filtered by tenant_id. |
| **GET /projects/:id** | Yes | When Supabase and tenantId: return 404 if project.tenant_id !== user's tenant. |
| **PUT /projects/:id** | Yes | When Supabase: load project first, return 404 if wrong tenant; then update. |

**Main DB:** No code paths changed for SQLite or for Supabase without tenant (e.g. no `tenants` table). Login still uses single user by email when not Supabase; project number and project list/detail unchanged when not Supabase.

---

## 9. Verification (Run After Deploy)

- **Main:** Remove or rename `.env.local`, restart server. Login, create project, list projects, Settings — all behave as before. No tenant in JWT or response.
- **Branch:** Use `.env.local` with branch Supabase. Run migration if not already. Create admin: `node scripts/create-admin-user.js`. Login → JWT and user have tenantId/tenantName. Settings → set path → Configured Yes. Create project → project has tenant_id, number from tenant_project_counters. List projects → only that tenant's. Create second tenant and user → login as tenant 2 → only tenant 2's projects; tenant 2's path in Settings.
