# Branch Database — Multi-Company Readiness Verification

**Purpose:** Verify the **branch** Supabase project (`uklvgcrzhhtpqtiwrbfw`) is correctly set up to handle multiple companies (tenants) before migrating data to main.

**Run this with `.env.local` pointing at the branch DB** (see SWITCH_TO_BRANCH_DATABASE.md).

---

## 1. Schema: Multi-Tenancy Applied

| Check | How to verify |
|-------|----------------|
| `tenants` table exists | Supabase → Table Editor → `tenants` (id, name, project_number_prefix, etc.). |
| `tenant_project_counters` exists | Table Editor → `tenant_project_counters` (tenant_id, year, next_seq). |
| All tenant-scoped tables have `tenant_id` NOT NULL | `users`, `projects`, `workpackages`, `tasks`, `wp1_data`, `proctor_data`, `density_reports`, `rebar_reports`, `notifications`, `task_history`, `app_settings` — each has `tenant_id` and it is NOT NULL. |
| Tenant-scoped unique constraints | `projects`: unique on `(tenant_id, project_number)`. `users`: unique on `(tenant_id, email)`. `app_settings`: unique on `(tenant_id, key)`. |
| Later migrations applied (optional but recommended) | `tenants.api_base_url`, `tenants.pe_license_holder`, `tenants.company_contact_name`, `password_reset_tokens`, `project_customer_details`, `project_drawings` if your app uses them. |

**Quick SQL (run in branch DB SQL Editor):**

```sql
-- Should return 1 row per tenant-scoped table; all tenant_id NOT NULL
SELECT 'tenants' AS tbl, COUNT(*) AS cnt FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'tenant_project_counters', COUNT(*) FROM tenant_project_counters;
```

---

## 2. Default Tenant and Data

| Check | How to verify |
|-------|----------------|
| Default tenant (MAK) | `tenants` has at least one row, e.g. id = 1, name like "MAK Lone Star Consulting", `is_active = true`. |
| All existing rows have tenant_id = 1 | No NULL tenant_id; if you had data before multi-tenancy, it should be backfilled with tenant_id = 1. |
| Project counters migrated | `tenant_project_counters` has rows for tenant_id = 1 and the same years/sequences as your projects. |

---

## 3. Multi-Company Capability

| Check | How to verify |
|-------|----------------|
| Add second tenant | `node scripts/create-tenant.js "Test Company Two" admin2@test.com pass123` (with `.env.local` → branch). |
| Second tenant in DB | `tenants` has 2 rows; `tenant_project_counters` can have rows for tenant_id = 2 when first project is created. |
| Create admin for tenant 2 | `node scripts/create-admin-user.js admin2@test.com pass123 2` — login as that user and confirm they see only tenant 2’s data (isolation). |

---

## 4. Scripts and App

| Check | How to verify |
|-------|----------------|
| create-tenant.js | Runs without error and inserts into `tenants` (and optionally creates admin). |
| create-admin-user.js with tenant | `node scripts/create-admin-user.js email pass 2` or `"Company Name"` creates user with correct `tenant_id`. |
| Login returns tenant in JWT | After login, token/session includes `tenantId` and `tenantName`; API uses them for scoping. |

---

## 5. Checklist Summary

- [ ] Branch DB has full schema: base + multi-tenancy migration (+ any later migrations you use).
- [ ] `tenants` and `tenant_project_counters` exist; all tenant-scoped tables have `tenant_id` NOT NULL and correct uniques.
- [ ] Default tenant (id = 1) exists; existing data has tenant_id = 1.
- [ ] You can create a second tenant and second-tenant admin; login and data are isolated by tenant.

When all are satisfied, the branch is **ready for multiple companies** and you can proceed with planning the **branch → main data migration**.
