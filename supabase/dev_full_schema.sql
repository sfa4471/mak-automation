-- =============================================================================
-- DEV DB: Full schema in one script (base + multi-tenancy)
-- Use only on a NEW Supabase DEV project. Do not run on production.
-- Run this entire file once in the Dev project SQL Editor.
-- =============================================================================
-- Combines in order:
--   20250131000000_initial_schema.sql
--   20250201000000_add_app_settings.sql
--   20250202000000_add_proctor_correction_factor.sql
--   20250210000000_add_multi_tenancy.sql
-- =============================================================================

-- ============================================================================
-- PART 1: Initial Schema (20250131000000_initial_schema.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  project_number TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  project_spec TEXT,
  customer_email TEXT,
  spec_strength_psi TEXT,
  spec_ambient_temp_f TEXT,
  spec_concrete_temp_f TEXT,
  spec_slump TEXT,
  spec_air_content_by_volume TEXT,
  customer_emails JSONB DEFAULT '[]'::jsonb,
  soil_specs JSONB DEFAULT '{}'::jsonb,
  concrete_specs JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_project_number ON projects(project_number);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

CREATE TABLE IF NOT EXISTS project_counters (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workpackages (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Assigned', 'In Progress', 'Submitted', 'Approved', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW')),
  assigned_to BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_workpackages_project_id ON workpackages(project_id);
CREATE INDEX IF NOT EXISTS idx_workpackages_assigned_to ON workpackages(assigned_to);
CREATE INDEX IF NOT EXISTS idx_workpackages_status ON workpackages(status);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  task_type TEXT NOT NULL CHECK(task_type IN ('DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP')),
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED_NEEDS_FIX')),
  assigned_technician_id BIGINT,
  due_date TEXT,
  scheduled_start_date TEXT,
  scheduled_end_date TEXT,
  location_name TEXT,
  location_notes TEXT,
  engagement_notes TEXT,
  rejection_remarks TEXT,
  resubmission_due_date TEXT,
  field_completed INTEGER DEFAULT 0 CHECK(field_completed IN (0, 1)),
  field_completed_at TIMESTAMPTZ,
  report_submitted INTEGER DEFAULT 0 CHECK(report_submitted IN (0, 1)),
  last_edited_by_user_id BIGINT,
  last_edited_by_role TEXT,
  last_edited_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  proctor_no INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (last_edited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_technician_id ON tasks(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_proctor_no ON tasks(project_id, task_type, proctor_no) WHERE proctor_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS wp1_data (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT UNIQUE,
  work_package_id BIGINT UNIQUE,
  technician TEXT,
  weather TEXT,
  placement_date TEXT,
  spec_strength TEXT,
  spec_strength_days INTEGER DEFAULT 28,
  structure TEXT,
  sample_location TEXT,
  supplier TEXT,
  time_batched TEXT,
  class_mix_id TEXT,
  time_sampled TEXT,
  yards_batched TEXT,
  ambient_temp_measured TEXT,
  ambient_temp_specs TEXT,
  truck_no TEXT,
  ticket_no TEXT,
  concrete_temp_measured TEXT,
  concrete_temp_specs TEXT,
  plant TEXT,
  slump_measured TEXT,
  slump_specs TEXT,
  yards_placed TEXT,
  total_yards TEXT,
  air_content_measured TEXT,
  air_content_specs TEXT,
  water_added TEXT,
  unit_weight TEXT,
  final_cure_method TEXT,
  specimen_no TEXT,
  specimen_qty TEXT,
  specimen_type TEXT,
  cylinders JSONB DEFAULT '[]'::jsonb,
  remarks TEXT,
  last_edited_by_role TEXT,
  last_edited_by_name TEXT,
  last_edited_by_user_id BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (work_package_id) REFERENCES workpackages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wp1_data_task_id ON wp1_data(task_id);
CREATE INDEX IF NOT EXISTS idx_wp1_data_work_package_id ON wp1_data(work_package_id);

CREATE TABLE IF NOT EXISTS proctor_data (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE,
  project_name TEXT,
  project_number TEXT,
  sampled_by TEXT,
  test_method TEXT,
  client TEXT,
  soil_classification TEXT,
  description TEXT,
  maximum_dry_density_pcf TEXT,
  optimum_moisture_percent TEXT,
  opt_moisture_pct NUMERIC,
  max_dry_density_pcf NUMERIC,
  liquid_limit_ll TEXT,
  plastic_limit TEXT,
  plasticity_index TEXT,
  sample_date TEXT,
  calculated_by TEXT,
  reviewed_by TEXT,
  checked_by TEXT,
  percent_passing200 TEXT,
  passing200 JSONB DEFAULT '[]'::jsonb,
  passing200_summary_pct TEXT,
  specific_gravity_g TEXT,
  proctor_points JSONB DEFAULT '[]'::jsonb,
  zav_points JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_proctor_data_task_id ON proctor_data(task_id);
CREATE INDEX IF NOT EXISTS idx_proctor_data_project_number ON proctor_data(project_number);

CREATE TABLE IF NOT EXISTS density_reports (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE,
  client_name TEXT,
  date_performed TEXT,
  structure TEXT,
  structure_type TEXT,
  test_rows JSONB DEFAULT '[]'::jsonb,
  proctors JSONB DEFAULT '[]'::jsonb,
  dens_spec_percent TEXT,
  moist_spec_min TEXT,
  moist_spec_max TEXT,
  spec_density_pct TEXT,
  gauge_no TEXT,
  std_density_count TEXT,
  std_moist_count TEXT,
  trans_depth_in TEXT,
  method_d2922 INTEGER DEFAULT 1 CHECK(method_d2922 IN (0, 1)),
  method_d3017 INTEGER DEFAULT 1 CHECK(method_d3017 IN (0, 1)),
  method_d698 INTEGER DEFAULT 1 CHECK(method_d698 IN (0, 1)),
  proctor_task_id BIGINT,
  proctor_opt_moisture TEXT,
  proctor_max_density TEXT,
  proctor_soil_classification TEXT,
  proctor_soil_classification_text TEXT,
  proctor_description_label TEXT,
  remarks TEXT,
  tech_name TEXT,
  technician_id BIGINT,
  time_str TEXT,
  last_edited_by_role TEXT,
  last_edited_by_user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (proctor_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_density_reports_task_id ON density_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_density_reports_technician_id ON density_reports(technician_id);
CREATE INDEX IF NOT EXISTS idx_density_reports_proctor_task_id ON density_reports(proctor_task_id);

CREATE TABLE IF NOT EXISTS rebar_reports (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL,
  client_name TEXT,
  report_date TEXT,
  inspection_date TEXT,
  general_contractor TEXT,
  location_detail TEXT,
  wire_mesh_spec TEXT,
  drawings TEXT,
  technician_id BIGINT,
  tech_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rebar_reports_task_id ON rebar_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_rebar_reports_technician_id ON rebar_reports(technician_id);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
  is_read INTEGER DEFAULT 0 CHECK(is_read IN (0, 1)),
  related_task_id BIGINT,
  related_work_package_id BIGINT,
  related_project_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (related_work_package_id) REFERENCES workpackages(id) ON DELETE CASCADE,
  FOREIGN KEY (related_project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS task_history (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  actor_role TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_user_id BIGINT,
  action_type TEXT NOT NULL CHECK(action_type IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'REASSIGNED', 'STATUS_CHANGED')),
  note TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_action_type ON task_history(action_type);

-- ============================================================================
-- PART 2: app_settings (20250201000000_add_app_settings.sql)
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
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);
-- Insert default settings (avoids ON CONFLICT so it works with either key or (tenant_id, key) unique)
INSERT INTO app_settings (key, value, description)
SELECT v.key, v.value, v.description
FROM (VALUES
  ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration. Leave empty to use default PDF storage.'),
  ('workflow_base_path', NULL, 'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.'),
  ('pdf_naming_convention', 'legacy', 'PDF naming convention: "new" for ProjectNumber-TaskName format, "legacy" for old format.')
) AS v(key, value, description)
WHERE NOT EXISTS (SELECT 1 FROM app_settings a WHERE a.key = v.key);

-- ============================================================================
-- PART 3: proctor correction factor (20250202000000_add_proctor_correction_factor.sql)
-- ============================================================================

ALTER TABLE proctor_data
ADD COLUMN IF NOT EXISTS corrected_dry_density_pcf TEXT,
ADD COLUMN IF NOT EXISTS corrected_moisture_content_percent TEXT,
ADD COLUMN IF NOT EXISTS apply_correction_factor BOOLEAN DEFAULT false;

-- ============================================================================
-- PART 4: Multi-tenancy (20250210000000_add_multi_tenancy.sql)
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

-- Insert default tenant (avoids ON CONFLICT for re-run safety)
INSERT INTO tenants (id, name, company_address, company_city, company_state, company_zip, company_phone, company_email, project_number_prefix, project_number_format, is_active)
SELECT 1, 'MAK Lone Star Consulting', NULL, NULL, NULL, NULL, NULL, NULL, '02', 'PREFIX-YYYY-NNNN', true
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1);
SELECT setval(pg_get_serial_sequence('tenants', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tenants));

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

INSERT INTO tenant_project_counters (tenant_id, year, next_seq, updated_at)
SELECT 1, year, next_seq, updated_at FROM project_counters
ON CONFLICT (tenant_id, year) DO UPDATE SET
  next_seq = GREATEST(tenant_project_counters.next_seq, EXCLUDED.next_seq),
  updated_at = EXCLUDED.updated_at;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_number_key;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS uq_projects_tenant_project_number;
ALTER TABLE projects ADD CONSTRAINT uq_projects_tenant_project_number UNIQUE (tenant_id, project_number);
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_key;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS uq_app_settings_tenant_key;
ALTER TABLE app_settings ADD CONSTRAINT uq_app_settings_tenant_key UNIQUE (tenant_id, key);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_tenant_email;
ALTER TABLE users ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);

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
