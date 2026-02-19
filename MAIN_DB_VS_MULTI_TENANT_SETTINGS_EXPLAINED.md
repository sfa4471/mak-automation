# Main Database vs Multi-Tenant: Why Settings “Work” for Each Client (Detailed Explanation)

You asked: *“Are you saying my main database is not correctly set up for multi-tenant or multiple clients? But if I give my client a unique login, they can log in and under Settings they can choose the path — so why?”*

Here’s the precise behavior and why it can look “per client” even when the main DB is **not** multi-tenant for settings.

---

## 1. How Your Main Database Is Set Up (Settings)

When you run against your **main database** (no `.env.local`, or Supabase **without** the multi-tenant migration), the `app_settings` table looks like this:

- **One row per setting key.**  
  For example there is exactly **one** row for `workflow_base_path` (and one for `onedrive_base_path`, etc.).
- **No `tenant_id`.**  
  The table does not store “which company/client this path belongs to.” It only stores “the” path.

So in the database you effectively have:

| key                | value (example)        |
|--------------------|------------------------|
| workflow_base_path | C:\SomePath\Projects   |

There is only one value for the whole application.

---

## 2. What Happens When a Client Logs In and “Chooses the Path”

- You give **Client A** a unique login (their own user account).
- Client A logs in, goes to **Settings**, enters a path (e.g. `C:\ClientA\Projects`), and clicks **Save**.
- The app saves that path into that **single** `workflow_base_path` row.

So far this matches what you see: the client can log in and “choose the path.” The UI and the save both work.

The important part is what happens with **another** client:

- You give **Client B** a different login.
- Client B logs in and goes to **Settings**.
- The app **reads the same row** — so Client B sees **whatever path is currently in that row**.
  - If only Client A ever saved, Client B sees Client A’s path: `C:\ClientA\Projects`.
  - If Client B then saves `C:\ClientB\Projects`, the app **overwrites** that same row.
  - After that, **everyone** (including Client A) will see `C:\ClientB\Projects` when they open Settings.

So:

- **Each client can log in and choose a path** — that’s correct.
- But **there is only one path for the entire app** — whoever saves last “wins,” and everyone shares that one value.

So the main DB is **not** set up so that “each client has their own path.” It’s set up so that “there is one path, and any admin can view/change it.”

---

## 3. Why It Can *Look* Like “Each Client Has Their Own Path”

It can seem “correct” for multiple clients for a few reasons:

### A. Only One Client (or One Company) Uses the App

- If in practice only one company (or one admin) ever uses the app, there’s only one path that ever gets set.
- So you never see two clients overwriting each other. It looks like “my client logs in and sets their path” — and they do, but that path is still the **only** path in the system.

### B. Each Client Has Their Own Deployment (Separate Server + DB)

- **Client A:** their own server + their own copy of the main DB (e.g. their own Supabase project or their own SQLite file).
- **Client B:** a different server + a different copy of the main DB.

Then:

- In Client A’s database there is one row for `workflow_base_path` → Client A sets it to their path.
- In Client B’s database there is a **different** one row → Client B sets it to their path.

So “each client has their own path” is true **because each client has their own app instance and own database**, not because the main DB has multi-tenant settings. That’s “one tenant per deployment,” not “many tenants in one database.”

### C. Clients Don’t Use Settings at the Same Time / Don’t Compare

- If clients rarely open Settings, or never compare with each other, you might not notice that they’re all sharing one path.
- As soon as two different clients (in the **same** main DB) set different paths, the second one overwrites the first for everyone.

So: the main DB is **not** incorrectly set up for “one path per app” — it’s correctly doing “one path per app.” It’s just **not** doing “one path per client/tenant” when multiple clients share the same main DB.

---

## 4. Summary: Main DB vs Branch DB (Multi-Tenant)

| Aspect | Main DB (current) | Branch DB (after multi-tenant migration + fix) |
|--------|--------------------|-------------------------------------------------|
| **app_settings** | One row per key (e.g. one `workflow_base_path`). No `tenant_id`. | One row per **(tenant_id, key)**. Each tenant can have its own path. |
| **Who can open Settings?** | Any admin (any client with admin login). | Same — any admin. |
| **What happens when they set the path?** | The **single** path for the whole app is updated. Everyone sees the same value. | The path for **that tenant only** is updated. Other tenants keep their own paths. |
| **“Each client has their own path”** | Only if each client has their **own deployment** (own DB). If multiple clients share the same main DB, they share one path. | Yes: in **one** database, each tenant (client/company) has its own path. |

So:

- **Main DB:** Correct for “one app, one path, any admin can change it.” Not designed for “many clients in one DB, each with their own path.”
- **Branch DB:** Designed for “many clients (tenants) in one DB, each with their own path.” The code fix makes Settings (and PDF/project paths) use `tenant_id` so that each tenant’s path is stored and used correctly.

---

## 5. Direct Answers to Your Questions

**“Is my main database not correctly set up for multi-tenant or multiple clients?”**

- For **workflow path in Settings**, the main DB is set up for **one path for the whole app**, not one path per client. So for “multiple clients in one database, each with their own path,” the main DB is **not** set up that way. For “multiple clients each with their own server and own DB,” each of those DBs is effectively single-tenant and that’s fine.

**“Why can my client log in and under Settings choose the path?”**

- Because the app lets any admin open Settings and save the path. That part works. The path they choose is saved into the **only** row for `workflow_base_path`. So they *can* choose it — but that path is then the path for **everyone** using that same database, not just for that client. If you only have one client (or one deployment per client), you never see the conflict.

**“So do I need to change something on main?”**

- Only if you want **multiple clients (tenants) in the same main database**, each with their **own** workflow path. In that case you’d need to:
  - Run the multi-tenant migration on main (add `tenant_id` to `app_settings` and other tables), and  
  - Use the same tenant-aware Settings and path logic we added for the branch (so each tenant’s path is read/written with their `tenant_id`).

If you’re happy with “one path per deployment” and each client has their own deployment, then the main DB is set up correctly for that.

---

## 6. Your Exact Scenario: Company A and Company B, “Each Chooses Their Path”

You described:

- **Company A** signs in with their own admin ID → chooses path where they want PDFs.
- **Company B** signs in with their own admin ID → chooses their own path.
- You expect: those two are **independent** — PDFs stored in different locations.

Whether they are independent depends **only** on which database (and schema) you use.

---

### Scenario on MAIN database (one row for workflow path, no tenant_id)

**Step 1 – Company A**

- Company A admin signs in (their own user id).
- Goes to Settings, enters `C:\CompanyA\PDFs`, clicks Save.
- In the DB there is **one** row: `workflow_base_path = C:\CompanyA\PDFs`.
- Company A’s PDFs are stored under `C:\CompanyA\PDFs`. ✓

**Step 2 – Company B**

- Company B admin signs in (different user id).
- Goes to Settings. The app **reads that same one row** → Company B **sees** `C:\CompanyA\PDFs` (Company A’s path).
- Company B changes it to `C:\CompanyB\PDFs` and clicks Save.
- The app **overwrites** that same row. Now the **only** row is: `workflow_base_path = C:\CompanyB\PDFs`.

**Step 3 – After that**

- **All** new PDFs (for Company A and Company B) are stored under `C:\CompanyB\PDFs`, because that is the only path in the database.
- If Company A admin opens Settings again, they see `C:\CompanyB\PDFs` — not their path anymore.
- So they are **not** independent. There is one path for the whole app; whoever saved last “wins.” PDFs do **not** go to different locations per company — they all go to the same location (the path currently in that single row).

So on main DB: **Company A and Company B are not independent.** One shared path; PDFs end up in one place (whichever path was saved last).

---

### Scenario on BRANCH database (multi-tenant + tenant-aware code)

**Step 1 – Company A (tenant_id = 1)**

- Company A admin signs in (user belongs to tenant 1).
- Goes to Settings, enters `C:\CompanyA\PDFs`, clicks Save.
- The app saves a row: `tenant_id = 1`, `key = workflow_base_path`, `value = C:\CompanyA\PDFs`.
- Company A’s PDFs are stored under `C:\CompanyA\PDFs`. ✓

**Step 2 – Company B (tenant_id = 2)**

- Company B admin signs in (user belongs to tenant 2).
- Goes to Settings, enters `C:\CompanyB\PDFs`, clicks Save.
- The app saves a **different** row: `tenant_id = 2`, `key = workflow_base_path`, `value = C:\CompanyB\PDFs`.
- Company A’s row is **not** overwritten. Now the table has:
  - Tenant 1 → `C:\CompanyA\PDFs`
  - Tenant 2 → `C:\CompanyB\PDFs`

**Step 3 – After that**

- When Company A creates a project or generates a PDF, the app uses `tenant_id = 1` → path `C:\CompanyA\PDFs`.
- When Company B creates a project or generates a PDF, the app uses `tenant_id = 2` → path `C:\CompanyB\PDFs`.
- Company A and Company B **are** independent. PDFs **are** stored in different locations.

So on branch DB (with the tenant-aware fix): **Company A and Company B are independent.** Each company has its own path; PDFs go to the correct location per company.

---

### Summary for your scenario

| Question | Main DB | Branch DB (multi-tenant + fix) |
|----------|---------|----------------------------------|
| Company A and Company B each have their own admin login? | Yes | Yes |
| Each can open Settings and type a path and click Save? | Yes | Yes |
| Are the two paths stored **separately** (A’s path and B’s path)? | **No** — one row; B’s save overwrites A’s. | **Yes** — one row per tenant. |
| Are PDFs stored in **different** locations per company? | **No** — all PDFs use the one path in the DB (last saved). | **Yes** — A’s PDFs → A’s path, B’s PDFs → B’s path. |
| Are Company A and Company B independent for path/PDF location? | **No** | **Yes** |

So: **“Company A chooses their path, Company B chooses their path, PDFs in different locations”** is only true when you use the **branch database** (multi-tenant schema) with the **tenant-aware** Settings and path code. On the main database (single row for workflow path), they share one path and are not independent.
