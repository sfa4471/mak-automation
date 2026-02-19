# Use Branch Database (feature/multi-tenant-saas)

When you're on branch `feature/multi-tenant-saas`, the app still uses **whichever Supabase project is in your env**. By default that's `.env` (main: `hyjuxclsksbyaimvzulq`). To use the **branch database** instead, override with `.env.local`.

**In Cursor:** You can say **"switch to branch database"** and the AI will remember to use the branch DB (see `.cursor/rules/branch-database.mdc`).

## Branch database

- **URL:** `https://uklvgcrzhhtpqtiwrbfw.supabase.co`
- **Project ref:** `uklvgcrzhhtpqtiwrbfw`

## Steps to use the branch database locally

1. **Create or edit `.env.local`** in the project root (same folder as `package.json`).

2. **Add the branch project credentials** (from Supabase Dashboard → your **branch** project → Settings → API):

   ```env
   SUPABASE_URL=https://uklvgcrzhhtpqtiwrbfw.supabase.co
   SUPABASE_ANON_KEY=<anon key for uklvgcrzhhtpqtiwrbfw>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key for uklvgcrzhhtpqtiwrbfw>
   ```

3. **Restart the server** (stop `npm run dev` and run it again).

4. **Confirm in the server log** — you should see:
   - `Using Supabase: https://uklvgcrzhhtpqtiwrbfw.supabase.co`
   - `(from .env.local — dev)`

If you still see `hyjuxclsksbyaimvzulq` and `(from .env — main)`, then `.env.local` is missing or not in the project root; fix that and restart.

### First-time branch DB: create an admin user

The branch database has no user accounts until you create one. If you get **"Invalid credentials"** when signing in:

```powershell
node scripts/create-admin-user.js
```

Or with custom email/password:

```powershell
node scripts/create-admin-user.js admin@maklonestar.com yourpassword
```

Then log in with that email and password. See **QA_REPORT_BRANCH_DB_LOGIN_AND_SAAS.md** for full details.

## Switch back to main database

- Remove or rename `.env.local`, or comment out its contents. The server will use `.env` (main) again after restart.
