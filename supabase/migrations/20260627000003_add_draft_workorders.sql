-- Phase 5: Intake Parsing + Spec Extraction Tier 1
-- Stores AI-parsed incoming job requests for admin review before creating a workorder.

CREATE TABLE IF NOT EXISTS draft_workorders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'accepted', 'rejected')),
  raw_source TEXT,
  source_type TEXT DEFAULT 'email',
  parsed_project_id INTEGER REFERENCES projects(id),
  parsed_project_name_raw TEXT,
  parsed_scheduled_date DATE,
  parsed_test_types JSONB DEFAULT '[]',
  parsed_site_location TEXT,
  parsed_requester_email TEXT,
  extraction_json JSONB,
  project_match_score NUMERIC,
  parsed_soil_specs JSONB,
  parsed_concrete_specs JSONB,
  spec_extraction_json JSONB,
  attached_doc_types TEXT[],
  spec_conflicts JSONB,
  reviewed_by_user_id INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_workorder_id INTEGER REFERENCES workorders(id),
  specs_applied BOOLEAN DEFAULT FALSE,
  dedup_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS draft_workorders_dedup
  ON draft_workorders(tenant_id, dedup_key)
  WHERE status = 'pending_review';

ALTER TABLE draft_workorders ENABLE ROW LEVEL SECURITY;
