# Super-Admin Panel — Implementation Plan

This document is a concrete implementation plan for a **main/super-admin panel** for the multi-tenant SaaS application. It aligns with the existing codebase: Node/Express backend, React client, Supabase (PostgreSQL), tenant-scoped `users` (ADMIN, TECHNICIAN), and `tenants` table.

---

## 1. Auth model (super-admin identity and login)

### Recommendation: Separate `super_admins` table

- **Why separate from `users`**: Tenant-scoped auth is tied to `users.tenant_id` and `users.role` (ADMIN | TECHNICIAN). Super-admins are **not** tied to any tenant and must never be selected by tenant-scoped queries. A separate table keeps tenant and super-admin identities clearly separated and avoids special-casing in every auth path.
- **Table**: `super_admins`
  - `id` (BIGSERIAL PRIMARY KEY)
  - `email` (TEXT UNIQUE NOT NULL)
  - `password` (TEXT NOT NULL) — bcrypt hash, same as `users`
  - `name` (TEXT)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Login flow**: Dedicated endpoint `POST /api/super-admin/auth/login` (email + password only, no `tenantId`). Validate against `super_admins` only; issue a JWT that includes a **distinct claim** so middleware can tell super-admin from tenant user (e.g. `role: 'SUPER_ADMIN'` and no `tenantId`).
- **JWT payload for super-admin**: `{ id, email, role: 'SUPER_ADMIN', name }` — no `tenantId`. Use the same `JWT_SECRET` as the rest of the app (or a dedicated `SUPER_ADMIN_JWT_SECRET` for extra isolation).
- **Independence**: Tenant login (`POST /api/auth/login`) continues to use only the `users` table. Super-admin login uses only `super_admins`. No shared table, so no risk of a tenant user being mistaken for a super-admin.

**Alternative (not recommended)**: Add a `role = 'SUPER_ADMIN'` to `users` with `tenant_id = NULL`. This would require relaxing `users.tenant_id NOT NULL` and updating all tenant-scoped queries to filter out super-admins. More invasive and error-prone than a separate table.

---

## 2. Data model changes

### New table

- **`super_admins`**  
  - `id` BIGSERIAL PRIMARY KEY  
  - `email` TEXT UNIQUE NOT NULL  
  - `password` TEXT NOT NULL  
  - `name` TEXT  
  - `created_at` TIMESTAMPTZ DEFAULT NOW()  
  - `updated_at` TIMESTAMPTZ DEFAULT NOW()  

### New columns (block/unblock)

- **`tenants`**
  - `blocked` BOOLEAN NOT NULL DEFAULT false  
  - Optional: `blocked_at` TIMESTAMPTZ, `blocked_reason` TEXT (for audit).
- **`users`**
  - `blocked` BOOLEAN NOT NULL DEFAULT false  
  - Optional: `blocked_at` TIMESTAMPTZ, `blocked_reason` TEXT.

**Indexes**: `idx_tenants_blocked`, `idx_users_blocked` (and keep existing `idx_tenants_is_active`). Use `blocked` in addition to `is_active` so that “block” is an explicit super-admin action; you can later decide whether “blocked” overrides `is_active` in app logic (e.g. treat `blocked === true` as “cannot log in” regardless of `is_active`).

**Existing**: `tenants.is_active` already exists; keep it for “tenant is enabled/onboarded”. Use `tenants.blocked` for “super-admin has blocked this company”.

---

## 3. API surface

All super-admin routes live under a single prefix and are protected by a **requireSuperAdmin** middleware (see Security below). Base path: **`/api/super-admin`**.

### Auth

- **POST /api/super-admin/auth/login**  
  Body: `{ email, password }`. Validate against `super_admins`; if `blocked` is added for super-admins later, check it here. Return JWT (e.g. 7d) with `role: 'SUPER_ADMIN'` and no `tenantId`.
- **GET /api/super-admin/auth/me**  
  Return current super-admin (from JWT). Used to verify session and show who is logged in.

### Dashboard / “who is logged in”

- **GET /api/super-admin/dashboard/active-sessions**  
  Returns list of currently active sessions (see section 5 for approach). Each item: e.g. `{ userId, email, role, tenantId, tenantName, lastActiveAt, sessionId? }`.
- **GET /api/super-admin/dashboard/stats** (optional)  
  Aggregate counts: total tenants, total users, active sessions count, etc.

### Companies (tenants)

- **GET /api/super-admin/companies**  
  List all tenants (paginated optional). Fields: id, name, is_active, blocked, created_at, and optionally counts (admins, technicians, projects) if cheap to compute or cached.
- **GET /api/super-admin/companies/:id**  
  Single tenant detail + company-level metrics (admins count, technicians count, projects count, workpackages count, etc.).
- **GET /api/super-admin/companies/:id/stats**  
  Explicit stats for tenant: e.g. `{ adminsCount, techniciansCount, projectsCount, workpackagesCount, tasksCount }` (align with schema: `projects`, `workpackages`, `tasks`, `users` with role/tenant_id).

### Block / unblock

- **POST /api/super-admin/companies/:id/block**  
  Set `tenants.blocked = true` (and optionally `blocked_at`, `blocked_reason`). Optionally invalidate tenant sessions (see section 5).
- **POST /api/super-admin/companies/:id/unblock**  
  Set `tenants.blocked = false`.
- **POST /api/super-admin/users/:id/block**  
  Set `users.blocked = true` for the given user (must be in `users` table; check role ADMIN or TECHNICIAN). Invalidate that user’s session if you use server-side sessions.
- **POST /api/super-admin/users/:id/unblock**  
  Set `users.blocked = false`.

All `:id` params are tenant or user IDs; ensure the backend resolves them to the correct table (tenant vs user).

---

## 4. Frontend structure

### Separation from main app

- **Route prefix**: Use a dedicated base path for the super-admin UI, e.g. **`/super-admin`**. All super-admin routes live under it: `/super-admin`, `/super-admin/login`, `/super-admin/dashboard`, `/super-admin/companies`, `/super-admin/companies/:id`, etc.
- **Entry / router**: Same React app and `BrowserRouter`; add a route group under `/super-admin/*` so that:
  - `/super-admin/login` — super-admin login page (no tenant selector; only email/password).
  - `/super-admin` or `/super-admin/dashboard` — dashboard (stats + “who is logged in”).
  - `/super-admin/companies` — list of companies (tenants).
  - `/super-admin/companies/:id` — company detail (stats + block/unblock tenant + list of admins/technicians with block/unblock).
- **Auth context**: Use a **separate** auth context (e.g. `SuperAdminAuthContext`) that:
  - Reads/writes a **different** localStorage key (e.g. `superAdminToken`, `superAdminUser`) so that super-admin login does not overwrite the tenant user token and vice versa.
  - Exposes `superAdminUser`, `login`, `logout`, and a guard for “is super-admin”.
- **API client**: A dedicated axios instance (or api module) for super-admin that:
  - Uses the same base URL as the rest of the app (or an env-specific one).
  - Attaches `Authorization: Bearer <superAdminToken>` from the super-admin localStorage key.
  - Does not send the tenant `token`; only super-admin token is sent to `/api/super-admin/*` routes.
- **Protected route**: A `SuperAdminProtectedRoute` that checks `SuperAdminAuthContext`; if not logged in as super-admin, redirect to `/super-admin/login`. Do not use the existing `ProtectedRoute` (which checks tenant user) for super-admin pages.
- **Navigation**: Super-admin layout with its own nav: Dashboard, Companies, Logout. No links from the main app to super-admin (or only from a hidden/debug link if you prefer). Link to main app (e.g. “Back to main site”) can point to `/` or `/login`.

### Suggested file/component layout

- **Routes** (in `App.tsx` or a dedicated router file):  
  - `/super-admin/login` → `SuperAdminLogin`  
  - `/super-admin` (or `/super-admin/dashboard`) → `SuperAdminDashboard` (stats + active sessions)  
  - `/super-admin/companies` → `SuperAdminCompaniesList`  
  - `/super-admin/companies/:id` → `SuperAdminCompanyDetail` (stats, block tenant, list admins/technicians, block/unblock user)
- **Context**: `client/src/context/SuperAdminAuthContext.tsx`
- **API**: `client/src/api/superAdmin.ts` (calls only `/api/super-admin/*` with super-admin token).
- **Components**: Under `client/src/components/super-admin/` (e.g. `SuperAdminLogin.tsx`, `SuperAdminDashboard.tsx`, `CompaniesList.tsx`, `CompanyDetail.tsx`).

This keeps the super-admin panel inside the same SPA but clearly separated by path and auth.

---

## 5. “Who is logged in” (active sessions)

### Recommended approach: optional sessions table + `last_active` on a heartbeat

- **Option A — JWT-only + `last_active` (simplest)**  
  - Add `last_active_at` (TIMESTAMPTZ) to `users` (and optionally to `super_admins`).  
  - On each authenticated request (or on a dedicated “heartbeat” endpoint like `POST /api/auth/heartbeat` or `PUT /api/auth/me/heartbeat`), update `users.last_active_at` (and optionally set a short-lived “session” in memory or Redis if you want to limit to “last 5 minutes”).  
  - Super-admin “active sessions” = list users (and optionally tenants) where `last_active_at` is within the last X minutes (e.g. 5–15). You can join with `tenants` to show tenant name.  
  - Pros: Minimal schema (one column), no session store. Cons: “Currently logged in” is inferred from recent activity, not true real-time sessions; multiple tabs/devices show as one.

- **Option B — Sessions table (more accurate)**  
  - New table: `user_sessions` (id, user_id, tenant_id, role, token_jti or session_token, created_at, last_active_at, expires_at).  
  - On login, insert a row; optionally store a “session id” or JWT id (jti) in the JWT and in the table. On each request (or heartbeat), update `last_active_at`. On logout, delete or mark session ended.  
  - Super-admin “active sessions” = select from `user_sessions` where `last_active_at` > now() - interval ‘15 minutes’ (or similar), join users + tenants for display.  
  - Pros: Clear “who is logged in” and ability to invalidate by session. Cons: More code and migration.

**Recommendation**: Start with **Option A** (`users.last_active_at` + heartbeat) for speed of implementation. Add a heartbeat called by the client (e.g. every 2–5 minutes) and/or update `last_active_at` in existing `authenticate` middleware for tenant users. Expose `GET /api/super-admin/dashboard/active-sessions` that returns users (with tenant info) where `last_active_at` is within the last 10–15 minutes. If you later need per-session invalidation (e.g. on block), introduce Option B.

---

## 6. Security

### Protecting super-admin routes

- **Middleware**: Add **requireSuperAdmin** in `server/middleware/auth.js`:
  - After `authenticate`, require `req.user.role === 'SUPER_ADMIN'` (and optionally that `req.user` has no `tenantId`). If not, respond with 403.
- **Mount**: Mount all super-admin routes under one router that uses `authenticate` then `requireSuperAdmin`, so that no super-admin route is callable with a tenant JWT.
- **Login**: `POST /api/super-admin/auth/login` must **not** use the tenant `authenticate` middleware; it is public. Validate credentials against `super_admins` only and return a JWT that will pass `requireSuperAdmin`.

### Protecting super-admin login

- **Rate limiting**: Add rate limiting (e.g. by IP or by email) on `POST /api/super-admin/auth/login` to prevent brute force (e.g. express-rate-limit).
- **Audit**: Log super-admin logins (and optionally block/unblock actions) for audit (e.g. to a table or log stream).
- **No tenant token**: Super-admin login must not accept or use `tenantId`; the endpoint ignores it. Super-admin JWT must never contain `tenantId`.

### Tenant and user blocking enforced in auth

- In **tenant** login (`server/routes/auth.js`): After resolving the user from `users`, check `user.blocked === true`; if so, return 403 with a message like “Account is blocked”. Optionally check `tenant.blocked` and reject login if the user’s tenant is blocked.
- In **authenticate** middleware (or in a per-request check for tenant routes): Optionally re-check `user.blocked` and `tenant.blocked` so that blocking takes effect without waiting for token expiry (if you do not invalidate tokens immediately).

---

## 7. Implementation order

1. **DB + super-admin auth**
   - Migration: create `super_admins` table; add `blocked` (and optional `blocked_at`/`blocked_reason`) to `tenants` and `users`; add `last_active_at` to `users` if using Option A for “who is logged in”.
   - Seed at least one super-admin (e.g. via script or migration).
   - Implement `POST /api/super-admin/auth/login` and `GET /api/super-admin/auth/me`; implement `requireSuperAdmin`; mount under `/api/super-admin` with `authenticate` + `requireSuperAdmin` for all routes except login.

2. **Super-admin UI shell and login**
   - Add `SuperAdminAuthContext` and `superAdminToken`/`superAdminUser` in localStorage; add `SuperAdminLogin` page and `SuperAdminProtectedRoute`; add routes under `/super-admin`; add super-admin API client using super-admin token.

3. **Companies list and detail**
   - Implement `GET /api/super-admin/companies` and `GET /api/super-admin/companies/:id` (and optionally `GET /api/super-admin/companies/:id/stats`). Build `SuperAdminCompaniesList` and `SuperAdminCompanyDetail` with stats (admins, technicians, projects, etc. from existing schema).

4. **Block / unblock**
   - Implement block/unblock for tenant and for user; enforce `user.blocked` and `tenant.blocked` in tenant login (and optionally in middleware). Add block/unblock controls in company detail (tenant block + per-user block for admins/technicians).

5. **“Who is logged in”**
   - Add `last_active_at` update (heartbeat or in `authenticate`); implement `GET /api/super-admin/dashboard/active-sessions`; build dashboard widget showing current sessions / active company.

6. **Hardening**
   - Rate limiting and audit logging on super-admin login; optional session invalidation on block (if you introduce a sessions table later).

---

## 8. Reference: existing codebase

| Area | Location | Notes |
|------|----------|--------|
| Tenant auth | `server/routes/auth.js` | Login uses `users` + `tenant_id`; JWT has `role`, `tenantId`, `tenantName`. |
| Auth middleware | `server/middleware/auth.js` | `authenticate`, `requireAdmin`, `requireTechnician`; JWT_SECRET. |
| Tenant scope | `server/routes/tenants.js` | `GET/PUT /api/tenants/me`; uses `getTenantIdForUser(req)`. |
| DB layer | `server/db/index.js`, `server/db/supabase.js` | `db.get`, `db.all`, `db.update`, etc.; Supabase uses snake_case. |
| Tenants schema | `supabase/migrations/20250210000000_add_multi_tenancy.sql`, `dev_full_schema.sql` | `tenants` (id, name, is_active, …); `users.tenant_id` NOT NULL. |
| Users schema | `supabase/migrations/20250131000000_initial_schema.sql` | `users`: id, email, password, role (ADMIN \| TECHNICIAN), name. |
| Client auth | `client/src/context/AuthContext.tsx`, `client/src/api/auth.ts` | Token + user in localStorage; `authAPI.login`, `authAPI.getMe`. |
| Client routing | `client/src/App.tsx` | Routes for `/login`, `/dashboard`, `/admin/*`, `/technician/*`; `ProtectedRoute` with requireAdmin/requireTechnician. |
| API client | `client/src/api/api.ts` | Single axios instance; Bearer token from `localStorage.getItem('token')`. |

---

## Summary

- **Auth**: Separate `super_admins` table and `POST /api/super-admin/auth/login` returning a JWT with `role: 'SUPER_ADMIN'`; protect all other super-admin routes with `requireSuperAdmin`.
- **Data**: Add `super_admins`; add `blocked` (and optional audit fields) to `tenants` and `users`; add `users.last_active_at` for “who is logged in” (Option A).
- **API**: Prefix `/api/super-admin` for auth, dashboard (active-sessions, stats), companies (list, detail, stats), and block/unblock for tenant and user.
- **Frontend**: `/super-admin` route prefix, `SuperAdminAuthContext` and separate token storage, super-admin API client, and pages for login, dashboard, companies list, and company detail with block/unblock.
- **Security**: `requireSuperAdmin` on all super-admin routes except login; rate limit and audit super-admin login; enforce `blocked` in tenant login and optionally in middleware.
- **Order**: DB + super-admin auth → UI shell + login → companies list/detail → block/unblock → active sessions/dashboard → hardening.

This plan is ready to be implemented step-by-step in the codebase.
