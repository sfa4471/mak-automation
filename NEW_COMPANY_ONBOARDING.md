# Add a New Company (Tenant) — Onboarding Flow

Right now **MAK** is the only tenant. All logo and company info you see when you log in as `admin@maklonestar.com` is MAK’s.

When you add another company (e.g. **XYZ**), you provide that company’s information and get a **separate login** for that company. That login sees only XYZ’s data and XYZ’s branding (once you set it).

---

## How it works

1. You say: “I have another company, XYZ.”
2. You (or your team) provide the information below for XYZ.
3. We create the **tenant** (XYZ) and a **company-specific admin login**.
4. XYZ’s admin logs in with that email/password and sees only XYZ’s projects and company info.

---

## Information needed for the new company

When you’re ready to add a company (e.g. XYZ), have this ready:

### Required
| What we need | Example | Used for |
|--------------|---------|----------|
| **Company name** | XYZ Corp | Tenant name; shown in app and project numbers. |
| **Admin email** | admin@xyz.com | Login for this company’s admin (unique per company). |
| **Admin password** | (your choice) | Login password for that admin. |

### Optional (company profile / branding)
| What we need | Example | Used for |
|--------------|---------|----------|
| Company address | 123 Main St | Shown in reports/settings. |
| Company city | Houston | |
| Company state | TX | |
| Company zip | 77001 | |
| Company phone | (555) 123-4567 | |
| Company email | info@xyz.com | |
| Company website | https://xyz.com | |
| Project number prefix | XYZ or XC | Project numbers like `XYZ-2025-0001`. Default: derived from company name. |
| Subdomain (future) | xyz | For URLs like xyz.yourapp.com (if you use subdomains later). |

### Optional (admin)
| What we need | Example |
|--------------|---------|
| Admin display name | John Smith |

---

## Two ways to create the company and login

### Option 1 — Interactive script (recommended)

Run:

```powershell
node scripts/create-tenant-interactive.js
```

The script will ask for the information above (required first, then optional). At the end it will:

- Create the new tenant (company) with the details you gave.
- Create the admin user for that company.
- Print the **company-specific login**: email and password, and the app URL.

Use that email and password to log in; you’ll see only that company’s data (and later its logo/settings when you set them).

### Option 2 — One command (if you already have the details)

```powershell
node scripts/create-tenant.js "XYZ Corp" admin@xyz.com yourpassword
```

That creates the company and its first admin. To set address, phone, etc., use **Settings** in the app after logging in as that admin, or add a script/API later that updates the tenant.

---

## What you get back

After creating the new company (either option):

| Item | What you get |
|------|----------------|
| **Company** | New tenant in the DB (e.g. XYZ Corp) with the info you provided. |
| **Login** | One admin account tied to that company only. |
| **Email** | The admin email you provided (e.g. `admin@xyz.com`). |
| **Password** | The password you chose. |
| **Where to log in** | Same app URL (e.g. http://localhost:3000). Log in with that email/password; the app will show only that company’s data and, once set, that company’s logo and settings. |

So: **one tenant = MAK (current), another tenant = XYZ (or any name). Each has its own admin login and its own company information and logo.**

---

## Confirmation: XYZ can never see MAK data or technicians

**Yes.** Company XYZ can **never** see MAK Lone Star’s data or technicians. Isolation is enforced in the app:

| What | How it’s enforced |
|------|-------------------|
| **Login** | Each user has a fixed `tenant_id` (e.g. MAK = 1, XYZ = 2). The JWT stores that tenant. |
| **Projects** | All project list/create/get/update use `req.tenantId`. XYZ only sees projects where `tenant_id = 2`. |
| **Technicians** | Technician list and create are filtered by `tenant_id`. XYZ only sees and can only assign technicians that belong to tenant 2. MAK’s technicians have `tenant_id = 1` and never appear for XYZ. |
| **Tasks, work packages, reports** | Every task/work package/project is tied to a tenant. Routes check that the resource’s `tenant_id` matches the logged-in user’s tenant; otherwise they return 403 or 404. |
| **Company info / logo** | `GET /api/tenants/me` returns only the current user’s tenant. XYZ’s admin sees only XYZ’s company name, address, logo, etc. |
| **Settings** | App settings (e.g. workflow path) are stored per tenant; XYZ cannot see or change MAK’s settings. |

So: **MAK and XYZ (and any other tenant) are fully isolated.** XYZ cannot see MAK’s data, technicians, projects, or company info, and MAK cannot see XYZ’s.
