-- Phase 6: Dispatch Tier 2 — hold window for auto-assigned notifications
-- hold_until: batch sender skips this row until the timestamp passes (30-min window)
-- This lets admins cancel before the email fires.

ALTER TABLE pending_notifications ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;
