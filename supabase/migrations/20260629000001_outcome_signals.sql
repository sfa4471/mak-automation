-- Phase 9: Outcome Signals — records whether AI predictions matched real-world outcomes.
-- Populated by outcomeCollector.js (completed workorders) and tasks.js (PE approvals).
-- Stays dormant per tenant until outcome_feedback_min_samples threshold is met.

CREATE TABLE IF NOT EXISTS outcome_signals (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
  draft_workorder_id  BIGINT  REFERENCES draft_workorders(id),
  workorder_id        INTEGER REFERENCES workorders(id),
  signal_type         TEXT    NOT NULL
    CHECK (signal_type IN ('project_match', 'date_match', 'test_type_match', 'pe_approved', 'pe_rejected')),
  predicted_value     TEXT,
  actual_value        TEXT,
  matched             BOOLEAN,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outcome_signals_tenant_idx
  ON outcome_signals(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outcome_signals_draft_idx
  ON outcome_signals(draft_workorder_id, signal_type);

ALTER TABLE outcome_signals ENABLE ROW LEVEL SECURITY;
