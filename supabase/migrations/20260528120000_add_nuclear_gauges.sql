-- Nuclear gauge registry: one row per physical gauge per tenant
CREATE TABLE IF NOT EXISTS nuclear_gauges (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  model       TEXT NOT NULL,
  nickname    TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_nuclear_gauges_tenant ON nuclear_gauges(tenant_id);

-- Gauge checkout log: one row per checkout event
CREATE TABLE IF NOT EXISTS gauge_checkouts (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gauge_id        BIGINT NOT NULL REFERENCES nuclear_gauges(id) ON DELETE CASCADE,
  technician_id   INTEGER NOT NULL REFERENCES users(id),
  project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  project_name    TEXT,
  destination     TEXT NOT NULL,
  time_out        TIMESTAMPTZ NOT NULL,
  time_in         TIMESTAMPTZ,
  block_closed    BOOLEAN,
  chd             TEXT,
  notes           TEXT,
  log_date        DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gauge_checkouts_gauge    ON gauge_checkouts(gauge_id);
CREATE INDEX IF NOT EXISTS idx_gauge_checkouts_tenant   ON gauge_checkouts(tenant_id, log_date);
CREATE INDEX IF NOT EXISTS idx_gauge_checkouts_tech     ON gauge_checkouts(technician_id);
