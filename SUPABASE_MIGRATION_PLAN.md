# SQLite to Supabase Migration Plan

**Document Version:** 1.0  
**Author:** Senior Software Engineer (Database Migration Specialist)  
**Date:** Migration Planning  
**Scope:** MAK Automation – Full database migration from SQLite to Supabase (PostgreSQL)

---

## Executive Summary

This plan outlines the migration of the MAK Automation application from SQLite to Supabase (PostgreSQL). The current implementation uses SQLite with a Node.js/Express backend using callback-style `db.run()`, `db.get()`, and `db.all()` operations. Supabase provides hosted PostgreSQL with REST/Realtime APIs and optional direct Postgres access.

**Estimated Effort:** 3–5 weeks (1 developer)  
**Risk Level:** Medium–High (schema changes, data migration, auth considerations)  
**Recommended Approach:** Phased migration with abstraction layer

---

## 1. Current Database Architecture

### 1.1 Tables Inventory

| Table | Purpose | Row Estimate | JSON Columns |
|-------|---------|--------------|--------------|
| `users` | Auth (ADMIN, TECHNICIAN) | Low (10–100) | — |
| `projects` | Project master data | Low–Med | customerEmails, soilSpecs, concreteSpecs (TEXT/JSON) |
| `project_counters` | Atomic project number generation | ~10 | — |
| `workpackages` | Legacy WP system (deprecated) | Low | — |
| `tasks` | Primary task/work order entity | Med | — |
| `wp1_data` | Compressive strength report data | Med | cylinders (TEXT/JSON) |
| `proctor_data` | Proctor test report data | Low–Med | proctorPoints, zavPoints, passing200 (TEXT/JSON) |
| `density_reports` | Density test report data | Low–Med | testRows, proctors (TEXT/JSON) |
| `rebar_reports` | Rebar inspection reports | Low | — |
| `notifications` | User notifications | Med | — |
| `task_history` | Audit trail for task status changes | Med | — |

### 1.2 Query Patterns

- **Callback style:** All routes use `db.get()`, `db.all()`, `db.run()` with nested callbacks.
- **Parameterized queries:** Uses `?` placeholders (SQLite style).
- **Transactions:** No explicit `BEGIN`/`COMMIT`; some logical sequences (e.g., project creation + counter update) could race.
- **JSON storage:** Several columns store JSON as TEXT; parsed in app code.
- **Atomic counter:** `project_counters` used for `02-YYYY-NNNN` project numbering.

### 1.3 Files Requiring Changes

| File | Change Type |
|------|-------------|
| `server/database.js` | Replace with Supabase client |
| `server/routes/auth.js` | Use Supabase for users |
| `server/routes/projects.js` | Use Supabase for projects + project_counters |
| `server/routes/tasks.js` | Use Supabase for tasks, task_history |
| `server/routes/workpackages.js` | Use Supabase for workpackages |
| `server/routes/wp1.js` | Use Supabase for wp1_data |
| `server/routes/proctor.js` | Use Supabase for proctor_data |
| `server/routes/density.js` | Use Supabase for density_reports |
| `server/routes/rebar.js` | Use Supabase for rebar_reports |
| `server/routes/notifications.js` | Use Supabase for notifications |
| `server/routes/pdf.js` | Update DB reads for PDF generation |
| Migration scripts (15+ files) | Replace with Supabase migrations |

---

## 2. SQLite vs PostgreSQL/Supabase Differences

### 2.1 Schema Differences

| SQLite | PostgreSQL / Supabase |
|--------|------------------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` or `BIGSERIAL PRIMARY KEY` |
| `TEXT` | `TEXT` (compatible) |
| `DATETIME` | `TIMESTAMPTZ` or `TIMESTAMP` |
| `CHECK(role IN (...))` | Same syntax (supported) |
| `?` placeholders | `$1`, `$2`, … or use Supabase client |
| `AUTOINCREMENT` | `SERIAL` / `GENERATED … AS IDENTITY` |
| `REAL` / `INTEGER` for booleans | Prefer `BOOLEAN` |
| `JSON` stored as TEXT | Native `JSONB` recommended |

### 2.2 Behavioral Differences

- **Case sensitivity:** PostgreSQL string comparison is case-sensitive by default; SQLite is different. May affect `CHECK` and `WHERE` conditions.
- **JSON:** PostgreSQL `JSONB` supports indexing and queries; consider converting TEXT JSON columns.
- **Transactions:** Supabase/Postgres transactions use `BEGIN`/`COMMIT`; plan for atomic operations.
- **Concurrency:** `project_counters` update pattern needs `SELECT ... FOR UPDATE` or `pg_advisory_lock` for true atomicity.
- **PRAGMA:** SQLite `PRAGMA table_info` has no direct equivalent; use `information_schema` in Postgres.

---

## 3. Migration Strategy Options

### Option A: Direct Supabase Client (Recommended)

- Replace `sqlite3` with `@supabase/supabase-js`.
- Use Supabase client in route handlers: `supabase.from('table').select()`, `.insert()`, `.update()`, `.upsert()`.
- Migrate all 15+ route files.
- **Pros:** Native Supabase features (Realtime, RLS if needed later), simpler long-term.
- **Cons:** Larger refactor, different query patterns.

### Option B: Database Abstraction Layer (pg / node-postgres)

- Use `pg` (node-postgres) with raw SQL and `$1` placeholders.
- Minimal query rewrites; mostly placeholder and type adjustments.
- **Pros:** Smaller initial change, closer to current style.
- **Cons:** No Supabase client benefits, more manual connection/transaction handling.

### Option C: Supabase + Abstraction Layer

- Introduce a thin `db` abstraction that wraps Supabase client.
- Routes call `db.get()`, `db.all()`, `db.run()` as today; implementation uses Supabase under the hood.
- **Pros:** Gradual migration, smaller per-route changes.
- **Cons:** Extra abstraction to maintain; may limit use of Supabase features.

---

## 4. Recommended Migration Plan (Phased)

### Phase 1: Supabase Setup & Schema (Week 1)

1. **Create Supabase project**
   - Sign up at supabase.com.
   - Create project; note URL and anon/service keys.

2. **Define schema in Supabase**
   - Create migration files in `supabase/migrations/`.
   - Convert SQLite DDL to PostgreSQL:
     - `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
     - `TEXT` JSON columns → `JSONB` where beneficial
     - `DATETIME` → `TIMESTAMPTZ`
     - `CHECK(isRead IN (0, 1))` → `CHECK(is_read IN (0, 1))` (consider `BOOLEAN` later)
   - Create tables in dependency order: users → projects → project_counters → workpackages → tasks → wp1_data, proctor_data, density_reports, rebar_reports → notifications, task_history.

3. **Handle project_counters**
   - Implement atomic sequence: use `SELECT ... FOR UPDATE` or `pg_advisory_lock` around read-increment-write.
   - Alternatively use PostgreSQL `SEQUENCE` and `nextval()`.

4. **Create `proctor_data` table**
   - Not in `database.js`; inferred from routes. Add to migrations with all columns used in proctor routes.

### Phase 2: Data Migration Script (Week 1–2)

1. **Export from SQLite**
   - Script to read all tables and output JSON/CSV.

2. **Transform**
   - Parse JSON TEXT columns.
   - Map SQLite types to Postgres (dates, booleans, JSONB).
   - Preserve IDs for foreign key consistency (or regenerate if acceptable).

3. **Import into Supabase**
   - Use Supabase client `.insert()` or REST API.
   - Respect foreign key order.
   - Reset sequences after manual ID inserts: `SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));`

4. **Validation**
   - Row counts per table.
   - Spot-check relationships and JSON fields.
   - Verify project numbers and counters.

### Phase 3: Backend Code Migration (Week 2–3)

1. **Install Supabase client**
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Create Supabase connection module**
   - `server/db/supabase.js`: initialize client with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for server-side, bypass RLS if not using it).

3. **Migrate route by route (suggested order)**
   - `auth.js` (users)
   - `projects.js` (projects, project_counters)
   - `tasks.js` (tasks, task_history)
   - `wp1.js` (wp1_data)
   - `proctor.js` (proctor_data)
   - `density.js` (density_reports)
   - `rebar.js` (rebar_reports)
   - `workpackages.js` (workpackages)
   - `notifications.js` (notifications)
   - `pdf.js` (read-only queries)

4. **Callback → async/await**
   - Convert nested callbacks to `async/await` for readability and error handling.
   - Use `try/catch` and proper HTTP error responses.

5. **JSON handling**
   - For `JSONB`: Supabase returns parsed objects; no manual `JSON.parse`.
   - For remaining TEXT JSON: keep parse/stringify in app if needed during transition.

### Phase 4: Authentication Decision (Week 3–4)

**Current:** Custom JWT + bcrypt in Express; users in `users` table.

**Options:**

- **A) Keep custom auth**
  - Continue using `users` table, bcrypt, JWT.
  - No change to auth flow; only DB backend changes.
  - Simpler migration.

- **B) Migrate to Supabase Auth**
  - Use Supabase Auth (email/password, magic links, etc.).
  - Migrate users into `auth.users`; sync roles to `public.users` or custom table.
  - Update frontend to use Supabase client for auth.
  - More work but leverages Supabase Auth.

**Recommendation:** Start with Option A. Migrate DB first; consider Supabase Auth in a later phase.

### Phase 5: Testing & Rollback (Week 4–5)

1. **Unit/integration tests**
   - Test each migrated route.
   - Use test Supabase project or local Supabase.

2. **End-to-end**
   - Login, project creation, task flows, report CRUD, PDF generation.

3. **Rollback plan**
   - Keep SQLite code in a branch.
   - Feature flag or env var to switch DB back to SQLite if critical issues appear.
   - Document rollback steps and DB restore from Supabase backups.

4. **Performance**
   - Compare response times for key endpoints.
   - Add indexes in Supabase for frequent filters (e.g., `taskId`, `projectId`, `userId`).

---

## 5. Schema Conversion Reference

### 5.1 Example: `users` Table

**SQLite (current):**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
  name TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**PostgreSQL (Supabase):**
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### 5.2 Example: JSON Columns

**SQLite:** `cylinders TEXT` (app does `JSON.parse`)

**PostgreSQL:**
```sql
cylinders JSONB DEFAULT '[]'::jsonb
```

### 5.3 Query Placeholder Conversion

**SQLite:**
```javascript
db.get('SELECT * FROM users WHERE id = ?', [id], callback);
```

**Supabase client:**
```javascript
const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
```

**Raw pg (if using Option B):**
```javascript
const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
```

---

## 6. Environment Variables

Add to `.env`:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   # Server-side only; never expose to client
```

For local Supabase:
```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
```

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Backup SQLite; validate row counts and key relationships after import |
| Race in project numbering | Use Postgres advisory locks or `SELECT FOR UPDATE` |
| Breaking API contracts | Keep request/response shapes; only change DB layer |
| Performance regression | Add indexes; monitor Supabase metrics |
| Downtime | Run migration during maintenance window; use feature flag for quick rollback |
| Migration script bugs | Test on copy of production SQLite; dry-run imports |

---

## 8. Post-Migration Cleanup

1. Remove `sqlite3` and SQLite-specific migrations.
2. Update `package.json` scripts (remove SQLite migrate commands).
3. Document new Supabase setup in README.
4. Consider Supabase RLS for row-level security in future phase.
5. Enable Supabase backups and define retention policy.

---

## 9. Checklist Summary

- [ ] Create Supabase project
- [ ] Write PostgreSQL migrations for all tables
- [ ] Create data export script from SQLite
- [ ] Create data import script to Supabase
- [ ] Validate migrated data
- [ ] Implement Supabase client module
- [ ] Migrate auth routes
- [ ] Migrate projects + project_counters
- [ ] Migrate tasks + task_history
- [ ] Migrate wp1, proctor, density, rebar routes
- [ ] Migrate workpackages, notifications
- [ ] Update pdf routes
- [ ] Convert callbacks to async/await
- [ ] Add/verify indexes
- [ ] End-to-end testing
- [ ] Rollback plan documented and tested
- [ ] Deploy to staging
- [ ] Production migration and cutover

---

## 10. Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Schema | 3–5 days | Supabase account |
| Phase 2: Data migration | 2–4 days | Phase 1 |
| Phase 3: Code migration | 8–12 days | Phase 2 |
| Phase 4: Auth (if changing) | 3–5 days | Phase 3 |
| Phase 5: Testing & cutover | 5–7 days | Phase 3–4 |

**Total:** ~3–5 weeks for one developer.

---

*This plan should be reviewed and adjusted based on team capacity, risk tolerance, and whether Supabase Auth adoption is desired in the initial migration.*
