-- Add structure_description to density_reports and wp1_data
-- Stores the user-entered location/description for a selected structure type
-- e.g. structure_type = "Slab", structure_description = "North Section 200' x 30'"

ALTER TABLE density_reports ADD COLUMN IF NOT EXISTS structure_description TEXT;
ALTER TABLE wp1_data ADD COLUMN IF NOT EXISTS structure_description TEXT;
