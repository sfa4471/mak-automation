# Why you see "User has no tenant assigned" (and main code seems disturbed)

## What happened

The **multi-tenant** feature was added to this repo (on branch `feature/multi-tenant-saas` or merged into main). So the code you run **already includes** tenant checks:

- Login requires each user to have a **tenant** (company) in the database.
- Many API routes use `requireTenant` and expect `tenant_id` on users and other tables.

So it’s not that “main was left alone” — the codebase you have **is** the multi-tenant version. If your database was set up **before** that (or the multi-tenant migration was never run), then:

- There is no `tenants` table, or it’s empty.
- `users` have no `tenant_id`.
- Login fails with **"User has no tenant assigned"** or **"Database error"**.

## What to do

1. **Run the full multi-tenant schema** so the DB matches the code:
   - In Supabase: **SQL Editor** → run the contents of `supabase/dev_full_schema.sql` (or the multi-tenant migration that creates `tenants`, inserts the default tenant, and sets `users.tenant_id`).
2. **Or** use a branch/commit that does **not** include multi-tenant if you want the old behavior without tenants.

After the schema is applied (default tenant exists and users have `tenant_id`), login should work.
