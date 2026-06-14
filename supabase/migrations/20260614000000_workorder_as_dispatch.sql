-- Add dispatch fields to workorders
ALTER TABLE workorders
  ADD COLUMN IF NOT EXISTS assigned_technician_id INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS site_location TEXT,
  ADD COLUMN IF NOT EXISTS clock_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS miles NUMERIC(10,2);

-- Allow 'could_not_access' status on workorders
ALTER TABLE workorders DROP CONSTRAINT IF EXISTS workorders_status_check;
ALTER TABLE workorders ADD CONSTRAINT workorders_status_check
  CHECK (status IN ('open', 'complete', 'approved', 'could_not_access'));

-- Index for tech schedule queries
CREATE INDEX IF NOT EXISTS idx_workorders_tech_date ON workorders(tenant_id, assigned_technician_id, scheduled_date);
