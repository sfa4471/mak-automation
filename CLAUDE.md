# Crestfield / MakAutomation — Claude Code Context

## What This Project Is
A multi-tenant geotechnical field reporting SaaS. Field technicians generate PDF reports (density, rebar, proctor, compressive strength) tied to projects and work packages. Clients are geotechnical firms.

## Deployment
- **Frontend**: Vercel (Next.js or static — check /client)
- **Backend**: Render (Express, /server/index.js)
- **Database**: Supabase (PostgreSQL) — primary production DB
- **Legacy**: SQLite files exist (mak_automation.db) — do NOT use these in production, they are legacy

## Stack
- Backend: Node.js + Express
- DB: Supabase (supabase-js), with RLS enabled
- PDF: Puppeteer + HTML templates in /server/templates/
- Auth: JWT-based, middleware in /server/middleware/auth.js
- Multi-tenancy: tenant middleware in /server/middleware/tenant.js
- Email: /server/services/email.js
- Storage: OneDrive + Supabase storage (project drawings)

## Key Architecture Decisions
- Every route is tenant-scoped — always filter by tenant_id
- RLS is enabled on Supabase — queries run as authenticated user
- PDF generation uses Puppeteer launching headless Chrome — fragile on Render, use /server/utils/puppeteerLaunch.js
- Reports go through approval workflow before being sent
- Task history tracked in task_history table

## File Structure (source of truth)
- /server/routes/ — all API routes
- /server/db/ — Supabase client (use supabase.js, not database.js for new code)
- /server/templates/ — HTML report templates
- /server/services/ — email, OneDrive, storage
- /server/jobs/ — scheduled jobs (auto-send approved reports)
- /supabase/migrations/ — all schema changes go here

## Active Work (as of May 2026)
- RLS policies added in 20260513 migration
- Task history for unapproved reports added in 20260517
- PM user role added in 20260404
- Report deliveries tracking in 20260315

## Rules
- New schema changes MUST go in /supabase/migrations/ with timestamp prefix
- Never write to SQLite in new code — Supabase only
- Always check tenant_id isolation in new routes
- PDF templates are in /server/templates/ — edit HTML directly, no build step
- Run migrations via Supabase dashboard or the scripts in /scripts/

## Environment Variables (never hardcode)
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — backend
- JWT_SECRET — auth
- SENDGRID_API_KEY, SENDGRID_FROM_EMAIL — email delivery
- Render sets NODE_ENV=production

## Known Issues / Gotchas
- Puppeteer on Render requires special Chrome install (see /scripts/install-chrome.js)
- SQLite files in /server/ are legacy — ignore them
- /working-saas/ folder contains planning docs, not production code