-- Migration: Add app_settings table for application configuration
-- Created: 2025-02-01
-- Purpose: Store OneDrive path and other application settings
-- Phase: Phase 1 - Settings & Configuration Management

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

-- Add comments for documentation
COMMENT ON TABLE app_settings IS 'Application-wide settings stored as key-value pairs';
COMMENT ON COLUMN app_settings.key IS 'Unique setting key (e.g., onedrive_base_path)';
COMMENT ON COLUMN app_settings.value IS 'Setting value (can be NULL)';
COMMENT ON COLUMN app_settings.description IS 'Human-readable description of the setting';
COMMENT ON COLUMN app_settings.updated_by_user_id IS 'User ID who last updated this setting';
