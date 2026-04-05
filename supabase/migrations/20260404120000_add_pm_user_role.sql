-- Allow Project Manager (PM) role for users who review/edit reports alongside Admin.
-- Apply on Supabase; SQLite dev DB has no comparable CHECK on role.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['ADMIN'::text, 'TECHNICIAN'::text, 'PM'::text]));
