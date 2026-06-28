-- Phase 6: Dispatch Tier 2 — technician availability blocks
-- Admins record days a technician is unavailable (PTO, equipment hold, etc.)

CREATE TABLE IF NOT EXISTS technician_availability (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  technician_id INTEGER NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, technician_id, date)
);

ALTER TABLE technician_availability ENABLE ROW LEVEL SECURITY;
