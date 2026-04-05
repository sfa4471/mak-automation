-- Add multi-spec columns for density reports (Phase 2: dynamic density/moisture columns)
-- dens_specs: array of density % values, moist_specs: array of { min, max } objects

ALTER TABLE density_reports
  ADD COLUMN IF NOT EXISTS dens_specs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS moist_specs JSONB DEFAULT '[]'::jsonb;

-- Backfill from legacy single columns so existing reports keep working
UPDATE density_reports
SET
  dens_specs = CASE
    WHEN dens_spec_percent IS NOT NULL AND trim(dens_spec_percent) <> '' THEN jsonb_build_array(dens_spec_percent)
    ELSE '[]'::jsonb
  END,
  moist_specs = CASE
    WHEN (moist_spec_min IS NOT NULL AND trim(moist_spec_min) <> '') OR (moist_spec_max IS NOT NULL AND trim(moist_spec_max) <> '') THEN
      jsonb_build_array(jsonb_build_object('min', COALESCE(moist_spec_min, ''), 'max', COALESCE(moist_spec_max, '')))
    ELSE '[]'::jsonb
  END
WHERE dens_specs = '[]'::jsonb OR moist_specs = '[]'::jsonb;
