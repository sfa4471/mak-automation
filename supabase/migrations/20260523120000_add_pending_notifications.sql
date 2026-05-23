-- Queue table for debounced batch assignment email notifications.
-- Background job reads this every 2 min and fires one consolidated email per tech
-- when the last queued entry for that tech is older than 3 minutes (admin stopped assigning).

CREATE TABLE IF NOT EXISTS pending_notifications (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT    NOT NULL,
  technician_id  BIGINT    NOT NULL,
  technician_email TEXT    NOT NULL,
  task_id        BIGINT    NOT NULL,
  task_type      TEXT      NOT NULL,
  task_label     TEXT      NOT NULL,
  project_id     BIGINT    NOT NULL,
  project_number TEXT,
  project_name   TEXT,
  due_date       TEXT,
  scheduled_start_date TEXT,
  location_name  TEXT,
  assigned_by_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent           BOOLEAN     NOT NULL DEFAULT FALSE,
  sent_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_notif_lookup
  ON pending_notifications(technician_id, sent, created_at);
