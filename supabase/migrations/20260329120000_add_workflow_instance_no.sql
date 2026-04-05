-- Per-project sequence for multi-instance workflows (Rebar, Density, Compressive, Cylinder Pickup).
-- First instance displays as the base label; second+ as "Label 2", "Label 3", … (client-side).
-- Proctor continues to use proctor_no.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_instance_no INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_instance
  ON tasks (project_id, task_type, workflow_instance_no)
  WHERE workflow_instance_no IS NOT NULL;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY project_id, task_type ORDER BY created_at ASC) AS rn
  FROM tasks
  WHERE task_type IN ('REBAR', 'DENSITY_MEASUREMENT', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP')
)
UPDATE tasks t
SET workflow_instance_no = ranked.rn
FROM ranked
WHERE t.id = ranked.id;
