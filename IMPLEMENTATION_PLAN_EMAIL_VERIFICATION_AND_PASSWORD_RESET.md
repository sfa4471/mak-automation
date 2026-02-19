# Implementation Plan: Email Verification, Admin Invite, and Password Reset

**Document type:** Planning / Architecture  
**Audience:** Development team, product owner  
**Perspective:** Senior software architect (20+ years); security-first, production-ready design.

---

## Scope: Branch database only

**All implementation for this plan is for the branch (multi-tenant) setup only.**

- New migrations (e.g. `password_reset_tokens`, `admin_invites`) are applied to the **branch** Supabase project (the one used when `.env.local` is present).
- **Main database is not touched.** No schema changes, no new tables, and no new auth/email features are added to the main DB or main-only code paths.
- When running against the main DB (no `.env.local`), the app continues to work as today: no forgot-password, no invite flow, no email sending. These features are only active when using the branch database.

---

## 1. Executive Summary

You want to:

1. **Admin onboarding:** Client gives you an email (e.g. `fadynamicss@gmail.com`) to be the admin of a company (e.g. Company XYZ). You create that admin without sharing a password over the phone; they receive an email to set their own password (and optionally verify their email).
2. **Forgot password:** Both admins and technicians can request a password reset; a secure link is sent to their email.
3. **Technician workflow:** Keep current behavior (admin sets email/password when creating a technician). Add the ability for technicians to change password (already exists) and to use “Forgot password”; optionally notify by email when their password is changed.

This plan describes how to implement these flows in your existing stack (Node/Express, custom JWT + bcrypt, Supabase as DB only, React client) without introducing Supabase Auth, and with a clear path for email delivery.

---

## 2. Current State (As-Is)

| Area | Current behavior |
|------|------------------|
| **Auth** | Custom: JWT + bcrypt; users in `users` table (email, password hash, role, tenant_id). No Supabase Auth. |
| **Admin creation** | Scripts only: `create-admin-user.js` or `create-tenant.js` with email + password as arguments. No invite, no email. |
| **Technician creation** | Admin POSTs to `POST /auth/technicians` with email, password, name. Password is set by admin; no email. |
| **Change password** | Technicians: `PUT /auth/me/password` (current + new password). No “change password” for admins in API (can add). No email notification. |
| **Forgot password** | Not implemented. No endpoint, no UI, no email. |
| **Email** | No email sending in the codebase (no nodemailer, SendGrid, Resend, etc.). |

---

## 3. Target Flows (To-Be)

### 3.1 Admin onboarding (invite + set password)

- **Trigger:** You (or a super-admin) create a new company (tenant) and specify: “Admin for Company XYZ is `fadynamicss@gmail.com`.”
- **Flow:**
  1. System creates tenant (if not exists) and a **pending** admin user record (email, tenant_id, role=ADMIN, no password or a placeholder, e.g. `email_verified: false` or status `invited`).
  2. System generates a **one-time invite token** (cryptographically random, e.g. 32 bytes hex), stores it with expiry (e.g. 7 days) and the user/tenant id.
  3. System sends an **email** to that address with a link:  
     `https://yourapp.com/set-password?token=<invite_token>`  
     (or `/invite/accept?token=...`). Link is one-time use and time-limited.
  4. User clicks link → lands on **Set password** page; enters new password (and confirm). No “current password” (they don’t have one yet).
  5. Backend validates token, sets password on the user, marks user as active/verified, invalidates token.
  6. User can log in with email + new password. If same email exists in multiple tenants, existing tenant picker still applies.

**Optional:** Add “email verification” in the same step: the set-password link can double as “verify this email.” No separate verification email required unless you want a “verify first, set password later” flow.

**You do not need to “give them the password.”** The password is only chosen by the user when they open the link. This is more secure and avoids sending passwords in email or over the phone.

### 3.2 Forgot password (admins and technicians)

- **Trigger:** On the login page, user clicks “Forgot password?” and enters their email.
- **Flow:**
  1. User submits email (and optionally tenant id if you already know it from a previous “multiple tenants” choice).
  2. Backend finds user(s) by email (and tenant if provided). If none: return a **generic** message (“If an account exists for this email, you will receive a reset link”) to avoid email enumeration.
  3. If user exists: generate a **reset token** (random, single-use), store with `user_id` and `expires_at` (e.g. 1 hour).
  4. Send email with link:  
     `https://yourapp.com/reset-password?token=<reset_token>`
  5. User clicks link → **Reset password** page: enter new password + confirm. Submit with token in body or URL.
  6. Backend validates token, updates password, deletes/expires token.
  7. User can log in with new password.

Same flow for both ADMIN and TECHNICIAN; no role-specific logic required beyond “find user by email (and tenant).”

### 3.3 Technician: keep current create flow; add forgot + optional “password changed” email

- **Create technician:** Keep as today: admin sets email + password in the UI; no change required. Optionally, in a later phase, you could add “invite technician” (email only, they set password via link) similar to admin invite.
- **Change password:** Already implemented for technicians (`PUT /auth/me/password`). Consider:
  - Allowing **admins** to change their own password via the same contract (reuse or add `PUT /auth/me/password` for ADMIN).
  - Optionally sending a **notification email** when password is changed (“Your password was changed. If this wasn’t you, contact admin.”). Nice for security; not mandatory for v1.
- **Forgot password:** Use the same forgot-password flow as above; technicians (and admins) both use “Forgot password?” on the login page.

---

## 4. Technical Design

### 4.1 Data model

Add two tables (or one with a type column). Prefer **two** for clarity and different expiry/use semantics.

**Option A – Two tables (recommended)**

- **`password_reset_tokens`**
  - `id` (PK)
  - `user_id` (FK → users)
  - `token_hash` (store hashed token, not plaintext; e.g. SHA-256 of token)
  - `expires_at` (timestamp)
  - `used_at` (nullable; set when consumed)

- **`admin_invites`** (or `invite_tokens`)
  - `id` (PK)
  - `email`
  - `tenant_id` (FK → tenants)
  - `token_hash`
  - `expires_at`
  - `used_at` (nullable)
  - Optional: `user_id` (set after user row is created and linked)

**Option B – Single table with kind**

- **`auth_tokens`**
  - `id`, `kind` ('password_reset' | 'admin_invite'), `email` (nullable), `user_id` (nullable), `tenant_id` (nullable), `token_hash`, `expires_at`, `used_at`

Use **token_hash** (not raw token) in the DB. Send the raw token only in the email and in the one-time request; never log it.

### 4.2 Token lifecycle

- **Generation:** e.g. `crypto.randomBytes(32).toString('hex')`. Hash with SHA-256 before storing.
- **Validation:** Look up by hash of the token provided; check `expires_at` and `used_at`.
- **One-time use:** Set `used_at = now()` when the token is used; reject if already used.
- **Expiry:** Invite 7 days; reset 1 hour (configurable via env).

### 4.3 Email delivery

This plan uses **SendGrid**. For what you need to provide (API key, sender email, verification), see **SENDGRID_SETUP_WHAT_YOU_NEED.md**. Add a small **email service module** in the server (e.g. `server/services/email.js`) that exposes:

- `sendInviteEmail(to, setPasswordLink, companyName)`
- `sendPasswordResetEmail(to, resetLink)`
- Optionally: `sendPasswordChangedNotification(to)`

Templates should be HTML + plaintext; include app name, link, and expiry note. **Never** put the raw token in the link query string in logs; log only “email sent to …” or “reset link sent.”

### 4.4 Backend API (new/updated)

| Method | Path | Who | Purpose |
|--------|------|-----|--------|
| POST | `/auth/forgot-password` | Anonymous | Body: `{ email, tenantId? }`. Find user(s), create reset token, send email. Always return same generic message. |
| POST | `/auth/reset-password` | Anonymous | Body: `{ token, newPassword }`. Validate token, set password, invalidate token. |
| GET  | `/auth/invite/validate?token=...` | Anonymous | Optional: validate invite token and return email/tenant name for UX (e.g. “Set password for Company XYZ”). |
| POST | `/auth/invite/accept` | Anonymous | Body: `{ token, newPassword }`. Validate invite token, create or update user (set password, set active), invalidate token. |
| POST | `/auth/invite-admin` | Super-admin or you (script) | Body: `{ email, tenantId }`. Create pending admin + invite token, send email. (Or keep this as script-only that calls the same service.) |
| PUT  | `/auth/me/password` | Authenticated (ADMIN or TECHNICIAN) | Already exists for TECHNICIAN; **extend** to allow ADMIN so admins can change their own password without “forgot.” |

**Security:**

- Rate-limit `forgot-password` and `invite/accept` and `reset-password` by IP and/or email (e.g. max 5 per 15 minutes per email).
- Use constant-time comparison when validating tokens (or compare hashes).
- Passwords: keep current policy (e.g. min 6 chars); consider strengthening to 8+ and complexity in a later iteration.

### 4.5 Frontend

| Page / Element | Purpose |
|----------------|---------|
| **Login** | Add “Forgot password?” link → navigates to `/forgot-password`. |
| **Forgot password** | Form: email (+ tenant selector if multiple tenants). Submit → call `POST /auth/forgot-password`. Show generic success message. |
| **Reset password** | Route: `/reset-password?token=...`. Form: new password, confirm. Submit token + password to `POST /auth/reset-password`. Redirect to login with success message. |
| **Set password (invite)** | Route: `/set-password?token=...` (or `/invite/accept?token=...`). Optional GET to validate token and show “Set password for Company XYZ”. Form: new password, confirm. Submit to `POST /auth/invite/accept`. Redirect to login. |
| **Change password (in-app)** | Already exists for technicians. Add same or similar screen for admins (e.g. under Settings or profile), calling same `PUT /auth/me/password`. |

Client must **not** send token in Referer or log it; use POST body for token on submit.

### 4.6 Admin invite: how you “create” the admin

Today you run:

- `node scripts/create-tenant.js "Company XYZ" admin@company.com admin123`

To move to “they set their own password”:

- **Option 1 – Script:**  
  `node scripts/invite-admin.js "Company XYZ" fadynamicss@gmail.com`  
  Script: ensure tenant exists, create pending admin row + invite token, call email service, print “Invite sent to fadynamicss@gmail.com”.

- **Option 2 – Super-admin UI:**  
  A protected “Invite company admin” form (tenant dropdown + email). Only for a super-admin or internal use. Calls `POST /auth/invite-admin`.

You do **not** need to tell the client a password; you only need to provide the admin email and company (tenant). The link in the email is the “password delivery” mechanism (they choose the password when they open it).

---

## 5. Implementation Phases

### Phase 1 – Foundation (no user-facing change yet)

1. Add **email service** (e.g. Resend or Nodemailer), env vars (e.g. `RESEND_API_KEY` or `SMTP_*`), and `server/services/email.js` with:
   - `sendPasswordResetEmail(to, resetLink)`
   - `sendInviteEmail(to, setPasswordLink, companyName)`
2. Add **migrations** for `password_reset_tokens` and `admin_invites` (or single `auth_tokens` table).
3. Add **token helpers**: generate, hash, store, validate, invalidate (one-time use + expiry).

### Phase 2 – Forgot password + Reset password

1. **Backend:** `POST /auth/forgot-password`, `POST /auth/reset-password`, rate limiting.
2. **Client:** “Forgot password?” on login → ForgotPassword page → ResetPassword page (token in URL).
3. Test with admin and technician accounts; ensure multi-tenant (same email, different tenants) is handled (e.g. require tenant in forgot if multiple).

### Phase 3 – Admin invite (set password via link)

1. **Backend:** `GET /auth/invite/validate`, `POST /auth/invite/accept`, and either `POST /auth/invite-admin` or script-only `invite-admin.js` that reuses the same token + email logic.
2. **Client:** Set-password page for invite link; optional “validate token” call to show company name.
3. **Script:** `invite-admin.js "Company XYZ" admin@example.com` (no password arg); sends invite email.
4. Update **onboarding docs** so you tell the client: “Send us the admin email for Company XYZ; we’ll send them a link to set their password.”

### Phase 4 – Polish

1. Allow **admins** to change their own password in-app (`PUT /auth/me/password` for ADMIN; add route/UI if restricted to TECHNICIAN today).
2. Optional: “Password changed” notification email for technicians (and admins) when they change password.
3. Optional: rate limiting and audit log for sensitive auth actions.

---

## 6. Answers to Your Exact Questions

- **“Do I need to tell you this would be the admin of Company XYZ and you give me the password?”**  
  No. You tell the system: “Company XYZ’s admin is `fadynamicss@gmail.com`.” The system sends that person an email with a link. They open the link and **set their own password**. You never see or send the password.

- **“Later they can click Forgot password and the link will be sent to their email?”**  
  Yes. Once forgot-password and reset-password are implemented, anyone (admin or technician) can use “Forgot password?” on the login page; the reset link is sent to the email on file.

- **“Technician: admin sets email and password; later they can change password or forgot password; can the new password be sent to their email?”**  
  - **Change password:** They choose the new password in the app (current flow). You can optionally send an email saying “Your password was changed” (notification only; no need to send the actual new password in email—and you **should not** send passwords in email).
  - **Forgot password:** They request a reset; the **link** to set a new password is sent to their email. They set the new password on the reset page. So “the new password” is not sent by email; the **link** is. That’s the correct and secure approach.

---

## 7. Summary Table

| Feature | How it works | You need to build |
|--------|----------------|-------------------|
| Admin for Company XYZ | You specify email only; system sends “set password” link | Invite token table, email service, set-password page, script or API to create invite |
| Forgot password | User enters email → gets reset link → sets new password on your site | Reset token table, email service, forgot + reset pages, 2 API endpoints |
| Technician create | Unchanged: admin sets email + password | Nothing |
| Technician change password | Already there | Nothing (optionally allow admin same flow) |
| Technician forgot password | Same as admin: forgot → link → set new password | Same as “Forgot password” above |

This plan is implementable with your current stack, keeps security best practices (no passwords in email, one-time tokens, hashed tokens in DB, rate limiting), and gives you the “give us the admin email for Company XYZ and we’ll send them a link to set their password” workflow you described.
