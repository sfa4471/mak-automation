# Branch → Main Database Migration Plan

**Purpose:** Safely move data from the **branch** Supabase database (`uklvgcrzhhtpqtiwrbfw`) to the **main** Supabase database (`hyjuxclsksbyaimvzulq`) for the MakAutomation multi-tenant SaaS project.

**Audience:** Senior DBA / DevOps. Execute steps in order; do not skip pre-migration or safety steps.

---

## 1. Pre-migration: Branch multi-company readiness

**Before any data migration**, the branch database must be verified as set up to handle multiple companies.

1. Point the app at the **branch** DB: ensure `.env.local` exists in the project root with branch credentials:
   - `SUPABASE_URL=https://uklvgcrzhhtpqtiwrbfw.supabase.co`
   - `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for that project.
2. Run through the checklist in **BRANCH_MULTI_COMPANY_VERIFICATION.md** (repo root):
   - **§1 Schema:** Confirm `tenants`, `tenant_project_counters`, and all tenant-scoped tables exist with `tenant_id` NOT NULL and correct unique constraints (`(tenant_id, project_number)`, `(tenant_id, email)`, `(tenant_id, key)`).
   - **§2 Default tenant and data:** At least one tenant (e.g. id = 1, MAK); all existing rows backfilled with `tenant_id`; `tenant_project_counters` populated for tenant 1.
   - **§3 Multi-company capability:** Create a second tenant and second-tenant admin; confirm login and data isolation.
   - **§4 Scripts and app:** `create-tenant.js` and `create-admin-user.js` work; login returns `tenantId` / `tenantName` in session.
3. **Only after all checks pass**, proceed with the steps below.

---

## 2. Main DB schema: Apply migrations in order

Main must have the same schema as branch before loading data.

### 2.1 Migration order (timestamp order)

Apply migrations in this order (all under `supabase/migrations/`):

| Order | File |
|-------|------|
| 1 | `20250131000000_initial_schema.sql` |
| 2 | `20250201000000_add_app_settings.sql` |
| 3 | `20250202000000_add_proctor_correction_factor.sql` |
| 4 | `20250210000000_add_multi_tenancy.sql` |
| 5 | `20250211000000_add_tenant_api_base_url.sql` |
| 6 | `20250216000000_add_project_customer_details.sql` |
| 7 | `20250216100000_add_password_reset_tokens.sql` |
| 8 | `20250217000000_add_tenant_pe_and_license_holder.sql` |
| 9 | `20250217100000_add_tenant_company_contact_name.sql` |
| 10 | `20250218000000_add_project_drawings.sql` |

### 2.2 If main already has an older schema

- **Option A (recommended for one-time sync):** If main has no production data (or data can be replaced), run a **full schema reset** on main, then run all migrations above in order. This avoids conflicting constraints or missing columns.
- **Option B (main has data to keep):** Do **not** reset. Run only **missing** migrations in timestamp order. Check which objects already exist (e.g. `tenants`, `tenant_project_counters`, `tenant_id` columns) and run migrations that are idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). The multi-tenancy migration assumes existing rows can be backfilled with `tenant_id = 1`; ensure a default tenant exists on main before running it.

### 2.3 How to apply

- **Script (optional):** Add `MAIN_SUPABASE_DB_URL` (main project’s Postgres URI) to `.env`, then run `node scripts/apply-migrations-to-main.js`. Get the URI from Supabase Dashboard → Main project → Settings → Database → Connection string (URI).
- **Supabase Dashboard:** Project → SQL Editor → paste each migration file content and run in order.
- **CLI:** If using Supabase CLI linked to main project: run migrations in order (e.g. `supabase db push` or run each file).
- After applying, verify key objects exist: `tenants`, `tenant_project_counters`, and all business tables with `tenant_id` NOT NULL.
- **See STEP2_RUN_INSTRUCTIONS.md** for exact commands and data-migration script usage.

---

## 3. Data migration strategy

### 3.1 Table copy order (respect foreign keys)

Copy tables in this order. Parent rows must exist before child rows.

| Phase | Table | Depends on |
|-------|--------|------------|
| 1 | `tenants` | — |
| 2 | `tenant_project_counters` | `tenants` |
| 3 | `users` | `tenants` |
| 4 | `projects` | `tenants` |
| 5 | `workpackages` | `projects`, `users` |
| 6 | `tasks` | `projects`, `users` |
| 7 | `wp1_data` | `tasks`, `workpackages` |
| 8 | `proctor_data` | `tasks` |
| 9 | `density_reports` | `tasks`, `users` |
| 10 | `rebar_reports` | `tasks`, `users` |
| 11 | `notifications` | `users`, `tasks`, `workpackages`, `projects` |
| 12 | `task_history` | `tasks`, `users` |
| 13 | `app_settings` | `tenants`, `users` |
| 14 | `password_reset_tokens` | `users` |

**Note:** Do **not** copy `project_counters` to main if you have applied the full multi-tenant schema; project numbering uses `tenant_project_counters` only.

### 3.2 Preserve IDs vs remap

**Recommendation: Preserve IDs.**

- **Preserve IDs:** Copy each row with its existing `id` (and all FKs unchanged). No remapping; referential integrity is kept. After copy, reset each table’s sequence so new rows get the next IDs (see §3.4).
- **Pros:** Simple, no FK updates, fewer mistakes, same IDs in app (e.g. URLs or cached refs).
- **Cons:** If main already has rows in any table, ID clashes can occur; then main must be empty or tables truncated first (within the same maintenance window).

**Remap (alternative):** Insert without specifying `id`, then maintain old_id → new_id maps and update every FK column. Only consider if main must keep existing rows and you need to merge; significantly more complex and error-prone.

### 3.3 Recommended tool: Custom Node script (two Supabase clients)

**Recommended approach:** A **Node script** that uses two Supabase clients (branch = source, main = target), reads from branch and inserts into main in the table order above, then resets sequences on main.

**Why:**
- Full control over order and which tables/rows to copy.
- Easy to preserve IDs and reset sequences.
- Can add filters (e.g. only active tenants) or dry-run mode.
- No need to expose DB connection strings to pg_dump/pg_restore from your machine; uses Supabase REST API (service role).
- Clear audit trail (logs, row counts).

**Alternatives:**
- **pg_dump / pg_restore:** Good for full clone if you have direct Postgres connection strings (Supabase: Settings → Database → Connection string). Use `--data-only` and order restore by table dependency, or dump only data and restore in the same order as §3.1. More complex with two remote projects.
- **Supabase Dashboard:** No built-in cross-project copy; manual export/import per table is tedious and error-prone for 14+ tables and FKs.

**Script outline:**
- Load branch credentials from `.env.local` and main from `.env` (or separate env files).
- Create two Supabase clients (service role).
- For each table in §3.1 order: `SELECT *` from branch, `INSERT` into main (including `id`). Use batching if needed (e.g. 500 rows per insert).
- After all inserts: on main, for each table with a serial/bigserial PK, run `SELECT setval(pg_get_serial_sequence('table_name', 'id'), (SELECT COALESCE(MAX(id), 1) FROM table_name));`.
- Log row counts and any errors; support `--dry-run` (read-only, no writes to main).

### 3.4 Sequence reset (main, after data load)

After copying data with preserved IDs, reset sequences so new rows get correct next values. Run on **main** (e.g. in SQL Editor or from the migration script):

```sql
SELECT setval(pg_get_serial_sequence('tenants', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tenants));
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval(pg_get_serial_sequence('projects', 'id'), (SELECT COALESCE(MAX(id), 1) FROM projects));
SELECT setval(pg_get_serial_sequence('workpackages', 'id'), (SELECT COALESCE(MAX(id), 1) FROM workpackages));
SELECT setval(pg_get_serial_sequence('tasks', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tasks));
SELECT setval(pg_get_serial_sequence('wp1_data', 'id'), (SELECT COALESCE(MAX(id), 1) FROM wp1_data));
SELECT setval(pg_get_serial_sequence('proctor_data', 'id'), (SELECT COALESCE(MAX(id), 1) FROM proctor_data));
SELECT setval(pg_get_serial_sequence('density_reports', 'id'), (SELECT COALESCE(MAX(id), 1) FROM density_reports));
SELECT setval(pg_get_serial_sequence('rebar_reports', 'id'), (SELECT COALESCE(MAX(id), 1) FROM rebar_reports));
SELECT setval(pg_get_serial_sequence('notifications', 'id'), (SELECT COALESCE(MAX(id), 1) FROM notifications));
SELECT setval(pg_get_serial_sequence('task_history', 'id'), (SELECT COALESCE(MAX(id), 1) FROM task_history));
SELECT setval(pg_get_serial_sequence('app_settings', 'id'), (SELECT COALESCE(MAX(id), 1) FROM app_settings));
SELECT setval(pg_get_serial_sequence('password_reset_tokens', 'id'), (SELECT COALESCE(MAX(id), 1) FROM password_reset_tokens));
```

---

## 4. Safety

- **Backup main before migration:** Supabase Dashboard → Database → Backups (or create a manual backup / point-in-time restore if available). Alternatively, export critical tables via SQL or pg_dump.
- **Optional:** Backup branch (export or dump) so you can compare or roll back source if needed.
- **Maintenance window:** Run migration when app traffic to main is minimal, or keep the app pointed at **branch** until main is verified (see §5).
- **No live traffic to main during copy:** Prefer running the migration script while the app uses branch; then switch to main only after verification.

---

## 5. Post-migration

### 5.1 Row-count verification

On **main**, run (e.g. in SQL Editor):

```sql
SELECT 'tenants' AS tbl, COUNT(*) AS cnt FROM tenants
UNION ALL SELECT 'tenant_project_counters', COUNT(*) FROM tenant_project_counters
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'workpackages', COUNT(*) FROM workpackages
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'wp1_data', COUNT(*) FROM wp1_data
UNION ALL SELECT 'proctor_data', COUNT(*) FROM proctor_data
UNION ALL SELECT 'density_reports', COUNT(*) FROM density_reports
UNION ALL SELECT 'rebar_reports', COUNT(*) FROM rebar_reports
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'task_history', COUNT(*) FROM task_history
UNION ALL SELECT 'app_settings', COUNT(*) FROM app_settings
UNION ALL SELECT 'password_reset_tokens', COUNT(*) FROM password_reset_tokens;
```

Compare counts to branch (run the same query on branch). Investigate any mismatch before switching the app.

### 5.2 Spot-check relationships

- One tenant: `SELECT * FROM tenants WHERE id = 1;`
- Users for tenant 1: `SELECT id, email, tenant_id FROM users WHERE tenant_id = 1 LIMIT 5;`
- Projects for tenant 1: `SELECT id, project_number, tenant_id FROM projects WHERE tenant_id = 1 LIMIT 5;`
- A project’s tasks: `SELECT id, task_type, project_id FROM tasks WHERE project_id = <project_id> LIMIT 5;`
- Confirm `tenant_project_counters` has the expected `(tenant_id, year, next_seq)` rows.

### 5.3 Admin user on main

Ensure at least one admin exists on main (e.g. for tenant 1):

```bash
# Point env at MAIN (no .env.local, or .env has main credentials)
node scripts/create-admin-user.js admin@maklonestar.com <password> 1
```

Or create/reset via Supabase Auth if you use it for login; the script above uses the `users` table and is consistent with the codebase.

### 5.4 Switch app from branch to main

1. **Remove or rename** `.env.local` in the project root so the server uses `.env` (main Supabase).
2. **Restart** the dev/server process (e.g. `npm run dev`). Confirm in logs that it uses main (e.g. `Using Supabase: https://hyjuxclsksbyaimvzulq.supabase.co`).
3. Test login, project list, and at least one report flow on main.

---

## 6. Summary checklist

- [ ] Pre-migration: BRANCH_MULTI_COMPANY_VERIFICATION.md completed with `.env.local` → branch; all checks pass.
- [ ] Main backup taken.
- [ ] Main schema: all 10 migrations applied in order (or only missing ones if main has existing data).
- [ ] Data migration: tables copied in §3.1 order (preserve IDs); sequences reset on main (§3.4).
- [ ] Row counts and spot-checks verified on main.
- [ ] Admin user created/verified on main.
- [ ] `.env.local` removed/renamed; server restarted; app verified against main.

---

*Document version: 1.0. Generated for MakAutomation branch → main migration.*
