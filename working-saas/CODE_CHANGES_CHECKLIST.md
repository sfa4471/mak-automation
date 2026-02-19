# SaaS Conversion — Code Changes Checklist

Use this alongside **SAAS_CONVERSION_MASTER_PLAN.md**. Tick items as you implement on branch `feature/multi-tenant-saas`.

---

## Backend

### Auth & tenant context
- [x] **server/routes/auth.js** — Load tenant on login; add `tenantId`, `tenantName` to JWT and login response; reject if tenant inactive.
- [x] **server/middleware/auth.js** — Decoded JWT exposes `tenantId` (and `tenantName`) for downstream use.
- [x] **server/middleware/tenant.js** (NEW) — `requireTenant`, optional `validateTenantResource`.
- [x] **server/index.js** — Mount tenant routes if you add `/api/tenants` (e.g. logo, settings).

### Projects
- [x] **server/routes/projects.js** — All list/get/create/update/delete filter or set `tenant_id`; use `generateProjectNumber(tenantId)` and `tenant_project_counters`.

### Tasks
- [x] **server/routes/tasks.js** — All queries and inserts scoped by tenant (e.g. join project or filter tasks by `tenant_id`).

### Workpackages
- [x] **server/routes/workpackages.js** — All operations scoped by tenant (via project or workpackage.tenant_id).

### Reports & data
- [x] **server/routes/wp1.js** — Scope by tenant (e.g. task → tenant_id).
- [x] **server/routes/density.js** — Scope by tenant.
- [x] **server/routes/rebar.js** — Scope by tenant.
- [x] **server/routes/proctor.js** — Scope by tenant.

### PDF
- [x] **server/routes/pdf.js** — Resolve tenant from project/task; use tenant logo (path from `tenants.logo_path`) and `getTenantAddress(tenantId)` for company address.

### Other
- [x] **server/routes/notifications.js** — Filter by tenant (e.g. user.tenant_id).
- [x] **server/routes/settings.js** — Load/save `app_settings` by `tenant_id`.
- [ ] **server/db/index.js** — Optional: helpers like `getWithTenant(table, conditions, tenantId)` for consistency.

### New endpoints (suggested)
- [x] **GET /api/tenants/me** — Return current tenant info (name, address, logo URL, project number format) for logged-in user.
- [x] **PUT /api/tenants/me** — Update tenant company info (admin only, own tenant).
- [x] **POST /api/tenants/logo** — Upload logo for current tenant (admin only) — stub 501 for now.

---

## Frontend

### Context & auth
- [ ] **client/src/context/TenantContext.tsx** (NEW) — Store `tenantId`, `tenantName`, `logoUrl`, optional `companyAddress`; provide to app.
- [ ] **client/src/context/AuthContext.tsx** — After login, store tenant from response and pass to TenantContext (or merge into auth context).
- [ ] **client/src/api/auth.ts** — Type login response to include tenant fields.

### UI
- [ ] **Header / layout** — Show tenant name and/or logo from context.
- [ ] **Settings / Admin** — Section for tenant branding: logo upload, company address, (optional) project number prefix/format; call tenants API.
- [ ] **client/src/api/tenants.ts** (NEW) — `getTenantMe()`, `updateTenantMe()`, `uploadTenantLogo()`.

---

## Database (migrations)

- [x] **supabase/migrations/20250210000000_add_multi_tenancy.sql** — Create `tenants`, `tenant_project_counters`; add `tenant_id` to all tables; default tenant; backfill; constraints; indexes (see master plan).

---

## Testing

- [ ] Create two tenants in dev DB; create users in each; log in as each — verify no cross-tenant data.
- [ ] Create project as tenant A — verify project number uses tenant A prefix/counter.
- [ ] Generate PDF — verify tenant A logo and address.
- [ ] Repeat for tenant B and confirm isolation and correct branding.
