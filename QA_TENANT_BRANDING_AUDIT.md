# QA: Tenant Branding Audit (MAK vs Tenant Logo/Name)

**Date:** 2026-02-17  
**Scope:** Ensure no hardcoded MAK logo or company name is shown for other tenants (e.g. WAAPIS). Browser tab and all user-facing flows should show CrestField as app name and tenant-specific branding where applicable.

---

## 1. Browser tab & app identity

| Location | Before | After | Status |
|----------|--------|--------|--------|
| `client/public/index.html` | `<title>MAK Lone Star Consulting - Field Report Automation</title>` | `<title>CrestField - Field Report Automation</title>` | ✅ Fixed |
| Meta description, keywords, author, og:title, twitter:title | MAK Lone Star Consulting | CrestField | ✅ Fixed |

**Verification:** Open app in browser; tab should show **"CrestField - Field Report Automation"**.

---

## 2. Dashboard & main navigation

| Component | What | Source | Status |
|-----------|------|--------|--------|
| `Dashboard.tsx` | Header logo + company name | `tenantsAPI.getMe()` → `tenant.logoPath`, `tenant.name` | ✅ Tenant-aware |
| Fallback when no tenant/logo | MAK logo, "MAK Lone Star Consulting" | Constants `DEFAULT_LOGO`, `DEFAULT_COMPANY_NAME` | ✅ Fallback only |

---

## 3. Create New Project

| Component | What | Source | Status |
|-----------|------|--------|--------|
| `admin/CreateProject.tsx` | Header logo + company name | `tenantsAPI.getMe()` → `tenant.logoPath`, `tenant.name` | ✅ Fixed |
| Fallback | MAK logo, "MAK Lone Star Consulting" | Same constants | ✅ Fallback only |

**Verification:** As WAAPIS admin, go to Create New Project; header should show WAAPIS logo and "WAAPIS".

---

## 4. Proctor workflow (form + summary)

| Component | What | Source | Status |
|-----------|------|--------|--------|
| `ProctorForm.tsx` | Default "Sampled By" when saving (draft + next) | `tenant?.name \|\| tenant?.companyContactName \|\| DEFAULT_SAMPLED_BY` | ✅ Tenant-aware |
| `ProctorSummary.tsx` | Header logo | `tenant?.logoPath` from `tenantsAPI.getMe()` | ✅ Fixed |
| `ProctorSummary.tsx` | Header address block | `formatTenantAddress(tenant)` (companyAddress, city, state, zip, phone) | ✅ Fixed |
| `ProctorSummary.tsx` | Default "Sampled By" when loading (DB or localStorage) | `sampledByDefault` from tenant in loadData | ✅ Fixed |
| Fallback address | 940 N Beltline Road, Irving, TX (MAK) | Shown only when tenant has no address | ✅ Fallback only |

---

## 5. Rebar workflow

| Component | What | Source | Status |
|-----------|------|--------|--------|
| `RebarForm.tsx` | "a representative of [Company] observed..." | `tenant?.name \|\| DEFAULT_COMPANY_NAME` | ✅ Fixed |

---

## 6. Settings

| Component | What | Source | Status |
|-----------|------|--------|--------|
| `admin/Settings.tsx` | Company name placeholder | "e.g. MAK Lone Star Consulting" (example only) | ✅ OK |
| Logo preview | Uses `company.logoPath` from GET /api/tenants/me | Tenant data | ✅ Tenant-aware |

---

## 7. Other screens (no logo/company in header)

| Component | Header content | Status |
|-----------|----------------|--------|
| `TasksDashboard.tsx` | "Tasks Dashboard" (no logo) | ✅ No change needed |
| `TechnicianDashboard.tsx` | "My Tasks" (no logo) | ✅ No change needed |
| `Login.tsx` | Crestfield logo (app branding) | ✅ OK |
| `ForgotPassword.tsx` / `ResetPassword.tsx` | Crestfield logo | ✅ OK |

---

## 8. Backend / PDFs

PDF generation and report templates use tenant resolution and tenant logo/address on the server (see `server/utils/tenantPdfHelpers.js`, `server/routes/pdf.js`, `server/routes/proctor.js`, `server/routes/rebar.js`). Those are separate from this client-side audit.

---

## 9. QA checklist (manual)

- [ ] **Browser tab:** Title is "CrestField - Field Report Automation" (not MAK).
- [ ] **Login as WAAPIS:** Dashboard header shows WAAPIS logo and "WAAPIS".
- [ ] **Create New Project (WAAPIS):** Header shows WAAPIS logo and "WAAPIS".
- [ ] **Proctor – open task → Summary:** Header shows WAAPIS logo and WAAPIS address; "Sampled By" defaults to WAAPIS (or contact name if set).
- [ ] **Proctor – save draft / Next:** Saved "Sampled By" is WAAPIS (or tenant contact name).
- [ ] **Rebar – open task:** Paragraph says "a representative of WAAPIS observed...".
- [ ] **Login as MAK (or tenant with no logo):** Dashboard and Create Project show MAK logo and "MAK Lone Star Consulting" (fallback).

---

## 10. Summary

| Area | Status |
|------|--------|
| Browser tab / meta | CrestField |
| Dashboard header | Tenant logo + name |
| Create Project header | Tenant logo + name |
| Proctor Summary header | Tenant logo + address; sampledBy from tenant |
| Proctor Form save | sampledBy from tenant |
| Rebar Form text | Company name from tenant |
| Fallbacks | MAK only when tenant has no logo/name |

All listed client flows are now tenant-aware with CrestField as the app name in the tab.
