# Use Branch Database as Production (crestfield.app)

You can make **crestfield.app** use your current **branch** Supabase project (`uklvgcrzhhtpqtiwrbfw`) as its database **without running any migration**. The app chooses the database purely from environment variables.

## What this does

- **crestfield.app** (frontend on Vercel + backend on Render or your host) will use the **branch** database.
- No data migration: you're only changing which Supabase project the production app connects to.
- The **current main** Supabase project (`hyjuxclsksbyaimvzulq`) stays unchanged (backup/legacy).
- Going forward, the branch DB is your **production** DB; run new migrations there.

---

## Implementation (step-by-step)

Only the **backend** needs Supabase env vars (the frontend talks to the backend API, not Supabase directly). So you only change env on the backend host.

### Step 1: Get branch credentials

**Option A — From your machine:** Copy from `.env.local`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Option B — From Supabase:** [Supabase Dashboard](https://supabase.com/dashboard) → project **uklvgcrzhhtpqtiwrbfw** (branch) → **Settings → API** (Project URL, anon public, service_role).

**Verify:** Run `node scripts/use-branch-db-as-production.js` for a checklist and to confirm branch credentials.

### Step 2: Set env vars on the backend (Render)

Your **branch** credentials are already in `.env.local`. Use the same values on Render:

1. Open [Render Dashboard](https://dashboard.render.com) and select the **backend service** that serves crestfield.app API.
2. Go to **Environment** (left sidebar). Add or update:

   | Key | Value |
   |-----|--------|
   | `SUPABASE_URL` | `https://uklvgcrzhhtpqtiwrbfw.supabase.co` |
   | `SUPABASE_ANON_KEY` | Copy from your `.env.local` (same as branch anon key) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Copy from your `.env.local` (same as branch service_role key) |

3. Click **Save Changes**, then **Redeploy**.

### Step 3: Frontend (Vercel)

No Supabase vars needed (frontend calls your backend). Ensure `REACT_APP_API_BASE_URL` points to your backend. If already set, no change.

### Step 4: Confirm

Open https://www.crestfield.app, log in with a user that exists in the branch DB, and confirm data loads. Production is now using the branch database; no migration was run.

### Optional: Local default = branch DB

Back up `.env` to `.env.main.backup`; in `.env` set the three Supabase variables to branch values; restart `npm run dev`. Use `.env.local` with main credentials to switch back temporarily.

## Summary

| Goal | Action |
|------|--------|
| crestfield.app uses branch DB | Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in **production** to branch project; redeploy. |
| No migration | Correct — you're only switching which project production connects to. |
| Old main unchanged | Don't change the main project; it remains as-is (legacy/backup). |
| Future migrations | Run them on the branch (now production) Supabase project. |
