-- Create report_deliveries table for tracking emailed reports to clients
-- Ensures idempotency (no duplicate sends per tenant/task/day) and auditability

CREATE TABLE IF NOT EXISTS report_deliveries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | FAILED | SKIPPED
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_deliveries_unique
  ON report_deliveries (tenant_id, task_id, delivery_date);

CREATE INDEX IF NOT EXISTS report_deliveries_by_tenant_project_date
  ON report_deliveries (tenant_id, project_id, delivery_date);

