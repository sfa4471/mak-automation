# SaaS Multi-Tenant Implementation Summary

Implemented per **SAAS_CONVERSION_MASTER_PLAN.md** Section 2 (working directory) and Section 6 (implementation order). Backend and database work is in place; frontend (TenantContext, tenant in header/settings) remains for you to complete.

---

## 1. Branch and env

- **Branch:** Create `feature/multi-tenant-saas` locally if needed:  
  `git checkout -b feature/multi-tenant-saas`  
  (Creation from this environment may hit local git constraints; run the above on your machine.)
- **DB:** Use a **separate Supabase project** for dev. Point `.env` / `.env.local` to that project and run the new migration there first.

---

## 2. Database (done)

- **Migration:** `supabase/migrations/20250210000000_add_multi_tenancy.sql`
  - Creates `tenants` and `tenant_project_counters`.
  - Adds nullable `tenant_id` to: `users`, `projects`, `workpackages`, `tasks`, `wp1_data`, `proctor_data`, `density_reports`, `rebar_reports`, `notifications`, `task_history`, `app_settings`.
  - Inserts default tenant (id = 1, "MAK Lone Star Consulting").
  - Backfills all existing rows with `tenant_id = 1` and backfills `tenant_project_counters` from `project_counters`.
  - Adds tenant-scoped uniques: `(tenant_id, project_number)`, `(tenant_id, key)` for app_settings, `(tenant_id, email)` for users.
  - Sets `tenant_id` NOT NULL and adds indexes.
- **Run:** Apply this migration only in your **dev** Supabase project (e.g. via Supabase dashboard SQL or CLI). Do not run on production until you are ready.

---

## 3. Auth and tenant context (done)

- **server/routes/auth.js**
  - Login loads user → loads tenant by `user.tenant_id`; rejects if tenant missing or inactive.
  - JWT and login response include `tenantId`, `tenantName`, `tenantSubdomain`.
  - Optional login body field: `tenantId` (for when same email exists in multiple tenants).
  - Create/list/update/delete technicians scoped by `req.tenantId`; technician list filtered by tenant.
- **server/middleware/tenant.js** (new)
  - `requireTenant`: sets `req.tenantId` from JWT; 403 if missing.
  - `validateTenantResource(resourceGetter)` for optional per-resource tenant check.
- JWT payload already exposes `tenantId` / `tenantName` via existing auth middleware.

---

## 4. Isolation (done)

- **requireTenant** is applied on all tenant-scoped routes.
- **Projects:** List/get/create/update filtered or set by `tenant_id`; create uses `generateProjectNumber(tenantId)`.
- **Tasks:** List/get/create/update and all dashboard/status/approve/reject routes use `req.tenantId` and task tenant checks; `task_history` and notifications get `tenantId` where applicable.
- **Workpackages:** All routes require tenant; project and workpackage tenant checked on access.
- **Reports:** wp1, density, rebar, proctor — requireTenant + tenant check after loading task; insert/update includes `tenantId` for wp1_data, density_reports, rebar_reports, proctor_data.
- **Settings:** app_settings read/write by `(tenantId, key)`.
- **Notifications:** createNotification accepts optional `tenantId`; task creation passes it.

---

## 5. Project numbering (done)

- **server/routes/projects.js**
  - `generateProjectNumber(tenantId)` uses `tenant_project_counters` and tenant’s `project_number_prefix` (default `02`) and format.
  - Project create sets `tenant_id` and uses this generator.

---

## 6. Logo and address (done)

- **server/routes/pdf.js**
  - `getTenant(tenantId)`, `getTenantAddress(tenant)`, `getLogoBase64(tenantId)` (async) for tenant logo and address.
  - WP1, density, and rebar PDF handlers resolve tenant from task/project and use these helpers.
- **server/routes/tenants.js** (new)
  - `GET /api/tenants/me` — current tenant info (name, address, logo path, project number format, etc.).
  - `PUT /api/tenants/me` — update tenant company info (admin, own tenant).
  - `POST /api/tenants/logo` — stub (501); implement with file upload when ready.
- **server/index.js** — mounts `/api/tenants`.

---

## 7. Frontend (your turn)

- **CODE_CHANGES_CHECKLIST.md** lists:
  - TenantContext (tenantId, tenantName, logoUrl, companyAddress).
  - AuthContext / login flow storing tenant from response.
  - auth.ts types for login response with tenant fields.
  - Header/layout showing tenant name/logo.
  - Settings/Admin section for tenant branding and tenants API.
  - client/src/api/tenants.ts: getTenantMe(), updateTenantMe(), uploadTenantLogo().

---

## 8. Testing (recommended)

- In dev DB: create a second tenant and users in each; log in as each and confirm no cross-tenant data.
- Create a project as tenant A and check project number uses tenant A prefix/counter.
- Generate a PDF and confirm tenant A logo/address (or default if no custom logo).
- Repeat for tenant B and verify isolation and branding.

---

## 9. Merge to main

- Only after you’re satisfied: merge `feature/multi-tenant-saas` into `main`, then run the same migration on production with a backup and rollback plan.

---

**Files touched (summary):**

- **New:** `server/middleware/tenant.js`, `server/routes/tenants.js`, `supabase/migrations/20250210000000_add_multi_tenancy.sql`
- **Updated:** auth, projects, tasks, workpackages, wp1, density, rebar, proctor, notifications, settings, pdf, index (mount tenants)
