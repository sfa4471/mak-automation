# Production: Client Path on crestfield.app — How It Works

You want to send **crestfield.app** to your client; the client opens it, goes to Settings, and selects **their own path** (e.g. `C:\Users\Client\OneDrive\Desktop\MAK_DRIVE`). That path must **work** (Valid / Writable, and project folders/PDFs saved there).

---

## Why One Central Backend Can’t Use the Client’s Path

- **crestfield.app** frontend is on **Vercel**.
- The **backend** that validates the path and writes PDFs is today a **single cloud server** (e.g. Render).
- That server runs on **Linux** and has **no access** to the client’s PC. So when the client enters `C:\Users\Client\...`, the cloud server checks **its own** disk — the path doesn’t exist there → Valid: No, Writable: No.

So for the client’s path to work, **the backend that handles that tenant must run where the path exists**: on the **client’s Windows machine** (or their Windows server).

---

## Solution: Per-Tenant Backend URL

- Each **tenant** (company) can have an optional **backend URL** (`api_base_url`).
- When the client logs in at crestfield.app, the app uses **that tenant’s backend URL** for all API calls (settings, projects, PDFs, etc.).
- You run (or the client runs) a **second backend instance** on the client’s Windows PC or their server. That backend uses the **same database** (or a linked setup) and the **same frontend** (crestfield.app), but when the client is logged in, the frontend talks to **their** backend.
- Their backend runs on Windows and can see `C:\Users\Client\...` → path is Valid and Writable, and project folders/PDFs are created there.

So:

| Who runs the backend | Where path is checked | Result for client path |
|----------------------|----------------------|-------------------------|
| Your cloud (Render)  | On cloud server      | Path never valid (expected) |
| Client’s PC / server| On client’s machine  | Path valid and writable ✓ |

---

## What You Need to Do (Summary)

1. **Add per-tenant backend URL**  
   - In the database, add `api_base_url` to the `tenants` table (nullable).  
   - When a tenant has `api_base_url` set, the frontend (after login) uses it for all API requests.

2. **Run a backend on the client’s machine**  
   - The client (or you) runs the same Node backend on their **Windows PC** or their **Windows server**, with the same codebase and same Supabase (or shared DB).  
   - That backend must be reachable from the browser (crestfield.app) over HTTPS. So either:  
     - **A)** You give them a fixed URL (e.g. subdomain or tunnel: `client.crestfield.app` or `https://xyz.ngrok.io`), and they run the backend there, **or**  
     - **B)** They host the backend on a server they control and give you the URL.

3. **Point the tenant to that backend**  
   - In the tenants table, set `api_base_url` for that client to their backend URL (e.g. `https://client.crestfield.app/api` or `https://xyz.ngrok.io/api`).  
   - From then on, when the client logs in at crestfield.app, the app will call **their** backend. They can set their path in Settings and it will be validated and used on their machine.

4. **Database and auth**  
   - Backend on client’s machine must use the **same Supabase** (same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) so users and tenants are shared. Then login at crestfield.app still works and the frontend just switches the API base to the client’s backend.

---

## Step-by-Step (For You and Your Client)

### 1. Code changes (already done in this repo)

- **Tenants table:** Add column `api_base_url` (TEXT, nullable).  
- **Auth / tenants/me:** Return `apiBaseUrl` from the tenant record when present.  
- **Frontend:** After login, if the tenant has `apiBaseUrl`, use it as the base URL for all API calls (so the client’s requests go to their backend).

### 2. Database migration

Run the migration that adds `api_base_url` to tenants:

- **Supabase:** In the SQL Editor, run the contents of `supabase/migrations/20250211000000_add_tenant_api_base_url.sql`, or run:
  ```sql
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_base_url TEXT;
  ```
- **Local/other:** Apply the same migration in your environment.

### 3. For each client who needs their own path

**Option A – Client runs backend on their PC (recommended for “their path”)**

1. **Reachable URL**  
   - On the client’s Windows PC, run your Node backend (same repo, same env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.).  
   - Expose it with a tunnel so the browser can call it over HTTPS, e.g.:  
     - **Cloudflare Tunnel**, or  
     - **ngrok**: `ngrok http 5000` → you get `https://xxxx.ngrok.io`.  
   - The API base URL for the frontend must be the tunnel URL + `/api` (e.g. `https://xxxx.ngrok.io/api`).  

2. **Set tenant’s backend in DB**  
   - In Supabase (or your DB), set that tenant’s `api_base_url` to that URL (e.g. `https://xxxx.ngrok.io/api`).  

3. **Client usage**  
   - Send them **crestfield.app**. They log in → the app uses their `api_base_url` → all requests go to the backend on their PC.  
   - In Settings they set their path (e.g. `C:\Users\Client\OneDrive\Desktop\MAK_DRIVE`) → validated and used on their PC → Valid: Yes, Writable: Yes, and project folders/PDFs go there.

**Option B – Client has a Windows server**

- Same as above, but the backend runs on their **Windows server** and is reachable at a URL they (or you) provide. Put that URL in `api_base_url` for their tenant.

### 4. CORS

- The backend running on the client’s PC (or their server) must allow requests from `https://www.crestfield.app` (and `https://crestfield.app`) in CORS. In `server/index.js` you already have `cors()` or a list of origins; add the crestfield.app origins if needed.

### 5. Security (JWT / Supabase)

- The client’s backend uses the **same** Supabase and JWT secret as your main backend so that:
  - Login at crestfield.app issues a token that the **client’s** backend accepts.  
  - The client’s backend validates the JWT and reads tenant/user from Supabase.  
- Keep `JWT_SECRET` and Supabase keys the same across your main backend and the client’s backend.

---

## Flow Diagram

```
[Client’s browser]
   opens https://www.crestfield.app
   → logs in
   → frontend reads tenant.api_base_url (e.g. https://client-tunnel.ngrok.io/api)
   → all API calls go to that URL

[Client’s backend]
   runs on client’s Windows PC (or their server)
   → same Supabase, same JWT
   → receives settings/projects/PDF requests
   → validates path C:\Users\Client\... on this machine → Valid, Writable
   → creates project folders and PDFs under that path
```

---

## Summary Table

| Item | What to do |
|------|------------|
| **Path in production** | Only works when the backend runs **on the machine that has that path** (client’s PC or their Windows server). |
| **crestfield.app link** | You keep sending **crestfield.app**; no change for the client. |
| **Per-tenant backend** | Add `api_base_url` to tenants; frontend uses it after login. |
| **Client setup** | Run your Node backend on their Windows machine; expose it via tunnel or host; set that URL in `api_base_url` for their tenant. |
| **Same DB** | Client’s backend uses same Supabase (and JWT) so login and tenant data are shared. |

Once this is in place, the client can select whatever path they want in Settings and it will work, because the backend that checks and uses that path is running on their own machine.
