# Dev DB & Feature Branch Setup — Multi-Tenant SaaS

**Audience:** Database / DevOps.  
**Goal:** Use a **separate Supabase project** for development and run **only** the multi-tenancy migration there.  
**Branch:** Create and use `feature/multi-tenant-saas` locally (branch creation from automation may fail; run on your machine).

---

## 1. Feature branch (run on your machine)

Branch creation may fail in automated environments (e.g. lock files, permissions). Run locally:

```powershell
cd c:\MakAutomation
git checkout -b feature/multi-tenant-saas
```

If you see a lock error:

```text
fatal: cannot lock ref 'refs/heads/feature/multi-tenant-saas': Unable to create '...\.git\refs\heads\feature\multi-tenant-saas.lock': File exists.
```

Remove the stale lock and retry:

```powershell
Remove-Item -Force "c:\MakAutomation\.git\refs\heads\feature\multi-tenant-saas.lock" -ErrorAction SilentlyContinue
git checkout -b feature/multi-tenant-saas
```

Then do all multi-tenant work on this branch.

---

## 2. Separate Supabase project for Dev DB

- **Do not** run the multi-tenancy migration on production first.
- Use a **dedicated Supabase project** for development (different from the one in current `.env`).

### 2.1 Create the Dev Supabase project

1. Go to [Supabase Dashboard](https://app.supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `mak-automation-dev`), region, strong DB password.
3. Wait until the project is fully provisioned.
4. In **Project Settings → API** copy:
   - **Project URL** (e.g. `https://xxxxxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep secret; use only for server-side/dev).

---

## 3. Point env to the Dev Supabase project

The server **loads `.env.local` automatically** after `.env`, so dev Supabase credentials in `.env.local` override production.

### Option A — `.env.local` (recommended)

1. Copy the example and add your **dev** project credentials:
   ```powershell
   copy .env.local.example .env.local
   ```
2. Edit `.env.local` and replace the placeholders with values from your Dev Supabase project (**Settings → API**):
   - `SUPABASE_URL` → Project URL
   - `SUPABASE_ANON_KEY` → anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role key
3. Run the app as usual (`npm run server` or `npm run dev`). The server will use the dev project when `.env.local` is present.

`.env.local` is gitignored; do not commit it.

### Option B — Separate env file (e.g. `.env.dev`)

Create `.env.dev` with the same three variables as above. Run the server with that file:

```powershell
# Example (adjust for your stack)
$env:DOTENV_CONFIG_PATH = ".env.dev"; node server/index.js
```

Or use a script in `package.json` that sets `DOTENV_CONFIG_PATH=.env.dev` (or equivalent) so only dev DB is used when you run that script.

### Option C — Temporarily overwrite `.env`

Replace `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env` with the dev project values. **Revert before committing or deploying** so production never uses dev credentials.

---

## 4. Dev DB schema prerequisite

The migration `20250210000000_add_multi_tenancy.sql` assumes these already exist:

- Tables: `users`, `projects`, `project_counters`, `workpackages`, `tasks`, `wp1_data`, `proctor_data`, `density_reports`, `rebar_reports`, `notifications`, `task_history`, `app_settings`
- They come from:
  - `20250131000000_initial_schema.sql`
  - `20250201000000_add_app_settings.sql`
  - `20250202000000_add_proctor_correction_factor.sql`

So the **dev** Supabase database must have the base schema before you run the multi-tenancy migration.

---

## 5. Run only the multi-tenancy migration on Dev DB

**Meaning of “run only 20250210000000_add_multi_tenancy.sql”:**  
On the **dev** project you run this single migration file. You do **not** run it on production until you are ready. The dev DB must already have the base schema (step 4).

### 5.1 Apply base schema on the dev project (if DB is empty)

**Option A — One script (easiest for a brand-new dev project)**  
Run **one** file in the Dev project **SQL Editor**:

- **`supabase/dev_full_schema.sql`** — base schema + app_settings + proctor + multi-tenancy in order. Paste the entire file and click **Run**. Then skip to step 5.3 (Verify).

**Option B — Run migrations one by one**  
In the **SQL Editor** of the **dev** project, run these in order:

1. `supabase/migrations/20250131000000_initial_schema.sql`
2. `supabase/migrations/20250201000000_add_app_settings.sql`
3. `supabase/migrations/20250202000000_add_proctor_correction_factor.sql`
4. Then run the multi-tenancy migration (step 5.2).

If the dev DB already has the base schema (e.g. from Option A or a previous run), run **only** the multi-tenancy migration (step 5.2).

### 5.2 Run the multi-tenancy migration

1. Open the **Dev** Supabase project in the dashboard.
2. Go to **SQL Editor**.
3. Open `c:\MakAutomation\supabase\migrations\20250210000000_add_multi_tenancy.sql` locally and copy its full contents.
4. Paste into a new query and **Run**.

This migration will:

- Create `tenants` and `tenant_project_counters`.
- Add nullable `tenant_id` to all tenant-scoped tables, then backfill with `tenant_id = 1`, then set `tenant_id` NOT NULL.
- Insert default tenant (e.g. MAK), backfill `tenant_project_counters` from `project_counters`.
- Replace unique constraints with tenant-scoped uniques (e.g. `(tenant_id, project_number)`).
- Add indexes on `tenant_id`.

### 5.3 Verify

In the Dev project **Table Editor** (or SQL):

- `tenants`: one row (e.g. id = 1, name “MAK Lone Star Consulting”).
- `tenant_project_counters`: rows for tenant_id = 1 and any years present in `project_counters`.
- All listed tables have `tenant_id` NOT NULL and the new indexes.

### 5.4 Create your first admin user (required for login)

The branch/dev database has **no user accounts** until you create one. After applying the schema (and multi-tenancy migration), create an admin so you can sign in:

1. Ensure `.env.local` points at your **dev** Supabase project (see section 3).
2. From the project root run:
   ```powershell
   node scripts/create-admin-user.js
   ```
   Or with explicit email/password:
   ```powershell
   node scripts/create-admin-user.js admin@maklonestar.com yourpassword
   ```
3. Log in at http://localhost:3000 with that email and password.

If you skip this step, you will get **"Invalid credentials"** when signing in. See **QA_REPORT_BRANCH_DB_LOGIN_AND_SAAS.md** and **SWITCH_TO_BRANCH_DATABASE.md** for details.

---

## 6. Checklist

- [ ] Feature branch `feature/multi-tenant-saas` created locally (and lock removed if it failed).
- [ ] New Supabase project created for dev (separate from production).
- [ ] Env pointed to dev: `.env.local` or `.env.dev` or temporary `.env` with dev `SUPABASE_*` only when running locally.
- [ ] Dev DB has base schema (initial + app_settings + proctor migrations) applied.
- [ ] Only `20250210000000_add_multi_tenancy.sql` run on the **dev** project (not on production).
- [ ] Verification: `tenants`, `tenant_project_counters`, and `tenant_id` on all target tables look correct.
- [ ] **Create first admin:** `node scripts/create-admin-user.js` (with `.env.local` pointing at dev DB).

### 6.1 Operational checklist for branch DB (SaaS testing)

Use this when validating the branch DB for multi-tenant SaaS:

| Step | Check | How to verify |
|------|--------|----------------|
| 1 | Schema applied | `dev_full_schema.sql` or migrations run on branch Supabase. |
| 2 | Default tenant | `tenants` has one row, id = 1, active. |
| 3 | Admin user | Run `node scripts/create-admin-user.js` with `.env.local` → branch DB. |
| 4 | Login & JWT | Log in; token contains `tenantId`, `tenantName`. |
| 5 | Project + tenant | Create a project; confirm `tenant_id = 1` and number from `tenant_project_counters`. |
| 6 | Technician scope | Create technician under tenant 1; log in as tech; only that tenant’s data. |
| 7 | (Optional) Isolation | Add second tenant + user; confirm no cross-tenant data in UI/API. |

---

## 7. Run the app and know which DB you're using

You use the **same command** on both main and the feature branch:

```bash
npm run dev
```

**How you know which database is in use:**

- When the server starts, it prints which Supabase project it is using:
  - **`Project ref: uklvgcrzhhtpqtiwrbfw (from .env.local — dev)`** → you are on **Crestfield (dev)**. You are on the feature branch with `.env.local` present.
  - **`Project ref: hyjuxclsksbyaimvzulq (from .env — main)`** → you are on **main Supabase**. Either you have no `.env.local`, or you are on `main` and only `.env` is used.

**Workflow summary:**

| Where you are        | What you want to hit | What to do |
|----------------------|----------------------|------------|
| Branch (feature/multi-tenant-saas) | Dev DB (Crestfield) | Keep `.env.local` with Crestfield credentials. Run `npm run dev`. Check startup log for `from .env.local — dev`. |
| Main                 | Main/production DB   | Remove or rename `.env.local`, or don’t create it. Run `npm run dev`. Check startup log for `from .env — main`. |

You do **not** run `npm run supabase:execute-and-verify` for the dev DB on this branch — that script uses only `.env` and is for your main project. On the branch you already applied `supabase/dev_full_schema.sql` once in the Crestfield SQL Editor.

---

## 8. Production

Do **not** run `20250210000000_add_multi_tenancy.sql` on production until you have tested the multi-tenant flow on dev and are ready for the conversion (backfill, constraint changes, and NOT NULL steps are one-way).

---

*Dev DB setup for multi-tenant SaaS — run only the multi-tenancy migration on a separate Supabase dev project.*
