# Supabase Migration - Quick Reference Guide

## 🎯 Migration Overview

**Goal:** Migrate backend from SQLite to Supabase on Render  
**Status:** Planning Phase  
**Estimated Timeline:** 12-16 days

---

## 📋 Critical Issues to Address

### 1. Direct SQLite Queries (Must Fix)
- **`server/routes/projects.js`** - Lines 214-226, 249-263 (JOIN queries)
- **`server/routes/workpackages.js`** - Lines 311-324 (JOIN query)
- **Action:** Convert to Supabase query builder or abstraction layer

### 2. Database Abstraction Layer Gaps
- **`run()` and `query()` methods** throw errors for Supabase
- **Action:** Add pg client support for raw SQL queries

### 3. Data Migration
- Production SQLite data needs migration
- **Action:** Use/enhance `scripts/migrate-data-sqlite-to-supabase.js`

---

## 🚀 Quick Start Checklist

### Phase 1: Code Fixes (2-3 days)
- [ ] Audit all routes for direct SQLite queries
- [ ] Fix `projects.js` JOIN queries
- [ ] Fix `workpackages.js` JOIN query
- [ ] Review other routes (`wp1.js`, `density.js`, `proctor.js`, `rebar.js`, `tasks.js`)

### Phase 2: Enhance Abstraction Layer (2-3 days)
- [ ] Add pg client connection pool
- [ ] Update `run()` method for Supabase
- [ ] Update `query()` method for Supabase
- [ ] Test complex queries

### Phase 3: Data Migration (3-4 days)
- [ ] Test migration script on local data
- [ ] Backup production SQLite database
- [ ] Execute migration
- [ ] Verify data integrity

### Phase 4: Render Configuration (1 day)
- [ ] Add `SUPABASE_URL` to Render env vars
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Render env vars
- [ ] Set `REQUIRE_SUPABASE=true`
- [ ] Run Supabase migrations

### Phase 5: Testing (3-4 days)
- [ ] Test all API endpoints
- [ ] Performance testing
- [ ] Data integrity verification

### Phase 6: Production Deployment (1 day)
- [ ] Deploy to Render
- [ ] Monitor logs
- [ ] Verify functionality

---

## 🔧 Key Technical Changes

### Converting SQLite JOIN to Supabase

**Before (SQLite):**
```javascript
sqliteDb.all(
  `SELECT p.*, 
   (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
   FROM projects p ORDER BY p.createdAt DESC`,
  [],
  callback
);
```

**After (Supabase):**
```javascript
const { data: projects } = await supabase
  .from('projects')
  .select('*')
  .order('created_at', { ascending: false });

const projectsWithCounts = await Promise.all(
  projects.map(async (project) => {
    const { count } = await supabase
      .from('workpackages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id);
    return { ...project, workPackageCount: count || 0 };
  })
);
```

### Adding pg Client Support

**Required Environment Variable:**
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
```

Get this from: Supabase Dashboard → Settings → Database → Connection string

---

## 📊 Current Architecture Status

✅ **Already Implemented:**
- Supabase schema migration exists
- Database abstraction layer (`server/db/index.js`)
- Most routes use abstraction layer
- Supabase client configured

⚠️ **Needs Work:**
- Direct SQLite queries in some routes
- Raw SQL query support for Supabase
- Data migration script enhancement
- Render environment configuration

---

## 🔍 Files to Review

### High Priority
1. `server/routes/projects.js` - Has direct SQLite queries
2. `server/routes/workpackages.js` - Has direct SQLite queries
3. `server/db/index.js` - Needs pg client support

### Medium Priority
4. `server/routes/wp1.js`
5. `server/routes/density.js`
6. `server/routes/proctor.js`
7. `server/routes/rebar.js`
8. `server/routes/tasks.js`

### Low Priority (Review)
9. `server/routes/pdf.js`
10. `server/routes/notifications.js`

---

## 🛠️ Required Environment Variables (Render)

```env
# Supabase Configuration (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PostgreSQL Connection (for pg client)
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Application Configuration
REQUIRE_SUPABASE=true
NODE_ENV=production
PORT=5000
JWT_SECRET=your-jwt-secret
```

---

## 📝 Migration Scripts

**Existing Scripts:**
- `scripts/run-supabase-migration.js` - Run schema migrations
- `scripts/migrate-data-sqlite-to-supabase.js` - Migrate data
- `scripts/execute-and-verify-migration.js` - Execute and verify

**NPM Commands:**
```bash
npm run supabase:migrate          # Run schema migrations
npm run supabase:migrate-data     # Migrate data from SQLite
npm run supabase:verify           # Verify tables
npm run supabase:execute-and-verify  # Execute and verify
```

---

## ⚠️ Risk Mitigation

1. **Backup First:** Always backup SQLite database before migration
2. **Test Locally:** Test all changes on local environment first
3. **Staged Rollout:** Consider testing on staging environment
4. **Monitor Closely:** Watch logs and error rates after deployment
5. **Rollback Plan:** Keep SQLite backup for 30 days

---

## 📚 Full Documentation

See `SUPABASE_MIGRATION_PLAN_FOR_RENDER.md` for complete details.

---

**Last Updated:** January 31, 2025
