# Quick Migration Reference

## 🚀 Quick Start

### 1. Setup (One-time)
```bash
# Set up Supabase environment variables
npm run supabase:setup
# Or manually add to .env:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Verify connection
npm run supabase:verify-connection
```

### 2. Create Tables
**Option A: Supabase Dashboard** (Easiest)
1. Go to Supabase Dashboard → SQL Editor
2. Copy `supabase/migrations/20250131000000_initial_schema.sql`
3. Paste and Run

**Option B: Supabase CLI**
```bash
supabase link --project-ref your-project-ref
supabase db push
```

**Option C: psql**
```bash
# Set DATABASE_URL first
export DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
./scripts/migrate-with-psql.sh
```

### 3. Verify Tables
```bash
npm run supabase:verify
```

### 4. Migrate Data
```bash
npm run supabase:migrate-data
```

## 📋 NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run supabase:setup` | Set up environment variables |
| `npm run supabase:verify-connection` | Test Supabase connection |
| `npm run supabase:migrate` | Show migration instructions |
| `npm run supabase:verify` | Verify tables were created |
| `npm run supabase:migrate-data` | Migrate data from SQLite |

## 📁 Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20250131000000_initial_schema.sql` | Database schema migration |
| `server/db/supabase.js` | Supabase client module |
| `server/db/index.js` | Database abstraction layer |
| `scripts/verify-supabase-tables.js` | Table verification |
| `scripts/migrate-data-sqlite-to-supabase.js` | Data migration |

## 🔍 Troubleshooting

### Connection Issues
```bash
# Verify environment variables
cat .env | grep SUPABASE

# Test connection
npm run supabase:verify-connection
```

### Migration Issues
- Check Supabase project is active
- Verify credentials are correct
- Check network connectivity

### Data Migration Issues
- Ensure SQLite database exists: `server/mak_automation.db`
- Verify tables were created first
- Check foreign key relationships

## 📚 Documentation

- **Full Guide**: `MIGRATION_GUIDE.md`
- **Migration Plan**: `SUPABASE_MIGRATION_PLAN.md`
- **Column Mapping**: `supabase/COLUMN_MAPPING.md`
- **Steps Completed**: `MIGRATION_STEPS_COMPLETED.md`

## ⚡ Quick Commands

```bash
# Complete migration workflow
npm run supabase:setup                    # 1. Setup
# (Run migration in Dashboard)            # 2. Create tables
npm run supabase:verify                   # 3. Verify
npm run supabase:migrate-data             # 4. Migrate data
```

## 🔄 Rollback

To rollback to SQLite:
```env
FORCE_SQLITE=true
```

Or remove Supabase variables from `.env`.
