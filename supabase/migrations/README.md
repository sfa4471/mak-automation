# Supabase Migration Files

This directory contains PostgreSQL migration files for migrating the MAK Automation application from SQLite to Supabase.

## Migration Files

### `20250131000000_initial_schema.sql`
Initial schema migration that creates all database tables:
- `users` - User authentication and authorization
- `projects` - Project master data
- `project_counters` - Atomic project number generation
- `workpackages` - Legacy work package system (deprecated, kept for backward compatibility)
- `tasks` - Primary task/work order entity
- `wp1_data` - Compressive strength report data
- `proctor_data` - Proctor test report data
- `density_reports` - Density test report data
- `rebar_reports` - Rebar inspection reports
- `notifications` - User notifications
- `task_history` - Audit trail for task status changes

## Key Changes from SQLite to PostgreSQL

1. **Data Types:**
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
   - `DATETIME` → `TIMESTAMPTZ`
   - `TEXT` JSON columns → `JSONB` (for better performance and querying)

2. **Naming Conventions:**
   - Column names converted from `camelCase` to `snake_case` (PostgreSQL convention)
   - Example: `createdAt` → `created_at`, `projectId` → `project_id`

3. **Foreign Keys:**
   - Added `ON DELETE CASCADE` or `ON DELETE SET NULL` constraints
   - Better referential integrity

4. **Indexes:**
   - Added strategic indexes for frequently queried columns
   - Improves query performance

## Running Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link to your Supabase project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Run migrations:
   ```bash
   supabase db push
   ```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `20250131000000_initial_schema.sql`
4. Execute the SQL

### Option 3: Using psql (Direct PostgreSQL Connection)

1. Get your database connection string from Supabase dashboard
2. Run:
   ```bash
   psql "your-connection-string" -f supabase/migrations/20250131000000_initial_schema.sql
   ```

## Verification

After running migrations, verify the tables were created:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check table structure
\d users
\d projects
\d tasks
-- etc.
```

## Next Steps

After running the migrations:

1. **Update Application Code:**
   - Replace SQLite queries with Supabase client queries
   - Update column names from camelCase to snake_case
   - Handle JSONB fields (Supabase returns parsed objects)

2. **Data Migration:**
   - Export data from SQLite
   - Transform data (column names, JSON parsing)
   - Import into Supabase

3. **Testing:**
   - Test all CRUD operations
   - Verify foreign key constraints
   - Test JSONB queries

## Notes

- All timestamps use `TIMESTAMPTZ` for timezone-aware storage
- JSON fields are stored as `JSONB` for better performance
- Boolean-like fields use `INTEGER CHECK(...)` to maintain compatibility with existing SQLite data
- The `project_counters` table uses PostgreSQL's atomic operations for safe concurrent access

## Column Name Mapping Reference

| SQLite (camelCase) | PostgreSQL (snake_case) |
|-------------------|------------------------|
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `projectId` | `project_id` |
| `taskId` | `task_id` |
| `userId` | `user_id` |
| `assignedTechnicianId` | `assigned_technician_id` |
| `workPackageId` | `work_package_id` |
| `projectNumber` | `project_number` |
| `projectName` | `project_name` |
| `taskType` | `task_type` |
| `isRead` | `is_read` |

See the migration file for complete mapping.
