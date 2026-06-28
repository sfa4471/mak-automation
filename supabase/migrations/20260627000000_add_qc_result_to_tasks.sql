-- Add QC result storage to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qc_result JSONB;

-- Add QC_CHECK_COMPLETED to task_history audit trail
ALTER TABLE task_history DROP CONSTRAINT IF EXISTS task_history_action_type_check;
ALTER TABLE task_history ADD CONSTRAINT task_history_action_type_check
  CHECK (action_type IN (
    'SUBMITTED', 'APPROVED', 'UNAPPROVED', 'REJECTED', 'REASSIGNED', 'STATUS_CHANGED',
    'QC_CHECK_COMPLETED'
  ));
