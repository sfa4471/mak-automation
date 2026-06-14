-- Add billing fields directly to tasks so a task IS the dispatch.
-- workorder_id links the task to a billing group.
-- clock_in/clock_out/break_minutes/miles are entered by tech (or admin) on the task.
-- The billing engine groups tasks by (technician_id, date) for OT and trip dedup.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS workorder_id   BIGINT      REFERENCES workorders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clock_in       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_out      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_minutes  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS miles          NUMERIC(8,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_workorder ON tasks(workorder_id);
CREATE INDEX IF NOT EXISTS idx_tasks_clock     ON tasks(assigned_technician_id, clock_in);
