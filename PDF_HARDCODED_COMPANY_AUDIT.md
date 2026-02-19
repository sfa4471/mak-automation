# PDF Audit: Hardcoded Company Name, Logo, Address, Phone, Email

**Purpose:** List every place where company-specific content (MAK / Lone Star) is hardcoded so it can be made tenant-driven.

---

## Summary

| PDF / Output | Logo | Company name | Address | Phone | Email | Other |
|--------------|------|--------------|---------|-------|-------|--------|
| **WP1 (Compressive)** | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | — | Footer (Puppeteer) |
| **Task Work Order (PDFKit)** | — | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | — | — |
| **Density** | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | — | — |
| **Rebar** | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | PE reg, license holder (see REBAR spec) |
| **Compressive strength** | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | — | Footer |
| **Proctor** | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | ✅ hardcoded | — | `sampledBy` in API |

---

## 1. Logo (all PDFs)

**Current:** Single file path and one `getLogoBase64()` with no tenant.

| Location | What's hardcoded |
|----------|-------------------|
| `server/routes/pdf.js` | `LOGO_CONFIG.path` = `'MAK logo_consulting.jpg'` in `public/`. `getLogoBase64()` uses it for WP1, Density, Rebar. Alt text: "MAK Lone Star Consulting Logo"; placeholder: "MAK". |
| `server/routes/proctor.js` | Array of paths: `../public/MAK logo_consulting.jpg`, etc. Inline HTML uses logo base64; alt "MAK Logo", fallback "MAK Logo". |

**Change:** Resolve `tenantId`, load logo from `tenants.logo_path` (e.g. `public/tenants/{id}/logo.*`), pass tenant to logo helper in all routes. Proctor route must get tenant from task/project and use same tenant logo helper.

---

## 2. WP1 Report (Compressive Strength Field Report)

**Template:** `server/templates/wp1-report.html`  
**Route:** `server/routes/pdf.js` — GET `/wp1/:id` (Puppeteer + HTML).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `wp1-report.html` ~340–342 | Company info block: "MAK Lonestar Consulting, LLC", "940 N Beltline Road, Suite 107, Irving, TX 75061", "Tel (214) 718-1250" | `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}` |
| `wp1-report.html` | `{{LOGO_IMAGE}}` | Already placeholder; fill from tenant logo. |
| `pdf.js` ~549–553 | Puppeteer `footerTemplate`: "MAK Lonestar Consulting, LLC" (bottom right) | Use tenant company name (variable injected into footerTemplate string). |

---

## 3. Task Work Order / Job Ticket (PDFKit)

**Route:** `server/routes/pdf.js` — GET `/task/:taskId` (PDFKit, no HTML template).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `pdf.js` ~721–725 | `doc.text('MAK Lonestar Consulting, LLC', ...)`; "940 N Beltline Road, Suite 107"; "Irving, TX 75061"; "Tel (214) 718-1250" | Get tenant by task/project; `doc.text(tenantName, ...)`, address line(s), phone from tenant. |

**Note:** This path does not use HTML; tenant data must be passed into the PDFKit code (e.g. tenant object or name/address/phone vars).

---

## 4. Density Report

**Template:** `server/templates/density-report.html`  
**Route:** `server/routes/pdf.js` — GET `/density/:taskId` (Puppeteer + HTML).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `density-report.html` ~267–269 | "MAK Lonestar Consulting, LLC", "940 N Beltline Road, Suite 107, Irving, TX 75061", "Tel 214-718-1250" | `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}` |
| `density-report.html` | `{{LOGO_IMAGE}}` | Already placeholder; fill from tenant. |
| `pdf.js` ~945–949 | `getLogoBase64()`, alt "MAK Lone Star Consulting Logo", placeholder "MAK" | Tenant logo; generic alt/placeholder. |

No separate footer in template; header is the only company block.

---

## 5. Rebar Report

**Template:** `server/templates/rebar-report.html`  
**Route:** `server/routes/pdf.js` — GET `/rebar/:taskId` (Puppeteer + HTML).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `rebar-report.html` ~192–195 | Header: "MAK LONESTAR CONSULTING", "940 N Beltline Road, Suite 107,", "Irving, TX 75061", "P: 214-718-1250" | `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}` |
| `rebar-report.html` ~250 | Body: "a representative of MAK Lonestar Consulting observed..." | "a representative of {{COMPANY_NAME}} observed..." |
| `rebar-report.html` ~276–281 | Signature block: "MAK LONESTAR CONSULTING, INC.", "Texas Board of Professional Engineers Firm Reg, F-24443", "Muhammad Awais Khan, P.E.", "Geotechnical Engineer", "T +1 214 718 1250 \| E maklonestarservices@gmail.com" | `{{COMPANY_NAME}}`, `{{PE_FIRM_REG_LINE}}`, `{{LICENSE_HOLDER_NAME}}`, `{{LICENSE_HOLDER_TITLE}}`, `{{COMPANY_PHONE}}`, `{{COMPANY_EMAIL}}` (see REBAR_PDF_TENANT_FOOTER_SPEC.md) |
| `rebar-report.html` ~286 | Footer: "MAK LONESTAR CONSULTING, INC." | `{{COMPANY_NAME}}` |
| `rebar-report.html` | `{{LOGO_IMAGE}}` | Already placeholder; fill from tenant. |
| `pdf.js` ~1324–1328 | Same logo/alt/placeholder as others | Tenant logo. |

---

## 6. Compressive Strength Report (lab-style)

**Template:** `server/templates/compressive-strength-report.html`  
**Route:** `server/routes/pdf.js` — GET `/compressive-strength/:taskId` or similar (Puppeteer + HTML).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `compressive-strength-report.html` ~247–249 | Header: "MAK Lonestar Consulting, LLC", "940 N Beltline Road, Suite 107, Irving, TX 75061", "Tel (214) 718-1250" | `{{COMPANY_NAME}}`, `{{COMPANY_ADDRESS}}`, `{{COMPANY_PHONE}}` |
| `compressive-strength-report.html` ~444 | Footer: "MAK Lonestar Consulting, LLC" | `{{COMPANY_NAME}}` |
| `compressive-strength-report.html` | `{{LOGO_IMAGE}}` | Already placeholder; fill from tenant. |

---

## 7. Proctor Report

**Route:** `server/routes/proctor.js` — POST `/:taskId/pdf`. HTML is built inline in JS (no separate template file).

| Location | Hardcoded value | Replace with |
|----------|-----------------|-------------|
| `proctor.js` ~403–407 | Logo paths: `../public/MAK logo_consulting.jpg`, etc. | Resolve tenant from task/project; use tenant logo path (shared helper). |
| `proctor.js` ~424 | Console: "MAK logo not found..." | Generic message. |
| `proctor.js` ~547 | Inline HTML: logo img alt "MAK Logo", fallback "MAK Logo" | Tenant logo; generic alt. |
| `proctor.js` ~550–552 | Inline HTML: "940 N Beltline Road, Suite 107,", "Irving, TX 75061", "P: 214-718-1250" | Tenant address and phone (vars from tenant). |
| `proctor.js` ~882 | Default `sampledBy: 'MAK Lonestar Consulting, LLC'` in API response (empty report) | Tenant name (e.g. `tenant.name`) for current user's tenant. |

**Note:** Proctor has no `tenants` in the route today; add tenant resolution (from task → project → tenant_id) and a shared helper for tenant logo + address/phone/name so Proctor PDF and default `sampledBy` are tenant-driven.

---

## 8. pdf.js — shared logo/alt/placeholder

These appear in multiple PDF routes (WP1, Density, Rebar; Compressive uses same pattern):

| Line (approx) | Code | Fix |
|----------------|------|-----|
| 27–31 | `LOGO_CONFIG = { path: '...MAK logo_consulting.jpg' }` | Remove global; resolve per request from tenant. |
| 35–46 | `getLogoBase64()` no args | `getLogoBase64(tenantId)` and path from `tenants.logo_path` or fallback. |
| 288–289, 947–948, 1326–1327 | `alt="MAK Lone Star Consulting Logo"`, `'MAK'` placeholder | Use tenant name or generic "Company logo". |

---

## 9. Standard placeholders to use everywhere

Use the same names so one tenant-data pass can fill all templates:

| Placeholder | Source (tenants table) |
|-------------|------------------------|
| `{{COMPANY_NAME}}` | `tenants.name` |
| `{{COMPANY_ADDRESS}}` | Formatted from `company_address`, `company_city`, `company_state`, `company_zip` |
| `{{COMPANY_PHONE}}` | `tenants.company_phone` |
| `{{COMPANY_EMAIL}}` | `tenants.company_email` |
| `{{LOGO_IMAGE}}` | Tenant logo (from `tenants.logo_path` or default). |
| **Rebar only** | `{{PE_FIRM_REG_LINE}}`, `{{LICENSE_HOLDER_NAME}}`, `{{LICENSE_HOLDER_TITLE}}` (see REBAR_PDF_TENANT_FOOTER_SPEC.md) |

---

## 10. Implementation order (suggested)

1. **Tenant helpers in pdf.js (and shared for proctor):**  
   `getTenantForRequest(req, taskOrProject)`, `getLogoBase64(tenantId)`, `getTenantAddress(tenantId)`, `getTenantContactName(tenantId)`, and for Rebar: `getTenantRebarFooter(tenant)` (PE line, license holder name/title, phone, email).
2. **Templates:** Replace every hardcoded company name, address, phone, email (and Rebar-specific lines) with the placeholders above.
3. **pdf.js routes:** For each PDF (WP1, Task Work Order, Density, Rebar, Compressive): resolve tenant, load tenant data, replace `getLogoBase64()` with `getLogoBase64(tenantId)`, inject company name/address/phone/email (and Rebar fields) into HTML or PDFKit. For WP1, inject company name into `footerTemplate`.
4. **proctor.js:** Resolve tenant from task/project; use shared tenant logo + address/phone/name for inline HTML and set default `sampledBy` to tenant name.
5. **Regression:** Generate each PDF type as MAK (tenant 1) and as second tenant; confirm no MAK strings appear for tenant 2 and all placeholders resolve.

---

## File checklist

| File | Action |
|------|--------|
| `server/routes/pdf.js` | Logo config + getLogoBase64(tenantId); tenant resolution; inject company name/address/phone (and Rebar fields) in all PDF routes; footerTemplate WP1; PDFKit task work order header. |
| `server/routes/proctor.js` | Tenant resolution; tenant logo paths; inline HTML address/phone; default sampledBy from tenant. |
| `server/templates/wp1-report.html` | Company block → placeholders. |
| `server/templates/density-report.html` | Company block → placeholders. |
| `server/templates/rebar-report.html` | Header, body, signature block, footer → placeholders (see REBAR spec). |
| `server/templates/compressive-strength-report.html` | Header and footer → placeholders. |

No other PDFs or templates contain company-specific strings; `database.js` and `init-database.js` use `admin@maklonestar.com` only as default admin email for seeding, not in PDFs.
