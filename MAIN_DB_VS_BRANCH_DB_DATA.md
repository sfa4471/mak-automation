# Why you see no data on main database

The **main** Supabase project (from `.env`) and the **branch** Supabase project (from `.env.local`) are **two different databases**.

- All the data you had (projects, tasks, technicians, etc.) was in the **branch** database (`uklvgcrzhhtpqtiwrbfw`).
- The **main** database is a separate project. It is often empty or has different/older data.

So when you switched to main DB, the app correctly connected to main — but that project simply doesn’t have the same data.

---

## Option 1: Use branch DB when you need that data locally

When you want to see your projects, tasks, and technicians locally:

1. In the **project root**, open **`.env`** and add (or set):
   ```env
   USE_BRANCH_DB=1
   ```
2. Restart the server (`npm run dev`).
3. Log in again. You’ll be using the **branch** database and will see your data.

To switch back to main DB later, remove that line (or set `USE_BRANCH_DB=0`) and restart.

---

## Option 2: Check what’s in the main database

1. Open the **Supabase Dashboard** for your **main** project (the URL in `.env`: `SUPABASE_URL=https://xxxx.supabase.co`).
2. Go to **Table Editor** and check:
   - `projects` – any rows?
   - `tasks` – any rows?
   - `users` – any rows?

If those tables are empty, that’s why you see no data when connected to main.

---

## Option 3: Copy data from branch to main

If you want the same data in the main project, you’d need to export from the branch project and import into the main project (e.g. via Supabase dashboard, or a one-off script). That’s separate from the app code.

---

**Summary:** Main DB and branch DB are two different Supabase projects. Your data lives in the branch DB. Use **Option 1** (`USE_BRANCH_DB=1`) when you want to run locally and see that data.
