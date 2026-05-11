-- Private bucket for project PDF drawings (served via API with service role).
-- Server default bucket id: project-drawings (override with SUPABASE_PROJECT_DRAWINGS_BUCKET).
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-drawings', 'project-drawings', false)
ON CONFLICT (id) DO NOTHING;
