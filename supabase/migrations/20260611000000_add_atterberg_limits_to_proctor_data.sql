-- Add atterberg_limits column to proctor_data so raw dish data persists across devices/sessions.
-- Without this, admins opening a technician's proctor task see empty Atterberg tables,
-- and clicking Next overwrites the saved liquidLimitLL/plasticLimit values with empty strings.
ALTER TABLE proctor_data
  ADD COLUMN IF NOT EXISTS atterberg_limits JSONB DEFAULT '[]'::jsonb;
