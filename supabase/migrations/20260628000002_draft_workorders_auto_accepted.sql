-- Phase 7: Intake Tier 2 — track which drafts were auto-accepted vs human-reviewed

ALTER TABLE draft_workorders ADD COLUMN IF NOT EXISTS auto_accepted BOOLEAN DEFAULT FALSE;
