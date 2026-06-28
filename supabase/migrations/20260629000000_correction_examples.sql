-- Phase 8: Correction Capture — stores human edits vs AI extractions as labeled examples.
-- These feed back into Claude prompts as few-shot examples to improve accuracy over time.

CREATE TABLE IF NOT EXISTS intake_correction_examples (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
  draft_id      BIGINT  REFERENCES draft_workorders(id),
  correction_type TEXT NOT NULL CHECK (correction_type IN ('scheduling', 'spec')),
  field         TEXT    NOT NULL,
  ai_value      TEXT,
  human_value   TEXT,
  context_snippet TEXT,            -- first 300 chars of raw_source for few-shot context
  source        TEXT DEFAULT 'human' CHECK (source IN ('human', 'outcome')),  -- Phase 9 sets 'outcome'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS correction_examples_tenant_idx
  ON intake_correction_examples(tenant_id, created_at DESC);

ALTER TABLE intake_correction_examples ENABLE ROW LEVEL SECURITY;
