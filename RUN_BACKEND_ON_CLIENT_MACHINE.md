# How to Run the Backend on the Client's Machine

So the client can use **crestfield.app** and have **their chosen folder path** (e.g. `C:\Users\Client\OneDrive\Desktop\MAK_DRIVE`) work, the backend must run on **their** Windows PC or a Windows server they use. Below are two ways to do it.

---

## Option 1: Client Runs Backend on Their Windows PC (typical)

### What the client needs

- **Windows PC** (where their folder path lives).
- **Node.js** (LTS, e.g. 18 or 20): https://nodejs.org/
- **Your backend code** (this repo or a zip you give them).
- **Environment variables** (you provide these; they must stay private):
  - Same **Supabase** as your main app: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Same **JWT secret** as your main backend: `JWT_SECRET`
  - Optional: `NODE_ENV=production`

### Step 1: Get the code on their PC

- **A)** They clone your repo (if they have access), or  
- **B)** You give them a **zip** of the project (no `node_modules`, no `.env`). They unzip it (e.g. to `C:\MAK-Backend`).

### Step 2: Create `.env` on their PC

In the project root (same folder as `package.json`), create a file named **`.env`** with:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret-same-as-render
NODE_ENV=production
```

Use the **same** values as your main backend (e.g. on Render) so login and tenants work. The client must not share this file.

### Step 3: Install and run the backend

Open **Command Prompt** or **PowerShell** in the project folder and run:

```bash
cd C:\MAK-Backend
npm install
node server/index.js
```

They should see the server start (e.g. "Server running on port 5000"). Leave this window open while they use crestfield.app.

### Step 4: Expose their PC to the internet (tunnel)

The frontend (crestfield.app) runs in the cloud and must be able to call this backend. So the backend on their PC needs a **public URL**. Two simple options:

#### A) Using ngrok (quick, good for testing)

1. Sign up at https://ngrok.com and install ngrok.
2. With the backend **already running** on their PC (Step 3), open a **second** terminal and run:
   ```bash
   ngrok http 5000
   ```
3. ngrok shows a URL like `https://abc123.ngrok-free.app`. That is their backend’s public URL.
4. The **API base URL** to put in your database is that URL + `/api`, e.g.:
   - `https://abc123.ngrok-free.app/api`

**Note:** Free ngrok URLs change each time they restart ngrok. So after each restart they (or you) must update `api_base_url` in the `tenants` table for their tenant.

#### B) Using Cloudflare Tunnel (free, stable URL possible)

1. Install **Cloudflare Tunnel** (cloudflared): https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
2. They (or you) create a tunnel and get a fixed hostname, e.g. `client-name.your-domain.com`, pointing to `localhost:5000`.
3. The **API base URL** is then `https://client-name.your-domain.com/api`.

You set that in `tenants.api_base_url` for their tenant and it can stay the same.

### Step 5: You set their backend URL in the database

In **Supabase** → **tenants** table → their company’s row → set **api_base_url** to the URL from Step 4, e.g.:

- `https://abc123.ngrok-free.app/api`  
or  
- `https://client-name.your-domain.com/api`

After that, when they log in at crestfield.app, the app will use this backend. They can set their path in Settings and it will be Valid/Writable and used for project folders and PDFs.

### Step 6: CORS (if needed)

If the browser blocks requests, the backend must allow crestfield.app. In `server/index.js` you should have something like:

```javascript
const cors = require('cors');
app.use(cors());  // allows all origins; or list: app.use(cors({ origin: ['https://www.crestfield.app', 'https://crestfield.app'] }));
```

If you already use `cors()` with no options, it’s fine. If you restrict origins, add `https://www.crestfield.app` and `https://crestfield.app`.

---

## Option 2: Client Has a Windows Server

Same idea as Option 1, but:

- They run the backend on a **Windows server** (in their office or a VM).
- They (or their IT) expose that server with a **fixed URL** (e.g. `https://mak-api.clientcompany.com`) and point it to the Node app (e.g. port 5000).
- You set **api_base_url** to `https://mak-api.clientcompany.com/api` (or whatever path serves the API) for their tenant.

Steps are the same: install Node, put code + `.env`, `npm install`, `node server/index.js`, then configure their web server or reverse proxy so the public URL reaches that process.

---

## Checklist for the client

- [ ] Node.js installed  
- [ ] Project code on their PC (or server)  
- [ ] `.env` created with your Supabase and JWT values  
- [ ] `npm install` and `node server/index.js` runs without errors  
- [ ] Tunnel or public URL set up (ngrok or Cloudflare)  
- [ ] You updated `tenants.api_base_url` in Supabase for their tenant  
- [ ] They can open crestfield.app, log in, go to Settings, enter their path and see Valid / Writable  

---

## Summary

1. **Run** the same backend (this repo) on the client’s Windows PC or server.  
2. **Configure** it with the same Supabase and JWT as your main app (`.env`).  
3. **Expose** it with a public URL (ngrok or Cloudflare Tunnel / their domain).  
4. **Set** that URL (with `/api`) in `tenants.api_base_url` for their tenant.  

Then when they use crestfield.app, the app talks to the backend on their machine and their chosen path works.
