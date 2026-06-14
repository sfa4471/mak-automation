-- Add report time to workorders (when the tech must be on-site)
ALTER TABLE workorders
  ADD COLUMN IF NOT EXISTS scheduled_time TIME;
