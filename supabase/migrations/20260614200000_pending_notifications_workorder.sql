-- Thread workorder_id through pending_notifications so the batch sender
-- can group per workorder and send dispatch emails instead of task emails.
ALTER TABLE pending_notifications
  ADD COLUMN IF NOT EXISTS workorder_id INTEGER REFERENCES workorders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workorder_number TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_time TIME,
  ADD COLUMN IF NOT EXISTS site_location TEXT;
