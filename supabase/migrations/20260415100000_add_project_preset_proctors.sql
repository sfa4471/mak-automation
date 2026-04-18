-- Optional lab-reported proctor values captured at project setup; used to pre-fill Density workflow Proctor Summary.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS preset_proctors_declared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preset_proctor_rows JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN projects.preset_proctors_declared IS 'When true, preset_proctor_rows are offered to density reports for this project.';
COMMENT ON COLUMN projects.preset_proctor_rows IS 'Array of { proctorNo, description, optMoisture, maxDensity } for density Proctor Summary.';
