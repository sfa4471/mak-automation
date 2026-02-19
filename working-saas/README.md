# Working directory: SaaS conversion

This folder holds the **planning and reference** materials for converting MAK Automation from a single-tenant app to multi-tenant SaaS. **Application code stays in the repo root** and is modified only on the branch `feature/multi-tenant-saas` so that **main remains untouched** until you are satisfied.

---

## Steps to start (in order)

Do these once to begin the SaaS conversion:

1. **Read the plan**  
   Open **SAAS_CONVERSION_MASTER_PLAN.md** and read **Section 2** (working directory) and **Section 6** (implementation order).

2. **Create the branch**  
   From the repo root:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/multi-tenant-saas
   git push -u origin feature/multi-tenant-saas
   ```

3. **Create a dev Supabase project**  
   In the [Supabase dashboard](https://supabase.com/dashboard), create a new project (e.g. “MAK Automation – SaaS dev”). Copy its **Project URL** and **service_role** key.

4. **Point local env to dev Supabase**  
   In the repo root: copy `.env` to `.env.saas-dev`. In `.env.saas-dev`, set:
   - `SUPABASE_URL=` (your dev project URL)
   - `SUPABASE_SERVICE_ROLE_KEY=` (your dev project service_role key)

5. **Implement**  
   Follow **CODE_CHANGES_CHECKLIST.md** and the migration/implementation order in **SAAS_CONVERSION_MASTER_PLAN.md** (Section 6). Run the app on the working branch with:
   ```bash
   node working-saas/run-dev-with-saas-env.js
   ```

---

## Contents

| File | Purpose |
|------|--------|
| **SAAS_CONVERSION_MASTER_PLAN.md** | Master plan: goals, working-directory strategy, DB changes, code changes, implementation order, checklist. |
| **CODE_CHANGES_CHECKLIST.md** | File-by-file checklist for backend, frontend, and DB migrations. |
| **run-dev-with-saas-env.js** | Optional: run `npm run dev` using `.env.saas-dev` so the working branch uses a dev Supabase project. |
| **README.md** | This file. |

## Running locally: main vs working code

You use the **same commands** to run the app. What changes is **which branch is checked out** — that’s what determines whether you’re running main or working code.

### One repo, one running copy (recommended)

- **Main code:**  
  `git checkout main` → then `npm run dev` (or `npm run server` + `npm run client`).  
  You are now running the **main** code.

- **Working (SaaS) code:**  
  `git checkout feature/multi-tenant-saas` → then `npm run dev` (same command).  
  You are now running the **working branch** code.

There is **no different command** for the working branch. The run commands are the same; the **branch** decides which code runs.

**How to tell which code you’re on:**  
Run `git branch` — the current branch has a `*`. Or check your terminal/IDE; many show the branch name.

**Recommendation for the working branch:** Use a **different env file** so the working branch talks to a **dev Supabase** project, not production:

- Copy `.env` to `.env.saas-dev` in the repo root.
- In `.env.saas-dev`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your **dev** Supabase project.
- When on `feature/multi-tenant-saas`, run the app with that env using the helper script (from repo root):
  ```bash
  node working-saas/run-dev-with-saas-env.js
  ```
  This loads `.env.saas-dev` and then runs `npm run dev`. Same dev server, but it uses your dev database.

So in practice:

- **Main:** `git checkout main` → `npm run dev` (uses `.env` / production Supabase if configured).
- **Working:** `git checkout feature/multi-tenant-saas` → `node working-saas/run-dev-with-saas-env.js` (uses `.env.saas-dev` / dev Supabase).

### Optional: run main and working at the same time (two folders)

If you want **both** running side by side (e.g. main on port 5000, working on 5001):

1. Clone the repo into a **second folder** (e.g. `MakAutomation-SaaS`).
2. In **folder 1:** `git checkout main` → `npm run dev` (ports 5000 + 3000).
3. In **folder 2:** `git checkout feature/multi-tenant-saas` → set `PORT=5001` and client port 3001 (if needed), use `.env.saas-dev` → `npm run dev`.

Then you have two windows: one is main, one is working. Different ports and different envs keep them separate.

---

## Quick start

1. **Create the feature branch (do not work on main):**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/multi-tenant-saas
   git push -u origin feature/multi-tenant-saas
   ```

2. **Use a separate Supabase project for development** so production DB is not affected. Set `.env.local` (or your local env) to point to this dev project.

3. **Follow the implementation order** in **SAAS_CONVERSION_MASTER_PLAN.md** (Section 6) and tick off **CODE_CHANGES_CHECKLIST.md** as you go.

4. **When you are happy** with behavior and tests, merge the branch into `main` and then run the same migration on production (with a backup and rollback plan).

## Design goals (per client)

- Different **logo**
- Different **company address** (e.g. on PDFs)
- Different **project numbering** (prefix and sequence per tenant)
- Different **admins** and **technicians** (users scoped by tenant)

All of this is achieved by introducing a **tenants** table, adding **tenant_id** to all tenant-scoped tables, and enforcing tenant context in auth and every API route.
