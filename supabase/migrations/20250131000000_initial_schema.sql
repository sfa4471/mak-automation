-- Initial Schema Migration for MAK Automation
-- Converts SQLite schema to PostgreSQL/Supabase
-- Created by: Senior Data Engineer
-- Date: 2025-01-31

-- Enable UUID extension (if needed in future)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  project_number TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  project_spec TEXT,
  customer_email TEXT, -- Legacy field, kept for backward compatibility
  spec_strength_psi TEXT,
  spec_ambient_temp_f TEXT,
  spec_concrete_temp_f TEXT,
  spec_slump TEXT,
  spec_air_content_by_volume TEXT,
  -- New JSON fields (stored as JSONB for better performance and querying)
  customer_emails JSONB DEFAULT '[]'::jsonb,
  soil_specs JSONB DEFAULT '{}'::jsonb,
  concrete_specs JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_project_number ON projects(project_number);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- PROJECT_COUNTERS TABLE
-- ============================================================================
-- Used for atomic project number generation (02-YYYY-NNNN format)
CREATE TABLE IF NOT EXISTS project_counters (
  year INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- WORKPACKAGES TABLE
-- ============================================================================
-- Deprecated - use tasks instead, kept for backward compatibility
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

-- Indexes for workpackages
CREATE INDEX IF NOT EXISTS idx_workpackages_project_id ON workpackages(project_id);
CREATE INDEX IF NOT EXISTS idx_workpackages_assigned_to ON workpackages(assigned_to);
CREATE INDEX IF NOT EXISTS idx_workpackages_status ON workpackages(status);

-- ============================================================================
-- TASKS TABLE
-- ============================================================================
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
  -- Proctor-specific field
  proctor_no INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (last_edited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for tasks
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_technician_id ON tasks(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_proctor_no ON tasks(project_id, task_type, proctor_no) WHERE proctor_no IS NOT NULL;

-- ============================================================================
-- WP1_DATA TABLE (Compressive Strength Field Report)
-- ============================================================================
-- Supports both taskId (new) and workPackageId (backward compatibility)
CREATE TABLE IF NOT EXISTS wp1_data (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT UNIQUE,
  work_package_id BIGINT UNIQUE,
  
  -- Placement Information
  technician TEXT,
  weather TEXT,
  placement_date TEXT,
  spec_strength TEXT,
  spec_strength_days INTEGER DEFAULT 28,
  
  -- Sample Information
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
  
  -- Specimen Information
  specimen_no TEXT,
  specimen_qty TEXT,
  specimen_type TEXT,
  
  -- Cylinder data stored as JSONB (converted from TEXT JSON)
  cylinders JSONB DEFAULT '[]'::jsonb,
  
  -- Remarks
  remarks TEXT,
  
  -- Audit fields
  last_edited_by_role TEXT,
  last_edited_by_name TEXT,
  last_edited_by_user_id BIGINT,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (work_package_id) REFERENCES workpackages(id) ON DELETE CASCADE
);

-- Indexes for wp1_data
CREATE INDEX IF NOT EXISTS idx_wp1_data_task_id ON wp1_data(task_id);
CREATE INDEX IF NOT EXISTS idx_wp1_data_work_package_id ON wp1_data(work_package_id);

-- ============================================================================
-- PROCTOR_DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proctor_data (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE,
  
  -- Project Information
  project_name TEXT,
  project_number TEXT,
  
  -- Report Information
  sampled_by TEXT,
  test_method TEXT,
  client TEXT,
  soil_classification TEXT,
  description TEXT, -- Deprecated, kept for backward compatibility
  
  -- Test Results (canonical fields preferred)
  maximum_dry_density_pcf TEXT, -- Legacy field
  optimum_moisture_percent TEXT, -- Legacy field
  opt_moisture_pct NUMERIC, -- Canonical field (preferred)
  max_dry_density_pcf NUMERIC, -- Canonical field (preferred)
  
  -- Additional Test Data
  liquid_limit_ll TEXT,
  plastic_limit TEXT,
  plasticity_index TEXT,
  sample_date TEXT,
  calculated_by TEXT,
  reviewed_by TEXT,
  checked_by TEXT,
  percent_passing200 TEXT,
  passing200 JSONB DEFAULT '[]'::jsonb, -- Converted from TEXT JSON
  passing200_summary_pct TEXT,
  specific_gravity_g TEXT,
  
  -- Chart Data (stored as JSONB)
  proctor_points JSONB DEFAULT '[]'::jsonb, -- Converted from TEXT JSON
  zav_points JSONB DEFAULT '[]'::jsonb, -- Converted from TEXT JSON
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indexes for proctor_data
CREATE INDEX IF NOT EXISTS idx_proctor_data_task_id ON proctor_data(task_id);
CREATE INDEX IF NOT EXISTS idx_proctor_data_project_number ON proctor_data(project_number);

-- ============================================================================
-- DENSITY_REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS density_reports (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE,
  
  -- Report Header
  client_name TEXT,
  date_performed TEXT,
  structure TEXT,
  structure_type TEXT,
  
  -- Test Data (stored as JSONB)
  test_rows JSONB DEFAULT '[]'::jsonb, -- Converted from TEXT JSON
  proctors JSONB DEFAULT '[]'::jsonb, -- Converted from TEXT JSON
  
  -- Specifications
  dens_spec_percent TEXT,
  moist_spec_min TEXT,
  moist_spec_max TEXT,
  spec_density_pct TEXT,
  
  -- Equipment
  gauge_no TEXT,
  std_density_count TEXT,
  std_moist_count TEXT,
  trans_depth_in TEXT,
  
  -- Test Methods (boolean flags)
  method_d2922 INTEGER DEFAULT 1 CHECK(method_d2922 IN (0, 1)),
  method_d3017 INTEGER DEFAULT 1 CHECK(method_d3017 IN (0, 1)),
  method_d698 INTEGER DEFAULT 1 CHECK(method_d698 IN (0, 1)),
  
  -- Proctor Reference
  proctor_task_id BIGINT,
  proctor_opt_moisture TEXT,
  proctor_max_density TEXT,
  proctor_soil_classification TEXT,
  proctor_soil_classification_text TEXT,
  proctor_description_label TEXT,
  
  -- Additional Fields
  remarks TEXT,
  tech_name TEXT,
  technician_id BIGINT,
  time_str TEXT,
  
  -- Audit fields
  last_edited_by_role TEXT,
  last_edited_by_user_id BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (proctor_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for density_reports
CREATE INDEX IF NOT EXISTS idx_density_reports_task_id ON density_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_density_reports_technician_id ON density_reports(technician_id);
CREATE INDEX IF NOT EXISTS idx_density_reports_proctor_task_id ON density_reports(proctor_task_id);

-- ============================================================================
-- REBAR_REPORTS TABLE
-- ============================================================================
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

-- Indexes for rebar_reports
CREATE INDEX IF NOT EXISTS idx_rebar_reports_task_id ON rebar_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_rebar_reports_technician_id ON rebar_reports(technician_id);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
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

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================================
-- TASK_HISTORY TABLE (Audit Trail)
-- ============================================================================
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

-- Indexes for task_history
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_timestamp ON task_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_action_type ON task_history(action_type);

-- ============================================================================
-- COMMENTS
-- ============================================================================
-- This migration creates all tables in the correct dependency order
-- All JSON TEXT columns from SQLite have been converted to JSONB for better
-- performance and querying capabilities in PostgreSQL
-- 
-- Note: Column names have been converted from camelCase to snake_case
-- following PostgreSQL conventions. The application layer will need to
-- handle this mapping when migrating from SQLite to Supabase.
