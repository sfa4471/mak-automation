# Supabase Migration Summary

## Overview

This document summarizes the PostgreSQL migration files created for migrating the MAK Automation application from SQLite to Supabase.

## Migration File

**File:** `supabase/migrations/20250131000000_initial_schema.sql`

**Status:** ✅ Complete

This single migration file creates all 11 database tables in the correct dependency order.

## Tables Created

1. **users** - User authentication and authorization (ADMIN, TECHNICIAN roles)
2. **projects** - Project master data with JSONB fields for customer emails and specs
3. **project_counters** - Atomic project number generation (02-YYYY-NNNN format)
4. **workpackages** - Legacy work package system (deprecated, kept for backward compatibility)
5. **tasks** - Primary task/work order entity with proctor numbering
6. **wp1_data** - Compressive strength field report data
7. **proctor_data** - Proctor test report data with JSONB chart data
8. **density_reports** - Density test report data with JSONB test rows
9. **rebar_reports** - Rebar inspection reports
10. **notifications** - User notification system
11. **task_history** - Audit trail for task status changes

## Key Design Decisions

### 1. Data Type Conversions

- **Primary Keys:** `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
  - Provides larger ID range and better performance
- **Timestamps:** `DATETIME` → `TIMESTAMPTZ`
  - Timezone-aware timestamps for better date handling
- **JSON Storage:** `TEXT` → `JSONB`
  - Native JSON support with indexing and querying capabilities
  - Better performance for JSON operations

### 2. Naming Conventions

All column names converted from `camelCase` to `snake_case` following PostgreSQL best practices:

- `createdAt` → `created_at`
- `projectId` → `project_id`
- `taskType` → `task_type`
- `assignedTechnicianId` → `assigned_technician_id`

**Note:** The application layer will need to handle this mapping when querying/inserting data.

### 3. Foreign Key Constraints

Added proper referential integrity:
- `ON DELETE CASCADE` for child records that should be deleted with parent
- `ON DELETE SET NULL` for optional foreign keys

### 4. Indexes

Strategic indexes added for:
- Primary lookup columns (IDs, emails, project numbers)
- Frequently filtered columns (status, task_type, role)
- Composite indexes for common query patterns
- Timestamp indexes for sorting

### 5. JSONB Fields

The following fields converted to JSONB:
- `projects.customer_emails` - Array of email addresses
- `projects.soil_specs` - Soil specification object
- `projects.concrete_specs` - Concrete specification object
- `wp1_data.cylinders` - Array of cylinder test data
- `proctor_data.proctor_points` - Array of proctor curve points
- `proctor_data.zav_points` - Array of zero air voids points
- `proctor_data.passing200` - Array of sieve analysis data
- `density_reports.test_rows` - Array of density test rows
- `density_reports.proctors` - Array of proctor references

## Migration Execution

### Prerequisites

1. Supabase project created
2. Supabase CLI installed (optional, for CLI method)
3. Database connection credentials

### Execution Methods

See `supabase/migrations/README.md` for detailed instructions on:
- Using Supabase CLI
- Using Supabase Dashboard
- Using direct PostgreSQL connection

## Post-Migration Tasks

After running the migration, the following tasks need to be completed:

1. **Data Migration**
   - Export data from SQLite
   - Transform column names (camelCase → snake_case)
   - Parse JSON TEXT fields to JSONB
   - Import into Supabase

2. **Application Code Updates**
   - Replace SQLite queries with Supabase client
   - Update column name references
   - Handle JSONB fields (Supabase returns parsed objects)
   - Update foreign key references

3. **Testing**
   - Verify all tables created correctly
   - Test CRUD operations
   - Verify foreign key constraints
   - Test JSONB queries
   - Performance testing

## Column Name Mapping

Complete mapping reference available in `supabase/migrations/README.md`.

## Validation Queries

After migration, run these queries to verify:

```sql
-- Count tables
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Expected: 11 tables

-- Check indexes
SELECT COUNT(*) FROM pg_indexes 
WHERE schemaname = 'public';
-- Expected: Multiple indexes created

-- Verify JSONB columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND data_type = 'jsonb';
-- Expected: 8 JSONB columns
```

## Notes

- All migrations are idempotent (use `IF NOT EXISTS`)
- The migration follows Phase 1 of the SUPABASE_MIGRATION_PLAN.md
- Atomic operations for `project_counters` use PostgreSQL's native capabilities
- Boolean-like fields use `INTEGER CHECK(...)` for SQLite compatibility during data migration

## Support

For questions or issues:
1. Review SUPABASE_MIGRATION_PLAN.md for overall migration strategy
2. Check supabase/migrations/README.md for execution details
3. Verify table structures match application requirements
