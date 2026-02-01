# Supabase Migration Guide

This guide walks you through the complete migration from SQLite to Supabase.

## Prerequisites

1. **Supabase Account**: Create a project at https://supabase.com
2. **Environment Variables**: Get your Supabase credentials
3. **Node.js**: Ensure Node.js and npm are installed

## Step 1: Set Up Supabase Environment

1. Get your Supabase credentials:
   - Go to your Supabase project dashboard
   - Navigate to Settings → API
   - Copy your Project URL and Service Role Key

2. Set up environment variables:
   ```bash
   npm run supabase:setup
   ```
   
   Or manually add to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. Verify connection:
   ```bash
   npm run supabase:verify-connection
   ```

## Step 2: Run Database Migration

Create the tables in Supabase by running the migration:

### Option A: Using Supabase Dashboard (Recommended for first-time setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `supabase/migrations/20250131000000_initial_schema.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run**

### Option B: Using Supabase CLI

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Push migrations:
   ```bash
   supabase db push
   ```

### Option C: Using psql (Direct PostgreSQL)

1. Get connection string from Supabase Dashboard → Settings → Database
2. Run:
   ```bash
   # Windows
   set DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
   scripts\migrate-with-psql.bat
   
   # Linux/Mac
   export DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
   ./scripts/migrate-with-psql.sh
   ```

## Step 3: Verify Tables

After running the migration, verify all tables were created:

```bash
npm run supabase:verify
```

This will check that all 11 tables exist and are accessible.

## Step 4: Migrate Data

Migrate your existing SQLite data to Supabase:

```bash
npm run supabase:migrate-data
```

This script will:
- Read data from `server/mak_automation.db`
- Convert column names (camelCase → snake_case)
- Convert JSON TEXT fields to JSONB
- Insert data into Supabase in the correct order (respecting foreign keys)

**Note**: The script handles:
- Column name mapping
- JSON field conversion
- Foreign key relationships
- Batch inserts for large datasets

## Step 5: Update Application Code

The application now has a database abstraction layer that supports both SQLite and Supabase.

### Current Status

- ✅ Database abstraction layer created (`server/db/index.js`)
- ✅ Supabase client module created (`server/db/supabase.js`)
- ⚠️ Route files still use SQLite directly

### Next Steps for Code Migration

1. **Update route files** to use the new database abstraction:
   ```javascript
   // Old (SQLite)
   const db = require('../database');
   db.get('SELECT * FROM users WHERE id = ?', [id], callback);
   
   // New (Abstraction layer - works with both)
   const db = require('../db');
   const user = await db.get('users', { id });
   ```

2. **Convert callbacks to async/await**:
   ```javascript
   // Old
   router.get('/users/:id', (req, res) => {
     db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, user) => {
       if (err) return res.status(500).json({ error: err.message });
       res.json(user);
     });
   });
   
   // New
   router.get('/users/:id', async (req, res) => {
     try {
       const user = await db.get('users', { id: req.params.id });
       if (!user) return res.status(404).json({ error: 'User not found' });
       res.json(user);
     } catch (err) {
       res.status(500).json({ error: err.message });
     }
   });
   ```

3. **Update column references** from camelCase to snake_case in queries:
   - The abstraction layer handles this automatically
   - But raw SQL queries need manual updates

## Testing

After migration:

1. **Test database connection**:
   ```bash
   npm run supabase:verify-connection
   ```

2. **Test table access**:
   ```bash
   npm run supabase:verify
   ```

3. **Test application**:
   - Start the server: `npm run dev`
   - Test login, create project, create tasks, etc.
   - Verify data appears correctly

## Rollback Plan

If you need to rollback to SQLite:

1. Set environment variable:
   ```env
   FORCE_SQLITE=true
   ```

2. Or remove Supabase environment variables:
   ```env
   # Comment out or remove
   # SUPABASE_URL=...
   # SUPABASE_SERVICE_ROLE_KEY=...
   ```

The application will automatically fall back to SQLite.

## Troubleshooting

### Migration fails with "table already exists"
- Tables may have been created manually
- The migration uses `IF NOT EXISTS`, so it's safe to run again
- Or drop tables manually and re-run migration

### Data migration fails with foreign key errors
- Ensure tables are created in the correct order
- Check that parent records exist before child records
- Verify column mappings are correct

### Application can't connect to Supabase
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Check network connectivity
- Verify Supabase project is active

### Column name errors
- The abstraction layer handles camelCase ↔ snake_case conversion
- If using raw SQL, update column names manually
- See `supabase/COLUMN_MAPPING.md` for reference

## Migration Checklist

- [ ] Supabase project created
- [ ] Environment variables set
- [ ] Connection verified
- [ ] Tables created (migration run)
- [ ] Tables verified
- [ ] Data migrated
- [ ] Application tested with Supabase
- [ ] Route files updated (if needed)
- [ ] Production deployment plan

## Support

For detailed information:
- Migration plan: `SUPABASE_MIGRATION_PLAN.md`
- Column mapping: `supabase/COLUMN_MAPPING.md`
- Migration summary: `supabase/MIGRATION_SUMMARY.md`
