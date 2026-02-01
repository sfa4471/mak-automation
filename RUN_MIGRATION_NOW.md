# How to Create Tables in Supabase - Step by Step

## Method 1: Using Supabase Dashboard (Easiest - Recommended)

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Sign in to your account
3. Select your project (or create a new one if you haven't)

### Step 2: Open SQL Editor
1. In the left sidebar, click on **"SQL Editor"**
2. Click the **"New query"** button (or use the existing query editor)

### Step 3: Copy the Migration SQL
1. Open the file: `supabase/migrations/20250131000000_initial_schema.sql`
2. Select ALL the contents (Ctrl+A / Cmd+A)
3. Copy it (Ctrl+C / Cmd+C)

### Step 4: Paste and Run
1. Paste the SQL into the Supabase SQL Editor
2. Click the **"Run"** button (or press Ctrl+Enter / Cmd+Enter)
3. Wait for the execution to complete

### Step 5: Verify Tables Were Created
1. In the left sidebar, click on **"Table Editor"**
2. You should see all 11 tables listed:
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

## Method 2: Using Supabase CLI

If you prefer using the command line:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (get project-ref from Supabase Dashboard URL)
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Method 3: Using psql (Direct PostgreSQL)

1. Get your database connection string from:
   - Supabase Dashboard → Settings → Database → Connection string
   - Use the "URI" format

2. Run the migration:
   ```bash
   # Windows PowerShell
   $env:DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   psql $env:DATABASE_URL -f supabase\migrations\20250131000000_initial_schema.sql
   
   # Linux/Mac
   export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   psql $DATABASE_URL -f supabase/migrations/20250131000000_initial_schema.sql
   ```

## Troubleshooting

### "Permission denied" error
- Make sure you're using the **Service Role Key** (not the anon key)
- Or use the Supabase Dashboard method (it uses your account permissions)

### "Table already exists" error
- This is OK - the migration uses `IF NOT EXISTS`
- Tables may have been partially created
- You can safely run the migration again

### Can't find SQL Editor
- Make sure you're in the correct project
- SQL Editor is in the left sidebar under "SQL Editor" or "Database"

## After Migration

Once tables are created, verify them:

```bash
npm run supabase:verify
```

This will check that all tables exist and are accessible.
