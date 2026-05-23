ALTER TABLE pending_notifications
  ADD COLUMN IF NOT EXISTS engagement_notes TEXT;
