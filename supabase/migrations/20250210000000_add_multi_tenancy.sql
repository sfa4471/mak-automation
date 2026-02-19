-- Multi-Tenancy Migration for MAK Automation SaaS
-- Per SAAS_CONVERSION_MASTER_PLAN.md Section 4
-- Run in DEV Supabase project first. Do not run on production until ready.
-- Created: 2025-02-10

-- ============================================================================
-- STEP 1: Create new tables (tenants, tenant_project_counters)
-- ============================================================================

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

  workflow_config JSONB DEFAULT '{}'::jsonb,
  workflow_base_path TEXT,

  is_active BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain) WHERE subdomain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

CREATE TABLE IF NOT EXISTS tenant_project_counters (
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id, year)
);

CREATE INDEX IF NOT EXISTS idx_tenant_project_counters_tenant_year ON tenant_project_counters(tenant_id, year);

-- ============================================================================
-- STEP 2: Add tenant_id to all tenant-scoped tables (nullable first)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE workpackages ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE wp1_data ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE proctor_data ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE density_reports ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE rebar_reports ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE task_history ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE;

-- ============================================================================
-- STEP 3: Insert default tenant (MAK)
-- ============================================================================

INSERT INTO tenants (
  id, name,
  company_address, company_city, company_state, company_zip, company_phone, company_email,
  project_number_prefix, project_number_format, is_active
) VALUES (
  1, 'MAK Lone Star Consulting',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '02', 'PREFIX-YYYY-NNNN', true
) ON CONFLICT (id) DO NOTHING;

-- Ensure sequence is set for manual id=1 if needed
SELECT setval(pg_get_serial_sequence('tenants', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tenants));

-- ============================================================================
-- STEP 4: Backfill tenant_id = 1 for all existing rows
-- ============================================================================

UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE workpackages SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE wp1_data SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE proctor_data SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE density_reports SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE rebar_reports SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE notifications SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE task_history SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE app_settings SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Backfill tenant_project_counters from project_counters for tenant 1
INSERT INTO tenant_project_counters (tenant_id, year, next_seq, updated_at)
SELECT 1, year, next_seq, updated_at FROM project_counters
ON CONFLICT (tenant_id, year) DO UPDATE SET
  next_seq = GREATEST(tenant_project_counters.next_seq, EXCLUDED.next_seq),
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- STEP 5: Drop old unique constraints and add tenant-scoped uniques
-- ============================================================================

-- projects: (tenant_id, project_number) unique
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_number_key;
ALTER TABLE projects ADD CONSTRAINT uq_projects_tenant_project_number UNIQUE (tenant_id, project_number);

-- app_settings: (tenant_id, key) unique
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_key;
ALTER TABLE app_settings ADD CONSTRAINT uq_app_settings_tenant_key UNIQUE (tenant_id, key);

-- users: (tenant_id, email) unique (allows same email in different tenants)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);

-- ============================================================================
-- STEP 6: Make tenant_id NOT NULL on all tables
-- ============================================================================

ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE workpackages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE wp1_data ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE proctor_data ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE density_reports ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rebar_reports ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE task_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE app_settings ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================================
-- STEP 7: Add indexes on tenant_id for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workpackages_tenant_id ON workpackages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wp1_data_tenant_id ON wp1_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proctor_data_tenant_id ON proctor_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_density_reports_tenant_id ON density_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rebar_reports_tenant_id ON rebar_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_history_tenant_id ON task_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_tenant_id ON app_settings(tenant_id);
