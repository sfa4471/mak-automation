# Switch to main database and run locally

## 1. Use main database (stop using branch DB)

- In the **project root** (`c:\MakAutomation`), **rename or delete** `.env.local`.
  - Rename: `.env.local` → `.env.local.branch` (so you can switch back later).
  - Or delete it.
- The server will then use **`.env`** (main Supabase project). Make sure `.env` has your **main** Supabase URL and keys.

## 2. Client points to local server

- In **`client/.env`** (or `client/.env.local` if you use it), set:
  ```env
  REACT_APP_API_URL=http://localhost:5000/api
  ```
- So the React app talks to your local backend.

## 3. Run locally

From the project root:

```bash
npm run dev
```

This starts:
- **Server** at http://localhost:5000 (uses main DB from `.env`)
- **Client** at http://localhost:3000

Open **http://localhost:3000**, log in, and you’re on main database + current code.

---

## Switch back to branch database later

- Restore `.env.local` in the project root (e.g. rename `.env.local.branch` back to `.env.local`).
- Restart the server so it picks up the branch Supabase URL.
