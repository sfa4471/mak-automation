# Perform Migration - Complete Guide

I've set up everything needed. Here are **two ways** to execute the migration:

## ✅ Method 1: Supabase Dashboard (Recommended - No Password Needed)

This is the **easiest and most secure** method:

### Steps:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project: `hyjuxclsksbyaimvzulq`

2. **Open SQL Editor**
   - Click **"SQL Editor"** in the left sidebar
   - Click **"New query"** button

3. **Copy the Migration SQL**
   - The file is already open: `supabase/migrations/20250131000000_initial_schema.sql`
   - Or run: `node scripts/execute-migration-now.js` to see the SQL
   - Select **ALL** the SQL (Ctrl+A)
   - Copy it (Ctrl+C)

4. **Paste and Run**
   - Paste into the Supabase SQL Editor
   - Click the **"Run"** button (or press Ctrl+Enter)
   - Wait for "Success" message

5. **Verify Tables Created**
   - Go to **"Table Editor"** in left sidebar
   - You should see **11 tables**:
     - users
     - projects
     - project_counters
     - workpackages
     - tasks
     - wp1_data
     - proctor_data
     - density_reports
     - rebar_reports
     - notifications
     - task_history

6. **Verify Programmatically**
   ```bash
   npm run supabase:verify
   ```

---

## ✅ Method 2: Direct PostgreSQL Connection (Requires Password)

If you prefer command-line execution:

### Steps:

1. **Get Database Password**
   - Go to: https://supabase.com/dashboard
   - Select your project
   - Go to: **Settings → Database**
   - Under "Connection string", copy the password
   - Or click "Reset database password" if needed

2. **Add Password to .env**
   ```bash
   # Add this line to .env file:
   SUPABASE_DB_PASSWORD=your-database-password-here
   ```

3. **Run Migration Script**
   ```bash
   node scripts/execute-migration-auto.js
   ```

4. **Verify**
   ```bash
   npm run supabase:verify
   ```

---

## 🎯 Quick Command Reference

```bash
# Show migration SQL
node scripts/execute-migration-now.js

# Open migration file
node scripts/run-migration-via-dashboard.js

# Auto-execute (requires password)
node scripts/execute-migration-auto.js

# Verify tables
npm run supabase:verify
```

---

## ✅ What I've Prepared

1. ✅ **Migration SQL file** - Complete schema with all 11 tables
2. ✅ **Verification script** - Checks all tables exist
3. ✅ **Database abstraction** - Ready for application code
4. ✅ **Data migration script** - Ready to migrate data after tables are created

---

## 🚀 Next Steps After Migration

Once tables are created:

1. **Verify tables:**
   ```bash
   npm run supabase:verify
   ```

2. **Migrate data (if you have SQLite data):**
   ```bash
   npm run supabase:migrate-data
   ```

3. **Test the application** with Supabase

---

## 💡 Recommendation

**Use Method 1 (Dashboard)** - It's:
- ✅ No password needed
- ✅ Visual confirmation
- ✅ Most secure
- ✅ Easiest to use

The migration file is ready at:
`supabase/migrations/20250131000000_initial_schema.sql`

Just copy, paste, and run in Supabase Dashboard!
