# QA Report: Branch Database Login & SaaS Readiness

**Date:** 2025-02-10  
**Scope:** Branch DB (`uklvgcrzhhtpqtiwrbfw`) — invalid credential on sign-in + SaaS readiness audit  
**Context:** Experienced QA / 20+ year software developer perspective

---

## 1. Invalid credential on sign-in — root cause and fix

### 1.1 Auth flow (summary)

- Client sends `POST /auth/login` with `{ email, password }` (no `tenantId`).
- Server uses `db.all('users', { email })` → returns all users with that email (across tenants).
- If 0 rows → **401 "Invalid credentials"**.
- If 1 row → compare password with `bcrypt.compareSync(password, user.password)`; if mismatch → **401 "Invalid credentials"**.
- If 2+ rows → 400 "Multiple accounts with this email... specify tenant".

So "Invalid credentials" means either **no user found for that email** or **password does not match**.

### 1.2 Root cause: no users in branch DB

- The **branch database** is a separate Supabase project. Its schema is created by:
  - Running `supabase/dev_full_schema.sql` in the branch project’s SQL Editor, or
  - Running the migrations in order (including `20250210000000_add_multi_tenancy.sql`).
- **Neither the full schema nor the migrations insert any user rows.** They create tables, default tenant (`tenants.id = 1`), and backfill `tenant_id` on existing rows — but if the DB started empty, there are **no users**.
- Main/production DB has users (e.g. created via `create-admin-user.js` or manual setup). The branch DB was never seeded with an admin user.

Result: login with e.g. `admin@maklonestar.com` hits the branch DB → 0 users with that email → **"Invalid credentials"**.

### 1.3 Fix: create admin user in the branch DB

1. Ensure **branch DB** is used by the app (`.env.local` with branch Supabase URL and keys; server log shows `Using Supabase: https://uklvgcrzhhtpqtiwrbfw.supabase.co` and `(from .env.local — dev)`).
2. From project root run:
   ```bash
   node scripts/create-admin-user.js
   ```
   Or with explicit email/password:
   ```bash
   node scripts/create-admin-user.js admin@maklonestar.com admin123
   ```
3. The script loads `.env.local` and will create (or reset) the admin user in the **branch** project with `tenant_id = 1`. Then sign in with that email/password.

**Verification:** After running the script, log in at http://localhost:3000 with the same credentials; you should get a token and be redirected to the dashboard.

---

## 2. Branch DB / SaaS readiness — findings and recommendations

### 2.1 Schema and multi-tenancy

| Item | Status | Notes |
|------|--------|--------|
| `tenants` table | ✅ | Created by multi-tenancy migration; default tenant id=1 inserted. |
| `users.tenant_id` NOT NULL | ✅ | Enforced; unique (tenant_id, email). |
| Other tables `tenant_id` | ✅ | projects, workpackages, tasks, wp1_data, proctor_data, density_reports, rebar_reports, notifications, task_history, app_settings. |
| `tenant_project_counters` | ✅ | Replaces single `project_counters` for per-tenant sequences. |
| Unique constraints | ✅ | projects (tenant_id, project_number); app_settings (tenant_id, key); users (tenant_id, email). |

No schema issues found for SaaS; tenant isolation at the data model level is in place.

### 2.2 Auth and tenant context

| Item | Status | Notes |
|------|--------|--------|
| Login without tenantId | ✅ | Server uses `db.all('users', { email })`; if one row, uses it; if multiple, returns MULTIPLE_TENANTS (ask for tenant). |
| Default tenant for legacy users | ✅ | If user has no tenant_id, auth assigns tenant 1 if `tenants` exists. |
| JWT includes tenantId, tenantName, legacyDb | ✅ | Downstream routes and middleware use these. |
| requireTenant middleware | ✅ | Used for technician CRUD; sets req.tenantId and req.legacyDb. |
| Password hashing | ✅ | bcrypt; same as main. |

Auth logic is compatible with branch DB and multi-tenant schema.

### 2.3 Gaps and risks for SaaS

1. **No RLS on Supabase**  
   - All access is via service_role key (server-side), so RLS is not used.  
   - **Recommendation:** For true multi-tenant SaaS, consider adding RLS policies so that direct Supabase client access (if ever used from the client) cannot cross tenants. Today the app is server-authoritative, so this is a future hardening step.

2. **Branch DB must be seeded**  
   - Branch/fresh SaaS DBs have no users until you run `create-admin-user.js` (or equivalent).  
   - **Recommendation:** Document in DEV_DB_MULTI_TENANCY_SETUP.md or SWITCH_TO_BRANCH_DATABASE.md: “After pointing to branch DB, run `node scripts/create-admin-user.js` to create your first admin.”

3. **Tenant selection on login (multiple tenants)**  
   - If one email exists in multiple tenants, the API returns MULTIPLE_TENANTS; the client currently only sends email/password.  
   - **Recommendation:** When building the full SaaS login flow, add tenant selector (e.g. dropdown or subdomain) and send `tenantId` in the login request when the user has multiple tenants.

4. **app_settings backfill**  
   - `dev_full_schema.sql` inserts global app_settings; multi-tenancy adds `tenant_id` and unique (tenant_id, key). Backfill sets tenant_id = 1 for existing rows.  
   - **Recommendation:** Ensure any new settings are inserted with the correct tenant_id (e.g. per-tenant workflow_base_path).

5. **Project number generation**  
   - Production uses `project_counters`; multi-tenant uses `tenant_project_counters`.  
   - **Recommendation:** Confirm all code paths that generate project numbers use the tenant-scoped counter (tenant_project_counters) when not in legacy mode.

### 2.4 Operational checklist for branch DB (SaaS testing)

- [ ] Run full schema (or migrations) on branch Supabase project.
- [ ] Ensure default tenant exists (id=1) and is active.
- [ ] Run `node scripts/create-admin-user.js` with `.env.local` pointing at branch DB.
- [ ] Log in with the created credentials; verify JWT contains tenantId and tenantName.
- [ ] Create a project and confirm it gets tenant_id = 1 and correct project number from tenant_project_counters.
- [ ] Create technician under same tenant; log in as technician and verify tenant-scoped data only.
- [ ] (Optional) Add a second tenant and user; verify isolation (no cross-tenant data in UI/API).

---

## 3. Summary

| Issue | Cause | Action |
|-------|--------|--------|
| **Invalid credentials on branch DB** | No user rows in branch DB | Run `node scripts/create-admin-user.js` with branch DB in `.env.local`. |
| **SaaS schema** | N/A | Schema and auth are multi-tenant ready; no blocking issues. |
| **Documentation** | First-time branch DB users don’t know to create admin | Add “create admin user” step to branch DB / dev DB docs. |

After creating the admin user in the branch DB, sign-in should succeed. The branch database, as designed, is suitable for SaaS testing and further development.
