# How to add MAIN_SUPABASE_DB_URL to .env

This lets the migration scripts apply SQL directly to your **main** Supabase database (migrations and optional truncate/sequence reset).

---

## Step 1: Open your MAIN Supabase project

1. Go to **[Supabase Dashboard](https://app.supabase.com)** and sign in.
2. Select your **main** project (the one your app uses when `.env.local` is **not** present).
   - Your main project ref is **`hyjuxclsksbyaimvzulq`** (URL looks like `https://hyjuxclsksbyaimvzulq.supabase.co`).

---

## Step 2: Get the database connection string (URI)

**Use the pooler URI, not the direct connection.**

- The **direct** URI (`db.xxx.supabase.co:5432`) uses **IPv6** and often fails with **`getaddrinfo ENOENT`** on many networks.
- The **pooler** URI (`aws-0-REGION.pooler.supabase.com:6543` or `:5432`) uses **IPv4** and works reliably.

1. In the dashboard, open **Connect** (or **Settings → Database**), then find **Connection string**.
2. Use the **Session pooler** or **Transaction pooler** URI (not the direct “URI” that shows `db.xxx.supabase.co`).
   - Session pooler (port **5432**):  
     `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`
   - Transaction pooler (port **6543**):  
     `postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
3. Copy that **full** pooler URI.
4. Replace **`[YOUR-PASSWORD]`** with your database password. If the password contains **`&`** or **`*`**, use **`%26`** and **`*`** → **`%2A`** in the URI.
5. Put the result in `MAIN_SUPABASE_DB_URL` in `.env`.

---

## Step 3: Add it to .env

1. Open the file **`.env`** in your project root (same folder as `package.json`).
2. Add a **new line** (or edit if it already exists):
   ```env
   MAIN_SUPABASE_DB_URL=postgresql://postgres.hyjuxclsksbyaimvzulq:YOUR_ACTUAL_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
3. Replace:
   - **`YOUR_ACTUAL_PASSWORD`** with your real database password.
   - The **host/region** (`aws-0-us-east-1`, port `6543`, etc.) with whatever the Dashboard showed in the URI.
4. Save the file.

**Security:**  
- `.env` should be in `.gitignore` so it is not committed.  
- Do not commit or share this URL; it contains your database password.

---

## Step 4: Run the migration script

From the project root:

```powershell
node scripts/apply-migrations-to-main.js
```

This applies all 10 migration files to the main database in order.

Then (optional) to copy data from branch and reset sequences:

```powershell
node scripts/migrate-branch-to-main.js --truncate-first
```

(Use `--truncate-first` only if you want to clear main’s tables first and then copy from branch.)

---

## Troubleshooting: `getaddrinfo ENOENT db.xxx.supabase.co`

This means the **direct** database host couldn’t be resolved (Supabase’s direct connection is IPv6-only and many networks don’t support it).

**Fix:** Use the **pooler** connection string instead of the direct one.

1. In Supabase: **Connect** (or **Settings → Database**) → **Connection string**.
2. Copy the **Session pooler** or **Transaction pooler** URI (the one whose host is **`aws-0-XXXX.pooler.supabase.com`**, not `db.xxx.supabase.co`).
3. Replace `[YOUR-PASSWORD]` with your password (use `%26` for `&`, `%2A` for `*`).
4. Set that as `MAIN_SUPABASE_DB_URL` in `.env` and run the script again.
