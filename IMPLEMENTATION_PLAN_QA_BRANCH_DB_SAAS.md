# Implementation Plan: QA Report → Branch DB & SaaS Readiness

**Prepared by:** Planning agent (20+ year experience perspective)  
**Date:** 2025-02-10  
**Source:** QA_REPORT_BRANCH_DB_LOGIN_AND_SAAS.md  
**Target:** Branch database (`uklvgcrzhhtpqtiwrbfw`) and dev/SaaS documentation

---

## Executive summary

The QA report identified **one blocking issue** (no users in branch DB → "Invalid credentials") and several **readiness items** (documentation, verification, future hardening). This plan maps each finding to concrete actions, owners, and completion criteria so the branch DB is fully usable for SaaS testing.

---

## 1. Invalid credentials — fix (immediate)

| QA finding | Root cause | Action | Status |
|------------|------------|--------|--------|
| "Invalid credentials" on sign-in when using branch DB | Branch DB has no user rows; schema/migrations don’t insert users | Create admin user in branch DB | **Action required** |

### Implementation steps

1. **Ensure app uses branch DB**
   - `.env.local` in project root with branch Supabase URL and keys.
   - Restart server; log must show: `Using Supabase: https://uklvgcrzhhtpqtiwrbfw.supabase.co` and `(from .env.local — dev)`.

2. **Create admin user**
   ```powershell
   node scripts/create-admin-user.js
   ```
   Or with explicit credentials:
   ```powershell
   node scripts/create-admin-user.js admin@maklonestar.com admin123
   ```
   Script loads `.env.local` and creates/updates the admin in the **branch** project with `tenant_id = 1`.

3. **Verify**
   - Log in at http://localhost:3000 with the same email/password.
   - Expect: token returned, redirect to dashboard; JWT contains `tenantId` and `tenantName`.

**Done when:** Login succeeds with the created credentials on branch DB.

---

## 2. Documentation — "create admin" step

| QA finding | Recommendation | Action | Status |
|------------|----------------|--------|--------|
| First-time branch DB users don’t know to create admin | Document in DEV_DB_MULTI_TENANCY_SETUP.md or SWITCH_TO_BRANCH_DATABASE.md | Add explicit step: "After pointing to branch DB, run `node scripts/create-admin-user.js` to create your first admin." | **Implemented** |

- **SWITCH_TO_BRANCH_DATABASE.md** — Already contains "First-time branch DB: create an admin user" with commands. ✅  
- **DEV_DB_MULTI_TENANCY_SETUP.md** — Add a dedicated subsection after "Verify" (section 5.3) so dev DB setup always includes creating the first admin. ✅ (see below)

---

## 3. Operational checklist for branch DB (SaaS testing)

| # | Check | How to verify |
|---|--------|----------------|
| 1 | Full schema or migrations applied on branch Supabase | Run `dev_full_schema.sql` in SQL Editor, or run migrations in order including `20250210000000_add_multi_tenancy.sql`. |
| 2 | Default tenant exists (id=1), active | Table Editor: `tenants` has one row, id=1. |
| 3 | Admin user created | Run `node scripts/create-admin-user.js` with `.env.local` pointing at branch DB. |
| 4 | Login and JWT | Log in; inspect token (e.g. jwt.io) for `tenantId`, `tenantName`. |
| 5 | Project creation uses tenant | Create a project; confirm `tenant_id = 1` and project number from `tenant_project_counters`. |
| 6 | Technician tenant-scoped | Create technician under tenant 1; log in as technician; confirm only that tenant’s data in UI/API. |
| 7 | (Optional) Second tenant isolation | Add second tenant and user; verify no cross-tenant data in UI/API. |

This checklist is added to **DEV_DB_MULTI_TENANCY_SETUP.md** (new section) and can be used as the standard branch DB / SaaS testing runbook.

---

## 4. Code and schema verification (no change required)

| QA item | Finding | Action |
|---------|--------|--------|
| Project number generation | Production used `project_counters`; multi-tenant uses `tenant_project_counters`. | **Verified:** `server/routes/projects.js` uses `tenant_project_counters` for Supabase and passes `tenantId`; no code change. |
| Schema / multi-tenancy | tenants, users.tenant_id NOT NULL, tenant_id on all tenant-scoped tables, unique (tenant_id, …), tenant_project_counters. | Schema is SaaS-ready; no change. |
| Auth / tenant context | Login without tenantId, default tenant for legacy, JWT fields, requireTenant middleware, bcrypt. | Auth compatible with branch DB; no change. |

---

## 5. Future / hardening (backlog)

| QA gap | Recommendation | Priority |
|--------|----------------|----------|
| No RLS on Supabase | Add RLS policies so direct Supabase client access cannot cross tenants. | Low (app is server-authoritative today). |
| Tenant selection on login | When one email exists in multiple tenants, add tenant selector (dropdown/subdomain) and send `tenantId` in login. | Medium (when building full SaaS login). |
| app_settings backfill | New settings must be inserted with correct `tenant_id` (e.g. per-tenant workflow_base_path). | Low; ensure in code reviews. |

These are **not** required for branch DB login or current SaaS testing; they are logged for later sprints.

---

## 6. Multiple companies (tenants)

For adding a **second company** (e.g. XYZ) and its admin, see **MULTI_TENANT_MULTIPLE_COMPANIES_GUIDE.md**. Summary:

- **Create new company + admin:** `node scripts/create-tenant.js "XYZ Corp" admin@xyz.com admin123`
- **Create admin for existing tenant:** `node scripts/create-admin-user.js admin@xyz.com admin123 2` (or use tenant name as 4th arg)
- **Login:** Each company’s admin uses their own email/password; data is isolated by tenant. If the same email exists in two tenants, the API returns `MULTIPLE_TENANTS` and the client can send `tenantId` in the login body.

---

## 7. Summary — what to do now

1. **You (developer):** With `.env.local` pointing at branch DB, run:
   ```powershell
   node scripts/create-admin-user.js
   ```
   Then log in at http://localhost:3000. This resolves "Invalid credentials."

2. **Docs:** DEV_DB_MULTI_TENANCY_SETUP.md is updated with a "Create first admin user" step and the operational checklist so any future branch DB setup includes admin creation and verification.

3. **Ongoing:** Use the operational checklist in DEV_DB_MULTI_TENANCY_SETUP.md for every new branch DB or SaaS test run.

After step 1, the branch database is ready for SaaS testing as described in the QA report.
