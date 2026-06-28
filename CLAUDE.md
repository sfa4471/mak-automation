# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is
A multi-tenant geotechnical field reporting SaaS (Crestfield). Field technicians generate PDF reports (density, rebar, proctor, compressive strength) tied to projects and work packages. Clients are geotechnical firms.

## Deployment
- **Frontend**: Vercel (React CRA, /client) — env var `REACT_APP_API_URL` points at backend
- **Backend**: Render (Express, entry `server/index.js`) — build command `npm run build:render`
- **Database**: Supabase (PostgreSQL) — only production DB; apply migrations via Supabase dashboard
- **Legacy**: SQLite files exist (`mak_automation.db`) — do NOT use in any new code

## Commands

### Development
```bash
npm run dev          # both server (nodemon) + client (CRA) concurrently
npm run server       # backend only — http://localhost:5000
npm run client       # frontend only — http://localhost:3000
```

Client talks to `REACT_APP_API_URL` (set in `client/.env`; default `http://localhost:5000/api`).

### Install
```bash
npm run install-all  # root deps + client deps
```

### Build / Deploy
```bash
npm run build              # client production build only
npm run build:render       # full Render build: install-all + install-chrome + client build
node server/index.js       # start server (production)
```

### Database
```bash
npm run supabase:migrate              # run a single migration file
npm run supabase:execute-and-verify   # run migrations + verify tables
npm run dev:run-schema                # apply full schema to dev DB
npm run create-admin                  # seed an admin user
```
New schema changes **must** go in `/supabase/migrations/` with a `YYYYMMDDHHMMSS_` timestamp prefix and be applied via Supabase dashboard or the scripts above.

### Utilities
```bash
npm run pre-deploy-check   # validates env vars and DB connectivity before deploy
USE_BRANCH_DB=1 npm run server  # start backend against .env.local (dev Supabase project)
```

## Environment Variables

**Root `.env`** (backend, production Supabase):
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_TOKEN_ENCRYPTION_KEY
NODE_ENV=production (set by Render)
```

**Root `.env.local`** (dev Supabase project — see `.env.local.example`):
Set `USE_BRANCH_DB=1` to override `.env` values with `.env.local` at startup.

**`client/.env`**:
```
REACT_APP_API_URL=http://localhost:5000/api
```

## Architecture

### Backend (Express, `/server`)

Every API route requires `authenticate` + `requireTenant` middleware, then filters **all** Supabase queries by `eq('tenant_id', req.tenantId)`. RLS is also enabled on Supabase as a second layer. The `tenantId` lives in the JWT payload.

**Roles**: `ADMIN` (full access), `PM` (can approve/reject reports), `TECHNICIAN` (own assignments only). Helpers `isStaffReviewer(role)` and `requireAdminOrPm` in `auth.js` enforce PM+ADMIN gating.

**Route → DB client rule**: Use `server/db/supabase.js` (not `database.js`) for all new code. `database.js` is the legacy SQLite client.

**Report task types** and their routes:
- `DENSITY_MEASUREMENT` → `/api/density`
- `PROCTOR` → `/api/proctor`
- `REBAR` → `/api/rebar`
- `COMPRESSIVE_STRENGTH` / `CYLINDER_PICKUP` → `/api/wp1`

All generate PDFs via Puppeteer on task approval. Use `server/utils/puppeteerLaunch.js` — never call `puppeteer.launch()` directly; the utility handles Render's Chrome path, no-sandbox args, and path memoization.

PDF templates are plain HTML in `/server/templates/`. Edit directly — no build step.

### Task Lifecycle (State Machine)

```
ASSIGNED → IN_PROGRESS_TECH → READY_FOR_REVIEW → APPROVED (→ PDF sent)
                                               ↘ REJECTED_NEEDS_FIX (→ back to tech)
                                               ↘ COULD_NOT_ACCESS
```

Every status transition to APPROVED/UNAPPROVED/REJECTED is logged to `task_history` (`actionType`, `actorRole`, `actorName`, `timestamp`, `note`). Hard constraint: no report is ever auto-finalized — a PE (ADMIN or PM) must approve.

### Dispatch / Workorder Model

A **workorder** is a dispatch: one tech, one date, one site, many tasks linked via `workorder_id`. Clock in/out lives on the workorder (not the task). Key fields: `assigned_technician_id`, `scheduled_date`, `scheduled_time`, `site_location`, `clock_in`, `clock_out`, `break_minutes`, `miles`, `status` (`open|complete|approved|could_not_access`), `billing_status` (`unbilled|claimed|billed|pushed`).

When `assigned_technician_id` changes, `PUT /api/workorders/:id` immediately calls `queueAssignmentNotification` (inserts into `pending_notifications`). The **notification batch sender** (polls every 2 min, 3-min debounce per technician) then sends the dispatch email via SendGrid. Never write directly to `pending_notifications` — always call `queueAssignmentNotification` from `server/utils/notificationQueue.js`.

Background jobs can be disabled by env var (useful in dev/test):
- `ENABLE_AUTO_SEND_SCHEDULER=false` — skip nightly report auto-send (3 AM Chicago)
- `ENABLE_NOTIFICATION_BATCH_SENDER=false` — skip assignment email polling
- `ENABLE_INVOICE_READINESS_CHECKER=false` — skip invoice readiness alerts (polls every 30 min)

### Billing Engine (`server/services/billingEngine.js`)

Computes invoice line items from workorder clock data + task materials:
- **Labor**: regular + OT (8 hr/day threshold), with interval merging to prevent double-counting overlapping workorders for the same tech on the same day
- **Trip**: flat or per-mile, once per workorder
- **Materials**: vary by task type (cylinder count, proctor tests, density tests, etc.)

`POST /api/invoices/preview` returns computed lines without committing. `POST /api/invoices/generate` creates a draft and sets `billing_status = claimed` on the included workorders — this is not trivially reversible (requires `POST /api/invoices/:id/void`). Hard constraint: invoices are never auto-pushed to QuickBooks — human confirms.

### QuickBooks Integration

OAuth tokens stored encrypted in `tenant_qbo_connections` (AES-256-GCM, key = `QBO_TOKEN_ENCRYPTION_KEY`). The OAuth callback lands at `/quickbooks/callback` (not under `/api/`). Invoice push sets `qbo_invoice_id` and `pushed_at` on the invoice row.

### Frontend (React CRA, `/client/src`)

No Next.js — plain Create React App with React Router. API calls go through `/client/src/api/*.ts` modules (one per domain). Global state in `/client/src/context/` (AuthContext, TenantContext). No Redux or state library.

## Active Work (as of June 2026)
- QBO integration: `20260614300000_qbo_integration.sql`
- Workorder-as-dispatch model: `20260614000000_workorder_as_dispatch.sql`
- RLS policies: `20260513100000_enable_rls_public_tables.sql`
- Task history for unapproved reports: `20260517120000_task_history_unapproved.sql`
- PM user role: `20260404120000_add_pm_user_role.sql`

## Known Gotchas
- Puppeteer on Render: `RENDER=true` triggers automatic Chrome cache path setup in `server/index.js`. The build command (`build:render`) must run `install-chrome` or the binary won't exist.
- Two Supabase projects exist: `uklvgcrzhhtpqtiwrbfw` (production, `.env`) and a dev project (`.env.local`). Always confirm which DB is active before running migrations.
- `/working-saas/` folder and root-level `.md` files are planning docs — not production code.
- SQLite fallback still initializes if `SUPABASE_URL` is absent. It will not have tenant data. Don't rely on it.
