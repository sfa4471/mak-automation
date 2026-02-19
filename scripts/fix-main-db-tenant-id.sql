-- Run this in your MAIN Supabase project (hyjuxclsksbyaimvzulq)
-- SQL Editor: https://supabase.com/dashboard → your main project → SQL Editor
--
-- Your main DB has the old schema (no tenant_id). This script:
-- 1. Creates tenants table + default tenant if needed
-- 2. Adds tenant_id column to tables that don't have it
-- 3. Sets tenant_id = 1 on existing rows so the app shows them

-- Step 1: Create tenants table if not exists and ensure default tenant
CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  logo_path TEXT,
  primary_color TEXT DEFAULT '#007bff',
  secondary_color TEXT DEFAULT '#6c757d',
  project_number_prefix TEXT DEFAULT '02',
  project_number_format TEXT DEFAULT 'PREFIX-YYYY-NNNN',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO tenants (id, name, project_number_prefix, project_number_format, is_active)
VALUES (1, 'Default', '02', 'PREFIX-YYYY-NNNN', true)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Add tenant_id column to each table (ignore error if column already exists)
DO $$ BEGIN
  ALTER TABLE projects ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE workpackages ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Step 3: Set tenant_id = 1 on all existing rows
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE workpackages SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
