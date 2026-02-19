# Multiple Companies (Tenants) — Planning Guide

**Audience:** Admins / DevOps.  
**Purpose:** How multiple companies (e.g. MAK Lone Star vs XYZ) work, how to add a new company, create its admin, and how login behaves.  
**Context:** 20+ year planning perspective; branch DB and SaaS-ready schema.

---

## 1. How it works today

### 1.1 One company = one tenant

- **Tenant** = one company/organization (e.g. "MAK Lone Star Consulting", "XYZ Corp").
- Each tenant has its own:
  - **Users** (admins and technicians) — unique per `(tenant_id, email)` (same email can exist in different tenants).
  - **Projects, tasks, work packages, reports** — all scoped by `tenant_id`.
  - **Project numbers** — per-tenant sequence via `tenant_project_counters` (e.g. `02-2025-0001` for tenant 1, `XYZ-2025-0001` for tenant 2).
  - **Company info** — name, address, logo, project number prefix, etc. in `tenants`.

### 1.2 Current setup (single tenant)

- **Default tenant:** id = 1, name "MAK Lone Star Consulting" (created by multi-tenancy migration).
- **First admin:** Created with `node scripts/create-admin-user.js` → that user has `tenant_id = 1`.
- Everyone in the app today belongs to tenant 1.

### 1.3 Adding a second company (e.g. XYZ)

To have another company (e.g. "XYZ") use the same app and same database:

1. **Create the tenant (company) record** — insert a new row in `tenants` with name, optional subdomain, project number prefix, etc.
2. **Create an admin for that tenant** — insert a user with `role: 'ADMIN'`, `tenant_id: <new_tenant_id>`.
3. **Login:** That admin logs in with their email/password. If that email exists **only** in tenant 2, login works without choosing a tenant. If the same email existed in both tenant 1 and tenant 2, the API would return `MULTIPLE_TENANTS` and the client would need to send `tenantId` (or show a company selector).

---

## 2. How to add a new company (e.g. XYZ)

### Option A — Script (recommended)

From project root, with `.env.local` pointing at your branch/main DB:

```powershell
# Create tenant "XYZ" with default project prefix "XYZ", then create its admin
node scripts/create-tenant.js "XYZ Corp" admin@xyz.com admin123

# Create tenant only (no admin)
node scripts/create-tenant.js "XYZ Corp"

# With custom project number prefix (e.g. "XC" instead of derived from name)
node scripts/create-tenant.js "XYZ Corp" admin@xyz.com admin123 --prefix XC
```

- **Tenant:** Gets a new row in `tenants` (name, `project_number_prefix`, etc.).
- **Admin:** If you pass email (and optionally password), the script creates an ADMIN user for that tenant. You can then log in as that admin; they only see XYZ’s projects and data.

### Option B — Manual SQL (Supabase SQL Editor)

Run in your Supabase project’s SQL Editor:

```sql
-- Insert new tenant (id will auto-increment)
INSERT INTO tenants (
  name, project_number_prefix, project_number_format, is_active
) VALUES (
  'XYZ Corp', 'XYZ', 'PREFIX-YYYY-NNNN', true
);

-- Optional: create admin for that tenant (replace 2 with the actual id returned above)
-- First run: SELECT id FROM tenants ORDER BY id DESC LIMIT 1; to get the new id
INSERT INTO users (email, password, role, name, tenant_id)
VALUES (
  'admin@xyz.com',
  '$2a$10$...',  -- use bcrypt hash of your password, or create user via script after
  'ADMIN',
  'XYZ Admin',
  2
);
```

Creating the admin with a proper bcrypt hash is easier via the script (Option A).

---

## 3. How to create an admin for a specific tenant

### 3.1 When you already have the tenant (e.g. tenant id = 2)

```powershell
# Create or reset admin for tenant ID 2
node scripts/create-admin-user.js admin@xyz.com admin123 2
```

### 3.2 By tenant name (script resolves id)

```powershell
# Create or reset admin for tenant named "XYZ Corp"
node scripts/create-admin-user.js admin@xyz.com admin123 "XYZ Corp"
```

### 3.3 Default (tenant 1 — MAK)

```powershell
# Same as before: tenant 1
node scripts/create-admin-user.js admin@maklonestar.com admin123
```

So:

- **One company (MAK):** Use `create-admin-user.js` with no fourth argument → tenant 1.
- **Second company (XYZ):** Create tenant with `create-tenant.js`, then use `create-admin-user.js email password 2` (or `"XYZ Corp"`).

---

## 4. Login when there are multiple companies

### 4.1 One account per email across tenants

- If **admin@example.com** exists in **only one** tenant → login with email/password works; the server picks that tenant and JWT contains `tenantId` and `tenantName`.
- If **admin@example.com** exists in **two or more** tenants → server returns **400** with `code: 'MULTIPLE_TENANTS'` and message asking to specify tenant or use company portal. The client must then:
  - Send **tenantId** in the login request body, e.g. `POST /auth/login` with `{ email, password, tenantId: 2 }`, or
  - Show a **company/tenant selector** (e.g. dropdown or subdomain) and then send `tenantId` with the same email/password.

### 4.2 Recommended: different emails per company

- **MAK:** admin@maklonestar.com  
- **XYZ:** admin@xyz.com  

Then each admin has a single tenant; no `MULTIPLE_TENANTS` flow is needed. If you later allow the same person to be admin in two companies, use the same email and add tenant selection (or subdomain) and `tenantId` in login.

---

## 5. What each admin sees

- **MAK admin (tenant 1):** Only MAK’s projects, technicians, reports, and company settings. Project numbers like `02-2025-0001`.
- **XYZ admin (tenant 2):** Only XYZ’s projects, technicians, reports, and company settings. Project numbers like `XYZ-2025-0001` (or whatever prefix you set).

Data is isolated by `tenant_id` in the backend and by `req.tenantId` in the API; the app does not show cross-tenant data.

---

## 6. Summary table

| Goal | What to do |
|------|------------|
| First company (MAK) | Already done: tenant 1 + `create-admin-user.js` for admin@maklonestar.com. |
| Second company (XYZ) | Run `create-tenant.js "XYZ Corp" admin@xyz.com admin123` (or create tenant then `create-admin-user.js ... 2`). |
| Create another admin for existing tenant | `node scripts/create-admin-user.js email password <tenantId_or_name>`. |
| Login with one company | Use that company’s admin email/password; no tenant choice needed. |
| Same email in two companies | Login returns MULTIPLE_TENANTS; add tenant selector in UI and send `tenantId` in login body. |

---

## 7. Script reference

| Script | Purpose |
|--------|---------|
| `node scripts/create-admin-user.js [email] [password] [tenantId_or_name]` | Create or reset an ADMIN user. Default tenant = 1; optional 4th arg = tenant id (number) or tenant name (string). |
| `node scripts/create-tenant.js "Company Name" [adminEmail] [adminPassword] [--prefix PREFIX]` | Create a new tenant (company). Optionally create its first admin. |

Both scripts use the same DB as your app: ensure `.env.local` (or `.env`) points at the correct Supabase project (branch or main).
