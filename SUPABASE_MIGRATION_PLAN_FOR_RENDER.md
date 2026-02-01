# Supabase Migration Plan for Render Deployment
## Senior Software Engineer Assessment & Migration Strategy

**Date:** January 31, 2025  
**Engineer:** Senior Backend Architect (20+ years experience)  
**Target:** Migrate MAK Automation backend from SQLite to Supabase on Render

---

## Executive Summary

This document outlines a comprehensive migration plan to transition the MAK Automation backend from SQLite (currently deployed on Render) to Supabase (PostgreSQL). The application already has a dual-database architecture with an abstraction layer, but requires refinement to fully support Supabase in production.

**Current State:**
- ✅ Supabase schema migration exists (`supabase/migrations/20250131000000_initial_schema.sql`)
- ✅ Database abstraction layer implemented (`server/db/index.js`)
- ⚠️ Some routes still use direct SQLite queries
- ⚠️ Complex JOIN queries need Supabase query builder conversion
- ⚠️ Raw SQL queries need PostgreSQL/pg client implementation
- ⚠️ Production data migration strategy needed

**Target State:**
- ✅ Full Supabase integration with no SQLite fallback in production
- ✅ All routes using abstraction layer or Supabase query builder
- ✅ Production data migrated to Supabase
- ✅ Render deployment configured for Supabase

---

## 1. Current Architecture Analysis

### 1.1 Database Abstraction Layer

**Location:** `server/db/index.js`

**Current Implementation:**
- ✅ Provides unified interface: `get()`, `all()`, `insert()`, `update()`, `delete()`
- ✅ Automatic camelCase ↔ snake_case conversion
- ✅ Detects Supabase availability via `isAvailable()`
- ⚠️ `run()` and `query()` methods throw errors for Supabase (need pg client)

**Issues Identified:**
1. Raw SQL queries (`run()`, `query()`) not supported for Supabase
2. Complex JOIN queries require direct Supabase client usage
3. Some routes bypass abstraction layer for performance

### 1.2 Route Analysis

**Routes Using Abstraction Layer (✅ Good):**
- `server/routes/auth.js` - Fully uses abstraction layer
- `server/routes/projects.js` - Mostly uses abstraction, but has direct Supabase queries for complex operations
- `server/routes/tasks.js` - Needs verification
- `server/routes/notifications.js` - Needs verification

**Routes with Direct SQLite Queries (⚠️ Needs Migration):**
- `server/routes/projects.js` - Lines 214-226, 249-263 (SQLite fallback with JOINs)
- `server/routes/workpackages.js` - Lines 311-324 (SQLite JOIN query)
- Potentially others - needs full audit

**Routes Needing Review:**
- `server/routes/wp1.js`
- `server/routes/density.js`
- `server/routes/proctor.js`
- `server/routes/rebar.js`
- `server/routes/pdf.js`

### 1.3 Schema Differences

**SQLite → PostgreSQL/Supabase:**
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
- `DATETIME DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT NOW()`
- `TEXT` JSON columns → `JSONB` (already handled in migration)
- `camelCase` column names → `snake_case` (handled by abstraction layer)
- `INTEGER` boolean flags → `INTEGER CHECK(column IN (0, 1))` (maintained)

**Migration Status:**
- ✅ Schema migration file exists and is comprehensive
- ✅ All tables defined with proper constraints
- ✅ Indexes created for performance
- ✅ Foreign keys properly configured

---

## 2. Migration Phases

### Phase 1: Code Audit & Route Standardization (Priority: HIGH)

**Objective:** Identify all direct SQLite queries and convert to abstraction layer or Supabase query builder.

**Tasks:**

1. **Complete Route Audit**
   - [ ] Review all route files in `server/routes/`
   - [ ] Document all direct SQLite queries
   - [ ] Document all direct Supabase queries
   - [ ] Create inventory of complex queries (JOINs, aggregations, subqueries)

2. **Fix Direct SQLite Queries in `projects.js`**
   - [ ] Convert SQLite JOIN query (lines 214-226) to Supabase query builder
   - [ ] Convert SQLite JOIN query (lines 249-263) to Supabase query builder
   - [ ] Ensure proper error handling

3. **Fix Direct SQLite Queries in `workpackages.js`**
   - [ ] Convert SQLite JOIN query (lines 311-324) to Supabase query builder
   - [ ] Review all other queries in this file

4. **Audit Other Routes**
   - [ ] `server/routes/wp1.js` - Check for direct queries
   - [ ] `server/routes/density.js` - Check for direct queries
   - [ ] `server/routes/proctor.js` - Check for direct queries
   - [ ] `server/routes/rebar.js` - Check for direct queries
   - [ ] `server/routes/tasks.js` - Check for direct queries
   - [ ] `server/routes/pdf.js` - Check for direct queries

**Estimated Time:** 2-3 days

**Deliverables:**
- Updated route files with all queries using abstraction layer or Supabase query builder
- Documentation of all query conversions
- Test cases for each converted query

---

### Phase 2: Enhance Database Abstraction Layer (Priority: HIGH)

**Objective:** Add support for complex queries and raw SQL when needed.

**Tasks:**

1. **Add pg Client Support for Raw SQL**
   - [ ] Install and configure `pg` package (already in dependencies)
   - [ ] Create connection pool for Supabase PostgreSQL
   - [ ] Update `run()` method to use pg client for Supabase
   - [ ] Update `query()` method to use pg client for Supabase
   - [ ] Add connection pooling configuration
   - [ ] Add proper error handling and connection cleanup

2. **Add Complex Query Helpers**
   - [ ] Add `join()` method for JOIN queries
   - [ ] Add `aggregate()` method for COUNT, SUM, etc.
   - [ ] Add `transaction()` method for transaction support
   - [ ] Document usage patterns

3. **Improve Query Builder Support**
   - [ ] Enhance `all()` method to support JOINs via Supabase query builder
   - [ ] Add support for `select()` with specific columns
   - [ ] Add support for `groupBy()`, `having()`
   - [ ] Add support for subqueries

**Estimated Time:** 2-3 days

**Deliverables:**
- Enhanced `server/db/index.js` with pg client support
- New helper methods for complex queries
- Updated documentation

---

### Phase 3: Data Migration Strategy (Priority: MEDIUM)

**Objective:** Migrate existing production data from SQLite to Supabase.

**Tasks:**

1. **Data Migration Script Development**
   - [ ] Review existing migration script (`scripts/migrate-data-sqlite-to-supabase.js`)
   - [ ] Enhance script to handle all tables
   - [ ] Add data validation and verification
   - [ ] Add rollback capability
   - [ ] Add progress tracking and logging
   - [ ] Handle foreign key dependencies correctly
   - [ ] Handle JSON field conversion (TEXT → JSONB)

2. **Data Migration Testing**
   - [ ] Test migration on local SQLite database
   - [ ] Verify data integrity after migration
   - [ ] Test foreign key relationships
   - [ ] Test JSON field parsing and conversion
   - [ ] Performance testing for large datasets

3. **Production Migration Plan**
   - [ ] Create backup of production SQLite database
   - [ ] Schedule maintenance window
   - [ ] Execute migration script
   - [ ] Verify data integrity
   - [ ] Update environment variables on Render
   - [ ] Restart application
   - [ ] Monitor for errors

**Estimated Time:** 3-4 days (including testing)

**Deliverables:**
- Production-ready data migration script
- Migration runbook/documentation
- Rollback procedure

---

### Phase 4: Render Deployment Configuration (Priority: HIGH)

**Objective:** Configure Render deployment to use Supabase exclusively.

**Tasks:**

1. **Environment Variables Setup**
   - [ ] Add `SUPABASE_URL` to Render environment variables
   - [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to Render environment variables
   - [ ] Set `REQUIRE_SUPABASE=true` to enforce Supabase requirement
   - [ ] Remove or document `FORCE_SQLITE` (should not be used in production)

2. **Database Migration Execution**
   - [ ] Create script to run Supabase migrations on Render startup (optional)
   - [ ] Or document manual migration execution process
   - [ ] Verify migrations are applied correctly

3. **Application Startup Configuration**
   - [ ] Ensure `server/index.js` validates Supabase on startup (already implemented)
   - [ ] Verify error messages are clear for missing configuration
   - [ ] Test startup with and without Supabase configuration

4. **Health Check Endpoint**
   - [ ] Enhance `/health` endpoint to check Supabase connectivity
   - [ ] Add database status to health check response
   - [ ] Configure Render health checks

**Estimated Time:** 1 day

**Deliverables:**
- Render environment variables configured
- Migration execution documented
- Health check endpoint enhanced

---

### Phase 5: Testing & Validation (Priority: HIGH)

**Objective:** Comprehensive testing of Supabase integration.

**Tasks:**

1. **Unit Testing**
   - [ ] Test all database abstraction layer methods
   - [ ] Test query conversions
   - [ ] Test error handling
   - [ ] Test JSON field handling

2. **Integration Testing**
   - [ ] Test all API endpoints
   - [ ] Test authentication flows
   - [ ] Test CRUD operations for all entities
   - [ ] Test complex queries (JOINs, aggregations)
   - [ ] Test PDF generation (if it queries database)
   - [ ] Test notification system

3. **Performance Testing**
   - [ ] Compare query performance (SQLite vs Supabase)
   - [ ] Test connection pooling
   - [ ] Test concurrent requests
   - [ ] Identify and optimize slow queries

4. **Data Integrity Testing**
   - [ ] Verify all foreign key relationships
   - [ ] Verify data types and constraints
   - [ ] Verify JSON field parsing
   - [ ] Verify timestamp handling

**Estimated Time:** 3-4 days

**Deliverables:**
- Test results and reports
- Performance benchmarks
- Bug fixes and optimizations

---

### Phase 6: Production Deployment (Priority: HIGH)

**Objective:** Deploy to production with zero downtime.

**Tasks:**

1. **Pre-Deployment Checklist**
   - [ ] All code changes reviewed and merged
   - [ ] All tests passing
   - [ ] Data migration script tested
   - [ ] Rollback plan documented
   - [ ] Team notified of deployment

2. **Deployment Steps**
   - [ ] Backup production SQLite database
   - [ ] Run Supabase migrations (if not already done)
   - [ ] Execute data migration script
   - [ ] Verify data in Supabase
   - [ ] Update Render environment variables
   - [ ] Deploy new code to Render
   - [ ] Monitor application logs
   - [ ] Verify health checks passing
   - [ ] Test critical user flows

3. **Post-Deployment**
   - [ ] Monitor error rates
   - [ ] Monitor query performance
   - [ ] Verify all features working
   - [ ] Keep SQLite backup for 30 days
   - [ ] Document any issues encountered

**Estimated Time:** 1 day (deployment) + monitoring

**Deliverables:**
- Production deployment complete
- Post-deployment report
- Lessons learned document

---

## 3. Technical Implementation Details

### 3.1 Converting SQLite JOIN Queries to Supabase

**Example: SQLite Query (from `projects.js`):**
```sql
SELECT p.*, 
 (SELECT COUNT(*) FROM workpackages WHERE projectId = p.id) as workPackageCount
 FROM projects p ORDER BY p.createdAt DESC
```

**Supabase Equivalent:**
```javascript
// Option 1: Using Supabase query builder with count
const { data: projects, error } = await supabase
  .from('projects')
  .select('*, workpackages(count)')
  .order('created_at', { ascending: false });

// Option 2: Separate queries (more reliable)
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

### 3.2 Adding pg Client Support

**Implementation in `server/db/index.js`:**
```javascript
const { Pool } = require('pg');

let pgPool = null;

function getPgPool() {
  if (!pgPool && this.useSupabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    // Extract connection string from Supabase URL
    // Supabase provides connection string in dashboard
    const connectionString = process.env.DATABASE_URL || 
      `postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres`;
    
    pgPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pgPool;
}

async query(sql, params = []) {
  if (this.useSupabase) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  } else {
    // SQLite fallback
    // ... existing code
  }
}
```

**Note:** Need to get PostgreSQL connection string from Supabase dashboard (Settings → Database → Connection string).

### 3.3 JSON Field Handling

**Current Issue:** SQLite stores JSON as TEXT, Supabase stores as JSONB.

**Solution:** Abstraction layer already handles this, but need to ensure:
- Insert/Update: Convert JavaScript objects to JSONB automatically
- Select: Parse JSONB to JavaScript objects automatically
- Migration: Parse TEXT JSON strings when migrating data

**Implementation Check:**
- ✅ `keysToSnakeCase()` and `keysToCamelCase()` handle nested objects
- ⚠️ Need to verify JSON fields are properly stringified for SQLite and passed as objects for Supabase

---

## 4. Risk Assessment & Mitigation

### 4.1 High-Risk Areas

1. **Data Loss During Migration**
   - **Risk:** Production data could be lost or corrupted
   - **Mitigation:** 
     - Comprehensive backup before migration
     - Test migration on copy of production data
     - Verify data integrity after migration
     - Keep SQLite backup for 30 days

2. **Query Performance Degradation**
   - **Risk:** Supabase queries might be slower than SQLite
   - **Mitigation:**
     - Performance testing before production
     - Add appropriate indexes (already in migration)
     - Use connection pooling
     - Monitor query performance in production

3. **Complex Query Failures**
   - **Risk:** Some complex queries might not work with Supabase query builder
   - **Mitigation:**
     - Use pg client for complex queries
     - Test all queries thoroughly
     - Have fallback strategies

4. **Downtime During Migration**
   - **Risk:** Application might be unavailable during migration
   - **Mitigation:**
     - Schedule maintenance window
     - Consider blue-green deployment if possible
     - Have rollback plan ready

### 4.2 Medium-Risk Areas

1. **JSON Field Parsing Issues**
   - **Risk:** JSON fields might not parse correctly
   - **Mitigation:** Comprehensive testing of JSON field operations

2. **Foreign Key Constraint Violations**
   - **Risk:** Data migration might violate foreign keys
   - **Mitigation:** Migrate in correct order (users → projects → workpackages/tasks → data tables)

3. **Connection Pool Exhaustion**
   - **Risk:** Too many database connections
   - **Mitigation:** Configure connection pool limits appropriately

---

## 5. Success Criteria

### 5.1 Functional Requirements
- ✅ All API endpoints working correctly
- ✅ All database operations successful
- ✅ All data migrated accurately
- ✅ No data loss
- ✅ All features working as before

### 5.2 Performance Requirements
- ✅ Query response times within acceptable limits (< 500ms for most queries)
- ✅ No connection pool exhaustion
- ✅ Application startup time acceptable

### 5.3 Reliability Requirements
- ✅ No increase in error rates
- ✅ Health checks passing
- ✅ Application stable in production

---

## 6. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Code Audit & Route Standardization | 2-3 days | None |
| Phase 2: Enhance Database Abstraction Layer | 2-3 days | Phase 1 |
| Phase 3: Data Migration Strategy | 3-4 days | Phase 1, Phase 2 |
| Phase 4: Render Deployment Configuration | 1 day | Phase 2 |
| Phase 5: Testing & Validation | 3-4 days | Phase 1, Phase 2, Phase 3 |
| Phase 6: Production Deployment | 1 day | All previous phases |
| **Total** | **12-16 days** | |

**Note:** Phases can be parallelized where possible (e.g., Phase 4 can start after Phase 2).

---

## 7. Recommended Next Steps

### Immediate Actions (This Week)
1. ✅ Complete route audit (identify all direct SQLite queries)
2. ✅ Start Phase 1: Fix direct SQLite queries in `projects.js` and `workpackages.js`
3. ✅ Begin Phase 2: Add pg client support to abstraction layer

### Short-Term (Next 2 Weeks)
1. Complete Phase 1 and Phase 2
2. Develop and test data migration script
3. Begin comprehensive testing

### Medium-Term (Next Month)
1. Complete all testing
2. Execute production migration
3. Monitor and optimize

---

## 8. Additional Considerations

### 8.1 Supabase Features to Leverage
- **Row Level Security (RLS):** Consider implementing for additional security
- **Realtime Subscriptions:** Could be used for real-time updates (future enhancement)
- **Storage:** Could migrate file storage to Supabase Storage (future enhancement)
- **Edge Functions:** Could offload some processing (future enhancement)

### 8.2 Monitoring & Observability
- Set up Supabase dashboard monitoring
- Configure Render logging
- Set up alerts for database errors
- Monitor query performance

### 8.3 Documentation Updates
- Update README with Supabase setup instructions
- Document environment variables
- Update deployment guide
- Document migration process

---

## 9. Conclusion

The migration from SQLite to Supabase is well-positioned with the existing abstraction layer and schema migration. The main work involves:

1. **Standardizing all routes** to use the abstraction layer or Supabase query builder
2. **Enhancing the abstraction layer** to support complex queries via pg client
3. **Migrating production data** safely and accurately
4. **Configuring Render** for Supabase
5. **Comprehensive testing** before production deployment

With proper planning and execution, this migration can be completed successfully with minimal risk and downtime.

---

**Document Version:** 1.0  
**Last Updated:** January 31, 2025  
**Status:** Ready for Implementation
