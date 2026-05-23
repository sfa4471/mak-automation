ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS scheduled_start_time TEXT;

ALTER TABLE pending_notifications
  ADD COLUMN IF NOT EXISTS scheduled_start_time TEXT;
