# Step 2: Run branch → main migration

**Prerequisite:** Step 1 done (`node scripts/verify-branch-multi-company.js` passed).

**Important:** Main must have the **full schema** (all 10 migrations) and **tenant-scoped** unique constraints (e.g. `(tenant_id, project_number)` on projects). If main has old schema (e.g. unique on `project_number` only), the data migration will fail until you apply all migrations on main and optionally use `--truncate-first`.

---

## 2a. Apply migrations to MAIN

Main database must have the same schema as branch before copying data.

### Option A — Script (requires Postgres connection string)

**See [ADD_MAIN_SUPABASE_DB_URL.md](ADD_MAIN_SUPABASE_DB_URL.md) for full step-by-step instructions.**

1. In Supabase Dashboard, open your **main** project → **Settings** → **Database**.
2. Copy the **Connection string** → **URI** (replace `[YOUR-PASSWORD]` with your database password).
3. Add to **`.env`** (project root):
   ```env
   MAIN_SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
4. Run:
   ```powershell
   node scripts/apply-migrations-to-main.js
   ```

### Option B — Manual (no connection string)

1. Open **main** Supabase project → **SQL Editor**.
2. Run each file in `supabase/migrations/` **in this order** (copy/paste contents and Run):
   - `20250131000000_initial_schema.sql`
   - `20250201000000_add_app_settings.sql`
   - `20250202000000_add_proctor_correction_factor.sql`
   - `20250210000000_add_multi_tenancy.sql`
   - `20250211000000_add_tenant_api_base_url.sql`
   - `20250216000000_add_project_customer_details.sql`
   - `20250216100000_add_password_reset_tokens.sql`
   - `20250217000000_add_tenant_pe_and_license_holder.sql`
   - `20250217100000_add_tenant_company_contact_name.sql`
   - `20250218000000_add_project_drawings.sql`

---

## 2b. Copy data branch → main

- **`.env`** must have **main** Supabase credentials: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (main project).
- **`.env.local`** must have **branch** credentials (so the script can read from branch).

1. **Dry run** (only reads branch, no writes):
   ```powershell
   node scripts/migrate-branch-to-main.js --dry-run
   ```
2. **Run migration**:
   ```powershell
   node scripts/migrate-branch-to-main.js
   ```
3. If you did **not** set `MAIN_SUPABASE_DB_URL`, the script will print SQL to reset sequences. Run that SQL in **main** project → SQL Editor.

---

## After Step 2

- Verify row counts on main (see BRANCH_TO_MAIN_MIGRATION_PLAN.md §5.1).
- Create admin on main: remove/rename `.env.local`, then `node scripts/create-admin-user.js admin@maklonestar.com <password> 1`.
- Switch app to main: keep `.env.local` removed, restart server, test.
