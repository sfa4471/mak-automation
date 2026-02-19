# SaaS Conversion Master Plan — Multi-Tenant MAK Automation

**Planning Agent:** Senior Software Architect (20+ years experience)  
**Audience:** Development team converting single-tenant MAK app to multi-tenant SaaS  
**Date:** February 2025  
**Status:** Authoritative plan — implement in working branch only; main branch untouched until sign-off.

---

## 1. Purpose of This Document

This plan defines **how to offer your current MAK Automation program as SaaS** so that:

- **Each client (tenant)** has:
  - **Different logo** (e.g. MAK vs Company B)
  - **Different company address** (on PDFs, reports, correspondence)
  - **Different project numbering** (e.g. `02-2025-0001` for MAK, `ACME-2025-001` for another)
  - **Different admins** (per-tenant admin users)
  - **Different technicians** (per-tenant technician users)

Today the app is effectively **single-tenant (MAK only)**. This plan describes **database changes**, **code changes**, and a **working-directory workflow** so you can develop and test in isolation and only merge to main when you are satisfied.

---

## 2. Working Directory Strategy (Keep Main Unaffected)

You asked to work in a **working directory** so that **main code is not affected** until you are happy. Use **both** of the following.

### 2.1 Git Branch (Where Code Lives)

- **Create and use a dedicated branch** for all SaaS work:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feature/multi-tenant-saas
  git push -u origin feature/multi-tenant-saas
  ```
- Do **all** code and migration work on `feature/multi-tenant-saas`. **Do not** commit SaaS changes to `main`.
- When you are happy with behavior and testing:
  ```bash
  git checkout main
  git merge feature/multi-tenant-saas
  git push origin main
  ```

### 2.2 Working Directory (This Folder)

- **`working-saas/`** is your **planning and reference** directory:
  - This master plan and any checklists live here.
  - You can add small scripts (e.g. migration helpers, tenant seeding) here if you prefer not to touch `server/` or `client/` until you implement.
- **Actual application code** stays in the repo root (`server/`, `client/`, etc.) but **only modified on the feature branch**. So:
  - **Plan and checklist:** `working-saas/` (this folder).
  - **Code changes:** in `server/`, `client/`, `supabase/` on branch `feature/multi-tenant-saas`.

### 2.3 Database: Separate Supabase Project for Testing (Recommended)

- Use a **separate Supabase project** (e.g. “MAK Automation – SaaS Dev”) for the feature branch.
- Point your **local / staging** env to this dev Supabase (e.g. `.env.local` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the dev project).
- Run all new migrations and data migrations in this dev project first. **Production (main) Supabase** stays unchanged until you merge and deploy.

Summary:

| What                | Where / How                                      |
|---------------------|---------------------------------------------------|
| Plan & checklists   | `working-saas/` (this directory)                  |
| Code changes        | Repo root, but only on branch `feature/multi-tenant-saas` |
| Main branch         | Unchanged until you merge                        |
| DB for testing      | Separate Supabase project (recommended)           |

---

## 3. High-Level Architecture

- **Multi-tenancy model:** Shared database (one Supabase project per environment) with **row-level isolation** via `tenant_id` on every tenant-scoped table.
- **Tenant:** One company (e.g. MAK, or another firm). Each tenant has:
  - One or more **admins**, one or more **technicians**
  - One **tenant** record: name, logo path, address fields, project number prefix/format
  - Its own **project counter(s)** per year for project numbering
- **Isolation:** Every API that reads/writes projects, tasks, users, reports, etc. must **restrict by `tenant_id`** derived from the authenticated user’s JWT. No API may return or update another tenant’s data.

---

## 4. Database Changes

Your production DB is **Supabase (PostgreSQL)**. Below is the exact schema evolution.

### 4.1 New Tables

**4.1.1 `tenants`**

- Stores per-client: name, address, logo path, project number prefix/format, and optional settings.

```sql
CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,  -- optional, for future e.g. mak.app.com

  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,

  logo_path TEXT,
  primary_color TEXT DEFAULT '#007bff',
  secondary_color TEXT DEFAULT '#6c757d',

  project_number_prefix TEXT DEFAULT '02',
  project_number_format TEXT DEFAULT 'PREFIX-YYYY-NNNN',

  workflow_config JSONB DEFAULT '{}'::jsonb,
  workflow_base_path TEXT,

  is_active BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

**4.1.2 `tenant_project_counters`**

- Replaces **global** project counter with **per-tenant, per-year** counter so each client has its own sequence.

```sql
CREATE TABLE IF NOT EXISTS tenant_project_counters (
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, year)
);

CREATE INDEX idx_tenant_project_counters_tenant_year ON tenant_project_counters(tenant_id, year);
```

**4.1.3 (Optional) `tenant_settings`**

- Key-value per-tenant overrides (e.g. feature flags, notification toggles). Can be added in a later phase.

### 4.2 Add `tenant_id` to Existing Tables

Add `tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE` (and index) to:

- `users`
- `projects`
- `workpackages`
- `tasks`
- `wp1_data`
- `proctor_data`
- `density_reports`
- `rebar_reports`
- `notifications`
- `task_history`
- `app_settings`

**Constraints to update:**

- **projects:** Today `project_number` is globally unique. Change to **unique per tenant:** `UNIQUE(tenant_id, project_number)`.
- **app_settings:** If you have a unique constraint on `key`, change to **unique per tenant:** `UNIQUE(tenant_id, key)`.
- **users:** Email can stay unique globally, or become unique per tenant: `UNIQUE(tenant_id, email)` (recommended for SaaS so two companies can have `admin@company.com`).

### 4.3 Project Counters

- **Keep** `project_counters` (year, next_seq) for **backward compatibility** during migration, or phase it out.
- **New logic:** All new project creation uses `tenant_project_counters` keyed by `tenant_id` and `year`. Migration: backfill `tenant_project_counters` from existing `project_counters` for the default MAK tenant (e.g. `tenant_id = 1`).

### 4.4 Migration Order (Supabase)

1. Create `tenants` and `tenant_project_counters`.
2. Add `tenant_id` to all tables above as **nullable**.
3. Insert default tenant (e.g. “MAK Lone Star Consulting”, id = 1).
4. Backfill: set `tenant_id = 1` for all existing rows in every table (and backfill `tenant_project_counters` from `project_counters`).
5. Add unique constraints (e.g. `(tenant_id, project_number)` for projects, `(tenant_id, key)` for app_settings, and optionally `(tenant_id, email)` for users).
6. Make `tenant_id` **NOT NULL** on all tables.
7. Add indexes on `tenant_id` for every table that has it.

Put this in a single migration file under `supabase/migrations/` (e.g. `20250210000000_add_multi_tenancy.sql`) and run it only in your **dev** Supabase project until you are ready for production.

---

## 5. Code Changes (What to Touch)

### 5.1 Authentication & Tenant Context

- **File: `server/routes/auth.js`**
  - On login: load user, then load user’s `tenant` by `user.tenant_id`. Ensure tenant exists and `is_active`.
  - Include in JWT: `tenantId`, `tenantName` (and optionally `tenantSubdomain`).
  - Return same in login response so the frontend can store tenant info.
- **File: `server/middleware/auth.js`** (or wherever JWT is decoded)
  - Ensure decoded payload exposes `tenantId` (and optionally `tenantName`) so downstream middleware and routes can use it.
- **New file: `server/middleware/tenant.js`**
  - `requireTenant`: after auth, require `req.user.tenantId`; set `req.tenantId = req.user.tenantId`.
  - Optional: `validateTenantResource(resourceGetter)`: load resource, ensure `resource.tenant_id === req.user.tenantId`, else 403.

Use `requireTenant` on **every** route that returns or modifies tenant-scoped data (projects, tasks, users of that tenant, reports, notifications, etc.).

### 5.2 Project Numbering

- **File: `server/routes/projects.js`**
  - Replace `generateProjectNumber()` with `generateProjectNumber(tenantId)`.
  - Read tenant’s `project_number_prefix` and `project_number_format` from `tenants`.
  - Use `tenant_project_counters` for the given `tenant_id` and current year; increment and format (e.g. PREFIX-YYYY-NNNN).
  - When creating a project, set `tenant_id: req.tenantId`.
- All project list/detail queries must filter by `tenant_id = req.tenantId`.

### 5.3 Logo

- **Storage:** e.g. `server/public/tenants/{tenant_id}/logo.{ext}` or Supabase Storage bucket per tenant.
- **Upload:** New endpoint (e.g. `POST /api/tenants/logo`) — auth + `requireTenant`, accept file, save under tenant folder, update `tenants.logo_path` for current tenant.
- **Serving:** `GET /api/tenants/logo` or static route that resolves tenant from JWT and serves that tenant’s logo.
- **PDF generation:** **File: `server/routes/pdf.js`** (and any other PDF code). Replace hardcoded MAK logo with a function that loads logo by `tenant_id` (from task/project → tenant) and uses tenant’s `logo_path` (or default if none).

### 5.4 Company Address

- **Storage:** Already on `tenants`: `company_address`, `company_city`, `company_state`, `company_zip`, `company_phone`, `company_email`.
- **PDF generation:** **File: `server/routes/pdf.js`**. Add helper e.g. `getTenantAddress(tenantId)` that reads tenant row and formats address. Use it everywhere you currently output company address.
- **UI:** Add tenant company address fields to Settings (or Admin → Tenant settings). Only admins of that tenant can edit (and only their own tenant).

### 5.5 Data Isolation (Critical)

- **Every** route that lists or updates projects, tasks, workpackages, users (for that tenant), wp1_data, proctor_data, density_reports, rebar_reports, notifications, task_history, app_settings must:
  1. Use `requireTenant` (or equivalent) so `req.tenantId` is set.
  2. **Filter reads** by `tenant_id = req.tenantId`.
  3. **Set `tenant_id`** on insert to `req.tenantId`.
  4. **Validate** that the resource being updated belongs to `req.tenantId` (e.g. project, task, or user belongs to tenant).

**Files to update (examples):**

- `server/routes/projects.js` — list/create/update/delete by tenant.
- `server/routes/tasks.js` — all queries and inserts scoped by tenant (e.g. via project or task.tenant_id).
- `server/routes/workpackages.js` — same.
- `server/routes/auth.js` — login already scoped by user; user list (if any) by tenant.
- `server/routes/wp1.js`, `server/routes/density.js`, `server/routes/rebar.js`, `server/routes/proctor.js` — ensure report read/write is tenant-scoped (e.g. task → tenant_id).
- `server/routes/notifications.js` — filter by tenant (e.g. user’s tenant_id).
- `server/routes/settings.js` — load/save `app_settings` by `tenant_id`.
- `server/routes/pdf.js` — resolve tenant from project/task, use tenant logo and address only.

### 5.6 User Management (Different Admin / Technician per Client)

- **Today:** Single pool of users. **After:** Each user has `tenant_id`; they only see and manage users of their own tenant.
- **File: `server/routes/auth.js`** (or wherever user creation/invite lives): On create user, set `tenant_id = req.tenantId`. List users filtered by `tenant_id = req.tenantId`.
- **Admin:** Can only assign tasks to **technicians of the same tenant**. Technicians only see tasks for their tenant. No cross-tenant visibility.

No new tables are strictly required; `users.tenant_id` plus strict filtering and JWT `tenantId` enforce “different admin and different technician” per client.

### 5.7 Frontend

- **Tenant context:** Add e.g. `client/src/context/TenantContext.tsx` that holds `tenantId`, `tenantName`, and optionally `logoUrl`, `companyAddress` (from login response or from a small “tenant info” API). Provide to app.
- **Settings / Admin:** Add UI for tenant branding: logo upload, company address, project number prefix/format (if you expose it). Call new APIs (e.g. `GET/PUT /api/tenants/me`, `POST /api/tenants/logo`).
- **Login response:** Store tenant info in context and use it in header/footer (e.g. show tenant name, logo).
- **PDFs:** No frontend change for content; backend already uses tenant logo and address.

---

## 6. Implementation Order (Steps)

Do these in order so that you never have a half-broken state on the feature branch.

1. **Branch and env**
   - Create `feature/multi-tenant-saas`, push.
   - Point local/staging to a **dev** Supabase project (separate from production).

2. **Database**
   - Add migration that creates `tenants`, `tenant_project_counters`, adds nullable `tenant_id` everywhere, creates default tenant, backfills all rows with that tenant’s id, backfills `tenant_project_counters`, then adds constraints and NOT NULL and indexes. Run in dev only.

3. **Auth and tenant context**
   - Update login to attach tenant to JWT and response.
   - Add `requireTenant` and optional `validateTenantResource`. Apply `requireTenant` to all tenant-scoped routes.

4. **Isolation**
   - Go route-by-route: add `tenant_id` filter to every read and set `tenant_id` on every insert; validate resource ownership on update/delete. Start with projects and tasks, then reports, notifications, settings, PDF.

5. **Project numbering**
   - Switch to `generateProjectNumber(tenantId)` and `tenant_project_counters` in project creation.

6. **Logo and address**
   - Implement tenant logo upload and serving; implement `getTenantAddress(tenantId)` and use it in all PDFs. Expose tenant settings (logo, address) in admin UI.

7. **Frontend**
   - TenantContext, tenant in header/footer, Settings for tenant branding. Ensure user list and task assignment are tenant-scoped (different admin/technician per client).

8. **Testing**
   - With dev DB: create a second tenant and users; confirm no cross-tenant data is visible and project numbers, logo, and address are correct per tenant.

9. **Merge to main**
   - Only after you are happy: merge `feature/multi-tenant-saas` into `main` and run the same migration (and data backfill) on production with a backup and rollback plan.

---

## 7. Checklist Summary

- [ ] Branch `feature/multi-tenant-saas` created; all work on this branch.
- [ ] Dev Supabase project created and wired via env.
- [ ] Migration: `tenants`, `tenant_project_counters`, `tenant_id` on all tables, default tenant, backfill, constraints, indexes.
- [ ] Login returns and JWT contains `tenantId` (and tenant name); middleware sets `req.tenantId`.
- [ ] Every tenant-scoped route uses `requireTenant` and filters/validates by `tenant_id`.
- [ ] Project creation uses per-tenant numbering and `tenant_project_counters`.
- [ ] Logo: upload + serve + use in PDFs by tenant.
- [ ] Address: from `tenants` in PDFs and (optional) in UI.
- [ ] Users and tasks scoped by tenant (different admin/technician per client).
- [ ] Frontend: TenantContext, tenant branding in UI/Settings.
- [ ] No data leakage in testing; two-tenant test passed.
- [ ] Merge to main only when satisfied; production migration and backup plan ready.

---

## 8. References

- Existing detailed design: **`MULTI_TENANT_SAAS_IMPLEMENTATION_PLAN_V2.md`** (repo root).
- Quick reference: **`MULTI_TENANT_SAAS_QUICK_REFERENCE.md`** (repo root).

This document is the **single master plan** for the working-directory SaaS conversion; the V2 plan has extra detail (workflows, RLS, billing) you can add in later phases.

---

**Document version:** 1.0  
**Last updated:** February 2025  
**Next step:** Create branch `feature/multi-tenant-saas`, then run Phase 1 (migration in dev DB).
