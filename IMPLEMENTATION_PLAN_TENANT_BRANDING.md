# Implementation Plan: Tenant Branding (Multi-Company PDFs & Settings)

**Goal:** Implement all remaining work so each tenant (company) has its own logo, address, phone, contact name, and (for Rebar) P.E. / license holder on PDFs and in Settings.

---

## Order of work (dependencies)

Do in this order so each step has what it needs.

| Phase | What | Why this order |
|-------|------|-----------------|
| **1** | Database migrations | Backend needs the new columns before reading/writing them. |
| **2** | Tenant helpers (shared code) | pdf.js and proctor.js both need the same helpers. |
| **3** | pdf.js updates | Uses helpers + templates; no API dependency. |
| **4** | proctor.js updates | Uses same tenant resolution + logo/address. |
| **5** | HTML templates | Replace hardcoded text with placeholders (pdf.js already injects values). |
| **6** | Tenant API (GET/PUT /api/tenants/me) | Settings UI will call this; backend only. |
| **7** | Settings UI (company info + optional logo) | Depends on tenant API. |

---

## Phase 1: Database migrations

**Owner:** Backend / DB  
**Where:** `supabase/migrations/`

- [ ] **1.1** Add `company_contact_name` to `tenants`  
  - New migration, e.g. `20250217100000_add_tenant_company_contact_name.sql`  
  - `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_contact_name TEXT;`

- [ ] **1.2** Ensure Rebar fields exist (already added in `20250217000000_add_tenant_pe_and_license_holder.sql`)  
  - `pe_firm_reg`, `license_holder_name`, `license_holder_title`  
  - If not yet run on your DB, run that migration.

- [ ] **1.3** Run migrations on branch DB first; then on main when ready.

**Done when:** Branch (and later main) DB have the new columns; no errors when app reads/writes tenants.

---

## Phase 2: Tenant helpers (shared code)

**Owner:** Backend  
**Where:** `server/routes/pdf.js` (and optionally a small `server/utils/tenantPdfHelpers.js` if you want to share with proctor)

- [ ] **2.1** **Resolve tenant for a request**  
  - Helper: `getTenantIdForPdf(req, taskOrProject)`  
  - Returns `tenant_id` from: `req.user.tenantId` or task’s/project’s `tenant_id`.  
  - Used by every PDF route.

- [ ] **2.2** **Load tenant row**  
  - Helper: `getTenantById(tenantId)` or `getTenantForPdf(tenantId)`  
  - Fetches from `tenants` by id. Returns null if not found.  
  - Cache per request if you call it multiple times in one PDF.

- [ ] **2.3** **Logo**  
  - Replace `getLogoBase64()` with `getLogoBase64(tenantId)`.  
  - If `tenantId` is null or tenant has no `logo_path`, use current fallback: path to `MAK logo_consulting.jpg` in `public/`.  
  - If tenant has `logo_path`, load from e.g. `public/tenants/{tenantId}/logo.*` (or path from DB).  
  - Return base64 data URI; same as today for fallback.

- [ ] **2.4** **Address**  
  - Helper: `getTenantAddress(tenant)` or `formatTenantAddress(tenant)`.  
  - Build one string from `company_address`, `company_city`, `company_state`, `company_zip` (comma-separated).  
  - Return empty string if tenant null or all fields empty.

- [ ] **2.5** **Contact name**  
  - Helper: `getTenantContactName(tenant)`.  
  - Return `tenant.company_contact_name` or empty string.

- [ ] **2.6** **Rebar footer line**  
  - Helper: `getTenantRebarFooter(tenant)`.  
  - Returns: `{ companyName, peFirmRegLine, licenseHolderName, licenseHolderTitle, companyPhone, companyEmail }`.  
  - `peFirmRegLine` = `"Texas Board of Professional Engineers Firm Reg, " + (tenant.pe_firm_reg || '')`.

- [ ] **2.7** **Company name**  
  - Use `tenant.name` everywhere for `{{COMPANY_NAME}}`.

**Done when:** All PDF routes can call these helpers and get the right values; fallback when tenant or fields are missing keeps current MAK behaviour.

---

## Phase 3: pdf.js updates

**Owner:** Backend  
**Where:** `server/routes/pdf.js`

- [ ] **3.1** **WP1 report**  
  - Resolve tenant (from task/project).  
  - Load tenant; get logo via `getLogoBase64(tenantId)`, address, phone, company name from tenant (with fallbacks).  
  - Replace in HTML: `{{LOGO_IMAGE}}`, `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`.  
  - In Puppeteer `footerTemplate`, replace hardcoded "MAK Lonestar Consulting, LLC" with tenant company name (variable).

- [ ] **3.2** **Task Work Order (PDFKit)**  
  - Resolve tenant from task/project.  
  - Use tenant name, address, phone for header (with fallbacks).  
  - Remove hardcoded MAK name, "940 N Beltline...", "Irving, TX 75061", "Tel (214) 718-1250".

- [ ] **3.3** **Density report**  
  - Resolve tenant; get logo, company name, address, phone (with fallbacks).  
  - Replace in HTML: `{{LOGO_IMAGE}}`, `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`.

- [ ] **3.4** **Rebar report**  
  - Resolve tenant; get logo + `getTenantRebarFooter(tenant)`.  
  - Replace in HTML: `{{LOGO_IMAGE}}`, `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{COMPANY_EMAIL}}`, `{{PE_FIRM_REG_LINE}}`, `{{LICENSE_HOLDER_NAME}}`, `{{LICENSE_HOLDER_TITLE}}`, and body text "representative of {{COMPANY_NAME}}".

- [ ] **3.5** **Compressive strength report**  
  - Same as others: resolve tenant; replace `{{LOGO_IMAGE}}`, `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}` in HTML.

**Done when:** Every PDF generated from pdf.js uses tenant data when present and falls back to current MAK text when not.

---

## Phase 4: proctor.js updates

**Owner:** Backend  
**Where:** `server/routes/proctor.js`

- [ ] **4.1** Resolve tenant from task → project → `tenant_id` (same pattern as pdf.js).

- [ ] **4.2** Logo: use shared tenant logo helper (or same logic as pdf.js). Replace array of hardcoded `MAK logo_consulting.jpg` paths with tenant-based path + fallback to current MAK path.

- [ ] **4.3** Inline HTML: replace hardcoded address and phone with tenant address and phone (from tenant or fallback).

- [ ] **4.4** Default `sampledBy`: when returning empty/default report data, set `sampledBy` to `tenant.name` (or fallback to current "MAK Lonestar Consulting, LLC").

**Done when:** Proctor PDF and default report payload use tenant logo, address, phone, and company name.

---

## Phase 5: HTML templates (placeholders)

**Owner:** Backend / templates  
**Where:** `server/templates/*.html`

- [ ] **5.1** **wp1-report.html**  
  - Replace company block with: `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`.  
  - Keep `{{LOGO_IMAGE}}`.

- [ ] **5.2** **density-report.html**  
  - Same: `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{LOGO_IMAGE}}`.

- [ ] **5.3** **rebar-report.html**  
  - Header: `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`.  
  - Body: "a representative of {{COMPANY_NAME}} observed...".  
  - Signature block: `{{COMPANY_NAME}}`, `{{PE_FIRM_REG_LINE}}`, `{{LICENSE_HOLDER_NAME}}`, `{{LICENSE_HOLDER_TITLE}}`, and line "T {{COMPANY_PHONE}} | E {{COMPANY_EMAIL}}".  
  - Footer: `{{COMPANY_NAME}}`.  
  - Keep `{{LOGO_IMAGE}}`.

- [ ] **5.4** **compressive-strength-report.html**  
  - Header and footer: `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}`, `{{LOGO_IMAGE}}`.

**Done when:** No hardcoded MAK/address/phone/email in templates; all come from placeholders filled by pdf.js.

---

## Phase 6: Tenant API (company info)

**Owner:** Backend  
**Where:** New route file or existing `server/routes/settings.js` / `server/routes/tenants.js`

- [ ] **6.1** **GET /api/tenants/me**  
  - Auth required.  
  - Get `tenant_id` from `req.user.tenantId` (or user row).  
  - Return tenant row (name, address, city, state, zip, phone, email, website, company_contact_name, pe_firm_reg, license_holder_name, license_holder_title, logo_path or logo URL).  
  - Exclude sensitive fields if any.  
  - 404 if no tenant.

- [ ] **6.2** **PUT /api/tenants/me** (or PATCH)  
  - Auth + require admin (only admins edit company info).  
  - Body: company_address, company_city, company_state, company_zip, company_phone, company_email, company_contact_name, pe_firm_reg, license_holder_name, license_holder_title (all optional).  
  - Update `tenants` for current user’s `tenant_id` only.  
  - Return updated tenant (or 204).

- [ ] **6.3** **POST /api/tenants/logo** (optional for Phase 7)  
  - Auth + require admin.  
  - Multipart file upload; save to `public/tenants/{tenantId}/logo.{ext}`; set `tenants.logo_path`.  
  - Return logo URL or path.

- [ ] **6.4** Register routes in `server/index.js` (e.g. `/api/tenants`, tenantsRouter).

**Done when:** Frontend can load and save company info (and optionally logo) via API.

---

## Phase 7: Settings UI (company info + optional logo)

**Owner:** Frontend  
**Where:** `client/src/components/admin/Settings.tsx` (or new section)

- [ ] **7.1** New section: **Company information** (admin only).  
  - Fields: Company name (display or edit), Address (line, city, state, zip), Phone, Email, Contact name (company_contact_name).  
  - Optional: P.E. firm reg, License holder name, License holder title (for Rebar).  
  - Load from GET /api/tenants/me on mount.  
  - Save via PUT /api/tenants/me on submit.

- [ ] **7.2** Optional: **Logo upload**  
  - Button + file input; upload to POST /api/tenants/logo.  
  - Show current logo if `logo_path` or URL returned from API.

- [ ] **7.3** Validation and error/success messages.  
  - Don’t remove existing Settings (e.g. workflow path).

**Done when:** Admins can view and edit their company’s info (and logo if implemented) from the app.

---

## Summary checklist

| Phase | Description | Done |
|-------|-------------|------|
| 1 | Migrations (company_contact_name; Rebar fields) | [ ] |
| 2 | Tenant helpers (tenant resolution, logo, address, contact, Rebar footer) | [ ] |
| 3 | pdf.js (WP1, Task WO, Density, Rebar, Compressive) | [ ] |
| 4 | proctor.js (tenant, logo, address, sampledBy) | [ ] |
| 5 | HTML templates (placeholders only) | [ ] |
| 6 | API GET/PUT /api/tenants/me (+ optional logo upload) | [ ] |
| 7 | Settings UI (company info + optional logo) | [ ] |

---

## Backward compatibility (reminder)

- If `tenant_id` is null or tenant row missing: use current MAK logo path and current hardcoded name/address/phone.  
- If tenant exists but `logo_path` or address/phone are null: same fallback.  
- New columns are nullable; no breaking changes for existing tenants.

---

## Testing (short)

- After Phase 3–5: Generate each PDF type as MAK (tenant 1); should look the same as today.  
- Set tenant 2’s company info (via SQL or later via Settings); generate PDF as tenant 2 user; PDF should show tenant 2’s branding.  
- After Phase 6–7: Edit company info in Settings; generate PDF again; PDF should show updated info.
