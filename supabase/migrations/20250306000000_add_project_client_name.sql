-- Add Client Name to project information (after Project name/address)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT;
