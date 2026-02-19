-- Add correction factor fields to proctor_data table
-- These fields are used when oversize correction factor is applied to proctor test results

ALTER TABLE proctor_data 
ADD COLUMN IF NOT EXISTS corrected_dry_density_pcf TEXT,
ADD COLUMN IF NOT EXISTS corrected_moisture_content_percent TEXT,
ADD COLUMN IF NOT EXISTS apply_correction_factor BOOLEAN DEFAULT false;
