# Client Always Wants Folders and PDFs on Their Local PC

This doc describes how to let a tenant (your client) create project folders and save PDFs on **their own Windows PC** while still using your hosted app (e.g. crestfield.app).

---

## How It Works

1. **Your app** (frontend + default backend) stays in the cloud. Clients open crestfield.app and log in.
2. **For a client who needs local folders/PDFs:** You run (or they run) a **second instance of the backend** on their Windows PC, with the same codebase and same Supabase/JWT as your main app.
3. You set that client’s **tenant** in the database to use their backend URL (`api_base_url`).
4. When they log in, the **frontend automatically uses their backend** for all API calls (settings, projects, PDF generation). So:
   - Their **workflow path** (e.g. `C:\Users\Client\OneDrive\Desktop\MAK_DRIVE`) is validated and used on their machine.
   - **Project folders** are created on their PC.
   - **PDFs** are generated and saved on their PC.

No change to the UI: they still use crestfield.app; only the API target switches to their backend after login.

---

## What Was Implemented in Code

- **Backend:** `GET /api/tenants/me` returns `apiBaseUrl` when the tenant has `api_base_url` set in the `tenants` table.
- **Frontend:** After login (and when restoring a session), the app calls `GET /api/tenants/me` and, if `apiBaseUrl` is present, sets the API base URL to it for all subsequent requests. On logout, it resets to the default (cloud) API.
- **Database:** The `tenants` table has an optional column `api_base_url` (see migration `20250211000000_add_tenant_api_base_url.sql`).

So once you set `api_base_url` for a tenant and their backend is reachable at that URL, folders and PDFs are created on their local machine automatically.

---

## Steps for You and Your Client

### 1. Backend on the client’s Windows PC

Follow **[RUN_BACKEND_ON_CLIENT_MACHINE.md](./RUN_BACKEND_ON_CLIENT_MACHINE.md)** so that:

- The same Node backend runs on the client’s PC (or their Windows server).
- It uses the **same** Supabase and JWT as your main app (so login and tenant data are shared).
- It is reachable over HTTPS (e.g. via **ngrok** or **Cloudflare Tunnel**). You get a URL like `https://client-xyz.ngrok-free.app` or `https://mak-api.clientcompany.com`.

### 2. Set the tenant’s backend URL in the database

In **Supabase** → **tenants** table → the row for that client’s company:

- Set **api_base_url** to their backend URL **including** `/api`, e.g.  
  `https://client-xyz.ngrok-free.app/api`  
  or  
  `https://mak-api.clientcompany.com/api`

(If you store it without `/api`, the app will still add `/api` when switching.)

### 3. Client usage

- Client opens **crestfield.app** and logs in (as today).
- After login, the app uses **their** backend for all requests. They go to **Settings**, enter their folder path (e.g. `C:\Users\Client\OneDrive\Desktop\MAK_DRIVE`), and see **Valid / Writable** because the check runs on their PC.
- Creating a project creates the folder on their PC; generating PDFs saves them there.

---

## Summary

| Who runs the backend | Where folders/PDFs go |
|----------------------|------------------------|
| Your cloud only      | Cloud server (or invalid if they enter a Windows path) |
| Client’s PC (and `api_base_url` set) | Client’s local folder ✓ |

So: **to have a client always create folders and PDFs on their local PC, run your backend on their Windows machine and set that tenant’s `api_base_url` to that backend’s URL.** The app will then use their backend automatically after they log in.
