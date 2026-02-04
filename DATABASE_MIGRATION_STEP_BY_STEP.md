# Database Migration Step-by-Step Implementation Plan
## Adding `app_settings` Table for Phase 1

---

## Overview

We need to add a new `app_settings` table to store application configuration (like the OneDrive path). This table needs to be created in:
1. **Supabase** (PostgreSQL) - for production/cloud database
2. **SQLite** - for local development fallback

---

## Step 1: Create Supabase Migration File

### 1.1 Create the Migration File

**Location:** `supabase/migrations/`

**Naming Convention:** Use timestamp format: `YYYYMMDDHHMMSS_description.sql`

**File Name:** `20250201000000_add_app_settings.sql` (or use current date/time)

### 1.2 Write the Migration SQL

Create the file: `supabase/migrations/20250201000000_add_app_settings.sql`

```sql
-- Migration: Add app_settings table for application configuration
-- Created: 2025-02-01
-- Purpose: Store OneDrive path and other application settings

-- ============================================================================
-- APP_SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Create index on updated_at for audit purposes
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);

-- Insert default settings
INSERT INTO app_settings (key, value, description) 
VALUES 
  ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.'),
  ('pdf_naming_convention', 'legacy', 'PDF naming convention: "new" for ProjectNumber-TaskName format, "legacy" for old format.')
ON CONFLICT (key) DO NOTHING;

-- Add comment to table
COMMENT ON TABLE app_settings IS 'Application-wide settings stored as key-value pairs';
COMMENT ON COLUMN app_settings.key IS 'Unique setting key (e.g., onedrive_base_path)';
COMMENT ON COLUMN app_settings.value IS 'Setting value (can be NULL)';
COMMENT ON COLUMN app_settings.description IS 'Human-readable description of the setting';
COMMENT ON COLUMN app_settings.updated_by_user_id IS 'User ID who last updated this setting';
```

### 1.3 Verify Migration File

- [ ] File is in `supabase/migrations/` directory
- [ ] File name follows timestamp format
- [ ] SQL syntax is correct (no syntax errors)
- [ ] Uses `IF NOT EXISTS` to be idempotent (safe to run multiple times)

---

## Step 2: Update SQLite Database Initialization

### 2.1 Locate the Database Initialization Code

**File:** `server/database.js`

The SQLite tables are created in the `db.serialize()` block starting around line 22.

### 2.2 Add app_settings Table Creation

Add this code **inside** the `db.serialize()` block, after the existing table creations (around line 230, before the closing of `db.serialize()`):

```javascript
// App Settings table (for OneDrive path and other app-wide settings)
db.run(`CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
)`);

// Create indexes for app_settings
db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at)`);

// Insert default settings (only if they don't exist)
db.run(`INSERT OR IGNORE INTO app_settings (key, value, description) 
VALUES 
  ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.'),
  ('pdf_naming_convention', 'legacy', 'PDF naming convention: "new" for ProjectNumber-TaskName format, "legacy" for old format.')`);
```

### 2.3 Exact Location in database.js

Find where other tables are created (like `tasks`, `wp1_data`, etc.) and add the `app_settings` table creation **after** them but **before** the closing of `db.serialize()`.

**Example placement:**
```javascript
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (...)`);
  
  // Projects table
  db.run(`CREATE TABLE IF NOT EXISTS projects (...)`);
  
  // ... other tables ...
  
  // App Settings table (ADD THIS)
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (...)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_app_settings_key ...`);
  // ... etc ...
  
  // Default credentials setup (this comes after all tables)
  // ...
});
```

---

## Step 3: Run the Migrations

### 3.1 For Supabase (Production/Cloud Database)

#### Option A: Using Supabase CLI (Recommended)

```bash
# Navigate to project root
cd C:\MakAutomation

# Link to your Supabase project (if not already linked)
npx supabase link --project-ref your-project-ref

# Run migrations
npx supabase db push

# Or apply specific migration
npx supabase migration up
```

#### Option B: Manual Execution via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20250201000000_add_app_settings.sql`
4. Paste into SQL Editor
5. Click **Run** or press `Ctrl+Enter`
6. Verify the table was created:
   ```sql
   SELECT * FROM app_settings;
   ```

#### Option C: Using psql (PostgreSQL Client)

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Run the migration file
\i supabase/migrations/20250201000000_add_app_settings.sql

# Or copy-paste the SQL directly
```

### 3.2 For SQLite (Local Development)

SQLite migrations run **automatically** when the server starts, because the table creation code is in `server/database.js`.

**To test:**

1. **Stop your server** (if running)
2. **Delete the SQLite database file** (optional, for clean test):
   ```bash
   # Location: server/mak_automation.db
   # Delete it to test fresh creation
   ```
3. **Start your server:**
   ```bash
   npm start
   # or
   node server/index.js
   ```
4. The `app_settings` table will be created automatically on first run.

**To verify SQLite table was created:**

```bash
# Using sqlite3 command line tool
sqlite3 server/mak_automation.db

# Then run:
.tables
# Should show: app_settings

# Check table structure:
.schema app_settings

# Check default data:
SELECT * FROM app_settings;
```

---

## Step 4: Verify the Migration

### 4.1 Verify Supabase

**Method 1: SQL Query in Supabase Dashboard**
```sql
-- Check table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'app_settings';

-- Check table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'app_settings'
ORDER BY ordinal_position;

-- Check default data
SELECT * FROM app_settings;

-- Expected output:
-- id | key                      | value | description
-- 1  | onedrive_base_path       | NULL  | Base folder path...
-- 2  | pdf_naming_convention     | legacy| PDF naming convention...
```

**Method 2: Using Node.js Script**

Create a test script: `scripts/test-app-settings.js`

```javascript
require('dotenv').config();
const { supabase } = require('../server/db/supabase');

async function testAppSettings() {
  try {
    // Test 1: Check table exists
    const { data, error } = await supabase
      .from('app_settings')
      .select('*');
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('✅ app_settings table exists');
    console.log('📊 Current settings:');
    console.table(data);
    
    // Test 2: Try to insert a test setting
    const { data: insertData, error: insertError } = await supabase
      .from('app_settings')
      .insert({
        key: 'test_setting',
        value: 'test_value',
        description: 'Test setting'
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Insert error:', insertError);
    } else {
      console.log('✅ Insert test passed');
      
      // Clean up: delete test setting
      await supabase
        .from('app_settings')
        .delete()
        .eq('key', 'test_setting');
      console.log('🧹 Test setting cleaned up');
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

testAppSettings();
```

Run it:
```bash
node scripts/test-app-settings.js
```

### 4.2 Verify SQLite

**Method 1: Direct Database Query**

```bash
sqlite3 server/mak_automation.db "SELECT * FROM app_settings;"
```

**Method 2: Using Node.js Script**

Create: `scripts/test-sqlite-settings.js`

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../server/mak_automation.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM app_settings', (err, rows) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  console.log('✅ app_settings table exists');
  console.log('📊 Current settings:');
  console.table(rows);
  
  db.close();
});
```

Run it:
```bash
node scripts/test-sqlite-settings.js
```

---

## Step 5: Update Database Abstraction Layer (if needed)

### 5.1 Check if db.js Supports app_settings

**File:** `server/db/index.js` or `server/db.js`

Verify that the database abstraction layer can handle the `app_settings` table. It should work automatically if it uses generic methods like:
- `db.get('app_settings', { key: '...' })`
- `db.insert('app_settings', {...})`
- `db.update('app_settings', {...}, { key: '...' })`

### 5.2 Test Database Operations

Create a test script: `scripts/test-db-operations.js`

```javascript
require('dotenv').config();
const db = require('../server/db');

async function testDbOperations() {
  try {
    // Test 1: Get setting
    console.log('Test 1: Get setting...');
    const setting = await db.get('app_settings', { key: 'onedrive_base_path' });
    console.log('✅ Get:', setting);
    
    // Test 2: Update setting
    console.log('Test 2: Update setting...');
    const updateResult = await db.update(
      'app_settings',
      { value: 'C:\\Test\\Path', updated_at: new Date().toISOString() },
      { key: 'onedrive_base_path' }
    );
    console.log('✅ Update result:', updateResult);
    
    // Test 3: Get updated setting
    const updated = await db.get('app_settings', { key: 'onedrive_base_path' });
    console.log('✅ Updated setting:', updated);
    
    // Test 4: Reset to NULL
    await db.update(
      'app_settings',
      { value: null, updated_at: new Date().toISOString() },
      { key: 'onedrive_base_path' }
    );
    console.log('✅ Reset to NULL');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDbOperations();
```

---

## Step 6: Troubleshooting

### Common Issues

#### Issue 1: "Table already exists" Error

**Supabase:**
- This is normal if migration was already run
- The `IF NOT EXISTS` clause should prevent this
- If you see this, the table already exists (good!)

**SQLite:**
- Check if `mak_automation.db` already has the table
- Delete the database file to start fresh (⚠️ **WARNING**: This deletes all data!)

#### Issue 2: Foreign Key Constraint Error

**Error:** `FOREIGN KEY constraint failed`

**Solution:**
- The `updated_by_user_id` references `users(id)`
- Make sure `users` table exists before `app_settings`
- In SQLite, ensure foreign keys are enabled:
  ```javascript
  db.run('PRAGMA foreign_keys = ON');
  ```

#### Issue 3: Migration Not Running

**Supabase:**
- Check migration file is in correct directory
- Check file naming follows timestamp format
- Verify Supabase CLI is connected to correct project

**SQLite:**
- Check `server/database.js` has the table creation code
- Verify code is inside `db.serialize()` block
- Check server logs for errors

#### Issue 4: Default Values Not Inserted

**Error:** Settings table exists but is empty

**Solution:**
- Run the INSERT statement manually:
  ```sql
  INSERT OR IGNORE INTO app_settings (key, value, description) 
  VALUES 
    ('onedrive_base_path', NULL, 'Base folder path...'),
    ('pdf_naming_convention', 'legacy', 'PDF naming convention...');
  ```

---

## Step 7: Rollback Plan (if needed)

### 7.1 Rollback Supabase Migration

**Option 1: Drop Table (⚠️ Deletes all data)**
```sql
DROP TABLE IF EXISTS app_settings;
```

**Option 2: Create Rollback Migration**
Create: `supabase/migrations/20250201000001_rollback_app_settings.sql`
```sql
-- Rollback: Remove app_settings table
DROP TABLE IF EXISTS app_settings CASCADE;
```

### 7.2 Rollback SQLite

Simply remove the table creation code from `server/database.js` and restart the server (if you want to remove the table, you'll need to manually delete it from the database file).

---

## Step 8: Checklist

Before moving to Phase 1 implementation, verify:

- [ ] Supabase migration file created: `supabase/migrations/20250201000000_add_app_settings.sql`
- [ ] SQLite table creation code added to `server/database.js`
- [ ] Supabase migration executed successfully
- [ ] SQLite table created (verified by starting server)
- [ ] Default settings inserted in both databases
- [ ] Test scripts run successfully
- [ ] Database operations (get/insert/update) work correctly
- [ ] No errors in server logs

---

## Summary

**What we're doing:**
1. Creating a new `app_settings` table in both Supabase and SQLite
2. This table stores key-value pairs for application settings
3. Default settings are inserted automatically
4. The table supports audit tracking (who updated, when)

**Why two implementations:**
- **Supabase (PostgreSQL)**: For production/cloud database
- **SQLite**: For local development fallback

**Key differences:**
- Supabase uses `BIGSERIAL`, `TIMESTAMPTZ`, `BIGINT`
- SQLite uses `INTEGER`, `DATETIME`, `INTEGER`
- Both have the same logical structure

**Next Steps:**
After completing this migration, proceed with Phase 1 backend implementation (OneDrive service and API routes).

---

**End of Database Migration Plan**
