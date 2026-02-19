-- Add drawings list to projects (PDF drawings uploaded at creation or later)
-- Each entry: { "filename": "stored-name.pdf", "displayName": "optional label" }
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS drawings JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN projects.drawings IS 'Array of { filename, displayName? } for uploaded PDF drawings';
