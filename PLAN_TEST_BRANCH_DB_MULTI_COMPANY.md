# Plan: Test Branch Database for Multiple Companies (Multi-Tenant SaaS)

**Role:** Planning agent — 20+ years software development experience  
**Audience:** You (product/tech owner)  
**Goal:** Test the branch database to confirm it can support multiple companies (not just MAK), and define what to add so each company has its own **logo**, **address**, **phone**, **admin/contact name** on PDFs and workflows.

---

## Executive summary

- **Branch DB** is already multi-tenant at the schema level (tenants, tenant_id everywhere, tenant_project_counters). It currently behaves as “MAK-only” because:
  - Logo is hardcoded to MAK’s file.
  - Company name/address/phone are hardcoded or missing in PDF templates.
  - There is no “company contact / admin name” on tenants or in PDFs.
- **Plan in two parts:**
  1. **Test plan** — Prove the branch DB works for multiple companies (two tenants, two admins, full isolation and project numbering).
  2. **Implementation plan** — Add per-company branding: logo, address, phone, and admin/contact name, then wire them into PDFs and any other workflows.

You’ll run tests against the **branch** Supabase project (`.env.local`), then add the branding features and re-test.

---

## Part 1: Test plan — Branch DB for multiple companies

### 1.1 Prerequisites

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Point app at **branch** DB: `.env.local` with branch Supabase URL and keys. | Server log: `Using Supabase: https://uklvgcrzhhtpqtiwrbfw.supabase.co` and `(from .env.local — dev)`. |
| 2 | Restart dev server (`npm run dev`). | Server starts without DB errors. |
| 3 | Ensure branch DB has multi-tenancy schema. | Run `supabase/dev_full_schema.sql` or migrations in branch project SQL Editor if not already done. |
| 4 | Seed MAK (tenant 1): `node scripts/create-admin-user.js admin@maklonestar.com <password>` | One user with `tenant_id = 1`. Login works. |

### 1.2 Test: Second company (second tenant)

| # | Test | Steps | Expected result |
|---|------|--------|-----------------|
| T1 | Create second tenant + admin | `node scripts/create-tenant.js "Crestfield Engineering" admin@crestfield.com <password>"` (or another company name/email). | New row in `tenants` (e.g. id=2). New ADMIN user with `tenant_id = 2`. |
| T2 | Login as Company 2 admin | Log in with admin@crestfield.com (or the email you used). | JWT contains `tenantId: 2`, `tenantName: "Crestfield Engineering"`. Dashboard loads. |
| T3 | Create project as Company 2 | As Company 2 admin: create a new project. | Project gets `tenant_id = 2`. Project number uses Company 2 prefix (e.g. from `tenant_project_counters` for tenant 2). |
| T4 | Data isolation — Company 2 sees only its data | As Company 2 admin: open Projects list. | Only Company 2’s projects. No MAK (tenant 1) projects. |
| T5 | Data isolation — MAK sees only its data | Log out; log in as MAK admin. | Only MAK’s projects. No Company 2 projects. |
| T6 | Technician scoped to tenant | As Company 2 admin: create a technician. Log in as that technician. | Technician sees only Company 2 projects/tasks. |
| T7 | Project numbering per tenant | Create one project as MAK, one as Company 2. | Different prefixes/sequences (e.g. 02-2025-0001 vs CRESTFIELD-2025-0001 or per-tenant counter). |

### 1.3 Test: Workflow and PDF (current behavior)

| # | Test | Steps | Expected result (today) |
|---|------|--------|--------------------------|
| T8 | PDF generation — Company 2 | As Company 2 admin: open a project/task that can generate a PDF (e.g. WP1, density, rebar). Generate PDF. | PDF generates. **Currently:** PDF still shows MAK logo and “MAK Lonestar Consulting” (hardcoded). This is expected; Part 2 fixes it. |
| T9 | Workflow path per tenant | As Company 2 admin: Settings → set workflow base path. As MAK admin: set a different path. | Each tenant’s path stored under `app_settings` with that tenant’s `tenant_id`. No cross-tenant overwrite. |

### 1.4 Sign-off for “branch DB ready for multiple companies”

- [ ] T1–T7 pass: second tenant exists, login works, project creation and numbering are per-tenant, data is isolated.
- [ ] T8–T9 pass: PDFs generate (even if MAK-branded for now); workflow path is per-tenant.

Once this is done, the **branch database is validated** for multiple companies. Remaining work is **branding and copy** (logo, address, phone, admin name) so each company’s PDFs and workflows show their own details.

---

## Part 2: Implementation plan — Per-company logo, address, phone, admin name

### 2.1 What you said you want

- **Logo** — Each company has its own logo (MAK already has one; others need upload or path).
- **Company address** — On PDFs and anywhere else company info is shown.
- **Phone number** — Company phone on PDFs/workflows.
- **Admin name** — A name to show on PDFs (e.g. “Prepared by: [Admin Name]” or “Company contact: [Admin Name]”). You said you’ll provide this; we need a place to store it and use it.

### 2.2 Database: already there vs. add

| Field | tenants table | Action |
|-------|----------------|--------|
| Company name | `name` | Already used. |
| Address | `company_address`, `company_city`, `company_state`, `company_zip` | Already there. Use in PDFs. |
| Phone | `company_phone` | Already there. Use in PDFs. |
| Email / website | `company_email`, `company_website` | Already there. Optional on PDFs. |
| Logo | `logo_path` | Already there. **Code** still uses hardcoded MAK logo; switch to tenant’s `logo_path`. |
| Admin / contact name | **Missing** | **Add** column, e.g. `company_contact_name` or `primary_contact_name` (text). |

**Recommended migration:** Add to `tenants`:

- `company_contact_name TEXT` (or `primary_contact_name`) — “Name of admin/contact to show on reports and PDFs.”

### 2.3 Backend changes (summary)

| Area | Change |
|------|--------|
| **PDF routes** (`server/routes/pdf.js`) | 1) Resolve `tenantId` from request/task/project. 2) Replace `getLogoBase64()` with `getLogoBase64(tenantId)` that reads `tenants.logo_path` and serves file from e.g. `public/tenants/{tenant_id}/logo.*`. 3) Add `getTenantAddress(tenantId)` and `getTenantContactName(tenantId)` (from `tenants`). 4) Replace all hardcoded “MAK Lonestar Consulting” and “MAK” in HTML generation with tenant name, address, phone, contact name. |
| **PDF HTML templates** | Replace hardcoded “MAK Lonestar Consulting, LLC” (and similar) with placeholders, e.g. `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{COMPANY_CONTACT_NAME}}`, `{{LOGO_IMAGE}}`. PDF route fills these from the tenant record. |
| **Logo upload** | New endpoint, e.g. `POST /api/tenants/logo`, to upload logo for current user’s tenant; save under `public/tenants/{tenant_id}/` and set `tenants.logo_path`. Use `requireAdmin` and tenant from JWT. |
| **Tenant (company) profile API** | `GET /api/tenants/me` (or `/api/tenants/current`) returning tenant name, address, phone, email, website, contact name, logo_path (or logo URL) for the logged-in user’s tenant. Used by Settings UI. |
| **Settings API** | `GET/PUT /api/tenants/me` or `/api/settings/company` to read/update company address, phone, contact name (and optionally logo). Scoped to `req.user.tenantId`. |

### 2.4 Frontend changes (summary)

| Area | Change |
|------|--------|
| **Settings page** | New “Company information” section: company name (display only or editable), address (line, city, state, zip), phone, email, **admin/contact name**. Optional: logo upload with preview. Call the new tenant/settings API. |
| **Login / shell** | Optionally show tenant name or logo in header (from JWT or from `GET /api/tenants/me`). |

### 2.5 PDF and workflow checklist

- [ ] **WP1 report** — Uses `{{LOGO_IMAGE}}`, `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{COMPANY_CONTACT_NAME}}` (or equivalent).
- [ ] **Density report** — Same placeholders.
- [ ] **Rebar report** — Same placeholders plus `{{PE_FIRM_REG_LINE}}`, `{{LICENSE_HOLDER_NAME}}`, `{{LICENSE_HOLDER_TITLE}}`. See **REBAR_PDF_TENANT_FOOTER_SPEC.md**.
- [ ] **Compressive strength report** — Same placeholders.
- [ ] **Proctor PDF** (if any) — Same.
- [ ] **Any other PDF or document** that today says “MAK” or a fixed address — switch to tenant-driven placeholders.
- [ ] **Workflows** that send emails or generate documents — Use tenant address/phone/contact name where appropriate.

### 2.6 Order of implementation (suggested)

1. **Migration:** Add `company_contact_name` (or chosen name) to `tenants`. Run on branch DB.
2. **Backend — tenant helpers:** Implement `getTenantForPdf(tenantId)` (or get tenant row) and helpers: logo base64 from `logo_path`, formatted address, phone, contact name. Keep fallback to current MAK logo if `tenant_id` is 1 and `logo_path` is null (backward compatibility).
3. **Backend — PDF:** Update `pdf.js` to resolve tenant, then replace all hardcoded MAK/logo/address with tenant data and placeholders in generated HTML.
4. **Templates:** Replace hardcoded company text with `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{COMPANY_CONTACT_NAME}}`, `{{LOGO_IMAGE}}`.
5. **API:** Add `GET /api/tenants/me` and `PUT /api/tenants/me` (or `/api/settings/company`) for company info and optional logo upload.
6. **Settings UI:** Add company information form and, if you want, logo upload. Load/save via the new API.
7. **Re-test:** As MAK admin, set address, phone, contact name (and logo if implemented). As Company 2 admin, set different values. Generate PDFs for both; confirm each PDF shows the correct company logo, address, phone, and contact name.

---

## Part 3: Data you’ll provide

You mentioned you’ll provide:

- **Company address** (for MAK and/or for a second company)
- **Phone number**
- **Admin name** (for PDFs)

Suggested use:

- **MAK (tenant 1):** Update `tenants` (via Settings UI once built, or via SQL for now) with address, phone, `company_contact_name`.
- **Second company (e.g. Crestfield):** Same fields. Logo path can be set once logo upload or file drop is in place.

Example SQL (after migration and backend are in place you can still seed via SQL):

```sql
UPDATE tenants
SET
  company_address = '123 Main St',
  company_city = 'Houston',
  company_state = 'TX',
  company_zip = '77001',
  company_phone = '(555) 123-4567',
  company_contact_name = 'Jane Smith'
WHERE id = 1;
```

---

## Summary table

| Phase | What | Outcome |
|-------|------|--------|
| **1. Test branch DB** | Prerequisites + T1–T9 | Branch DB proven for multiple companies; data and numbering isolated; PDFs still MAK-branded. |
| **2a. Schema** | Add `company_contact_name` to `tenants` | Ready to show admin/contact name on PDFs. |
| **2b. Backend** | Tenant-aware logo, address, phone, contact name; PDF and tenant APIs | All PDFs and APIs use per-tenant branding. |
| **2c. Templates** | Placeholders in HTML templates | No hardcoded MAK in templates. |
| **2d. Settings UI** | Company info form (+ optional logo upload) | Admins can set address, phone, contact name (and logo) for their company. |
| **2e. Re-test** | Generate PDFs for two tenants | Each company’s PDFs show that company’s logo, address, phone, and admin/contact name. |

---

## Next step

1. Run **Part 1** (test plan) on the branch database and tick off T1–T9.
2. When you’re ready, we can implement **Part 2** (migration, backend, templates, Settings UI) in that order; you can then supply the exact address, phone, and admin names for MAK and the second company so they appear correctly on PDFs and workflows.

If you tell me your preferred name for the “admin name” field (`company_contact_name` vs `primary_contact_name` vs something else), I can outline the exact migration and the placeholder name to use in templates (`{{COMPANY_CONTACT_NAME}}` or `{{ADMIN_NAME}}`, etc.).
