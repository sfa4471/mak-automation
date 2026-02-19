# Rebar Report PDF — Dynamic Footer (Per-Tenant / Client Onboarding)

**Goal:** Make the bottom-right signature block (and header/footer) on the Rebar PDF dynamic per company, using data collected during **client/tenant onboarding**.

---

## 1. Current (hardcoded) vs desired (dynamic)

### Current Rebar PDF — bottom right (signature block)

| Line | Current hardcoded value |
|------|-------------------------|
| 1 | MAK LONESTAR CONSULTING, INC. |
| 2 | Texas Board of Professional Engineers Firm Reg, F-24443 |
| 3 | *(signature line)* |
| 4 | Muhammad Awais Khan, P.E. |
| 5 | Geotechnical Engineer |
| 6 | T +1 214 718 1250 \| E maklonestarservices@gmail.com |

### Desired (dynamic from tenant)

| Line | Source (tenant onboarding) | Placeholder |
|------|----------------------------|-------------|
| 1 | **Company name** (legal / display name) | `{{COMPANY_NAME}}` |
| 2 | **P.E. firm registration** (e.g. “F-24443” — number provided at onboarding) | `{{PE_FIRM_REG_LINE}}` → e.g. “Texas Board of Professional Engineers Firm Reg, F-24443” |
| 3 | *(signature line — unchanged)* | — |
| 4 | **License holder name** (e.g. “Muhammad Awais Khan, P.E.”) | `{{LICENSE_HOLDER_NAME}}` |
| 5 | **License holder title** (e.g. “Geotechnical Engineer”) — optional | `{{LICENSE_HOLDER_TITLE}}` |
| 6 | **Company phone \| Company email** | `T {{COMPANY_PHONE}} \| E {{COMPANY_EMAIL}}` |

So: **company name**, **P.E. number**, **license holder name**, **license holder title**, **company phone**, and **company email** are all provided by you at client onboarding and drive the Rebar PDF footer (and can be reused in header/footer text).

---

## 2. What we already have vs what to add (tenant table)

Already on `tenants` (or planned):

- `name` → Company name  
- `company_phone`  
- `company_email`  
- `company_address`, `company_city`, `company_state`, `company_zip`  
- `logo_path`  
- `company_contact_name` (planned for “Prepared by” on other reports)

**New fields for Rebar (and similar professional reports):**

| Column (suggested) | Type | Purpose |
|--------------------|------|--------|
| `pe_firm_reg` | TEXT | P.E. firm registration number (e.g. F-24443). Template will show: “Texas Board of Professional Engineers Firm Reg, {{value}}”. |
| `license_holder_name` | TEXT | Name of the license holder (e.g. “Muhammad Awais Khan, P.E.”). |
| `license_holder_title` | TEXT | Title (e.g. “Geotechnical Engineer”). Optional; can be blank. |

Then:

- **Company name** → `tenants.name` (or a dedicated “legal name” field if you want “MAK LONESTAR CONSULTING, INC.” to differ from display name).
- **P.E. number** → `pe_firm_reg`.
- **License holder name** → `license_holder_name`.
- **License holder title** → `license_holder_title`.
- **T / E line** → `company_phone` and `company_email`.

So for the second tenant you **do** need to provide: company name, P.E. number, license holder name, (optionally) license holder title, company phone, company email — all as part of client onboarding; we just store them on `tenants` and use them in the Rebar template.

---

## 3. Rebar template placeholders (summary)

Use these in `rebar-report.html` and replace them in `pdf.js` from the tenant row.

| Placeholder | Source | Example |
|-------------|--------|--------|
| `{{COMPANY_NAME}}` | `tenants.name` | MAK LONESTAR CONSULTING, INC. |
| `{{PE_FIRM_REG_LINE}}` | Built from `tenants.pe_firm_reg` | Texas Board of Professional Engineers Firm Reg, F-24443 |
| `{{LICENSE_HOLDER_NAME}}` | `tenants.license_holder_name` | Muhammad Awais Khan, P.E. |
| `{{LICENSE_HOLDER_TITLE}}` | `tenants.license_holder_title` | Geotechnical Engineer |
| `{{COMPANY_PHONE}}` | `tenants.company_phone` | +1 214 718 1250 |
| `{{COMPANY_EMAIL}}` | `tenants.company_email` | maklonestarservices@gmail.com |

**Header (top left)** and **footer (bottom center)** should use the same company name (and optionally address/phone) so the whole page is consistent and tenant-specific.

---

## 4. Body text (“representative of …”)

Current:

```text
On the above-mentioned date, a representative of MAK Lonestar Consulting observed reinforcing steel placed at the following location:
```

Make it dynamic, e.g.:

```text
On the above-mentioned date, a representative of {{COMPANY_NAME}} observed reinforcing steel placed at the following location:
```

So the same **company name** you provide at onboarding is used in the body as well.

---

## 5. Client onboarding — checklist (what you provide per tenant)

For each company (including the second tenant), you provide:

| # | Field | Stored in | Used in Rebar PDF |
|---|------|-----------|--------------------|
| 1 | Company name | `tenants.name` | Header, signature block line 1, body text, footer |
| 2 | P.E. firm registration number | `tenants.pe_firm_reg` | “Texas Board of Professional Engineers Firm Reg, &lt;number&gt;” |
| 3 | License holder name | `tenants.license_holder_name` | Under signature line |
| 4 | License holder title | `tenants.license_holder_title` | Under license holder name (optional) |
| 5 | Company phone | `tenants.company_phone` | “T …” in T \| E line |
| 6 | Company email | `tenants.company_email` | “E …” in T \| E line |
| 7 | Address (street, city, state, zip) | `tenants.company_*` | Header (and other PDFs) |
| 8 | Logo | `tenants.logo_path` + file | Header logo |
| 9 | Project numbering (prefix, etc.) | `tenants.project_number_*` | Project numbers |

So yes: for the second tenant you provide **logo, project numbering, address, phone, email, company name, P.E. number, license holder name (and optionally title)** — all as part of client onboarding; the Rebar PDF will then be fully dynamic per client.

---

## 6. Implementation steps (short)

1. **Migration:** Add to `tenants`:  
   `pe_firm_reg TEXT`, `license_holder_name TEXT`, `license_holder_title TEXT`.
2. **Backend (pdf.js):** For Rebar route, load tenant by `tenantId` (from task/project). Build `PE_FIRM_REG_LINE` as `"Texas Board of Professional Engineers Firm Reg, " + (tenant.pe_firm_reg || '')`. Replace all Rebar placeholders: `COMPANY_NAME`, `PE_FIRM_REG_LINE`, `LICENSE_HOLDER_NAME`, `LICENSE_HOLDER_TITLE`, `COMPANY_PHONE`, `COMPANY_EMAIL`, and header/footer/body “MAK…” → `{{COMPANY_NAME}}`.
3. **Template:** In `rebar-report.html`, replace the hardcoded signature block (and header/footer and body sentence) with the placeholders above.
4. **Settings / onboarding UI:** Add fields for P.E. firm reg, license holder name, license holder title (and existing company phone, email, address) so you can set them per tenant. (Or set via SQL/script until UI exists.)

After this, the Rebar PDF footer (and header/body/footer) are fully driven by client onboarding data (company name, P.E. number, license holder name/title, company phone/email, address, logo, project numbering).
