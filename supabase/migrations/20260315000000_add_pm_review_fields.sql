-- Add PM review tracking fields to tasks table
-- Tracks whether an admin/PM has started or completed review of a report

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS pm_review_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS pm_review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pm_review_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pm_reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_pm_review_status_check'
      AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_pm_review_status_check
      CHECK (pm_review_status IN ('NOT_STARTED', 'REVIEWING', 'COMPLETED'));
  END IF;
END$$;

