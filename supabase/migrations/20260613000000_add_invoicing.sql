-- Invoicing, billing engine, dispatches, and workorders
-- Implements the Crestfield financial spec:
--   Labor/trip on dispatch (not per-report)
--   Configurable billing cadence per project
--   Rate versioning (never overwrite)
--   Invoice unbilled-pool + claim model

-- ============================================================================
-- 1. ADD BILLING FIELDS TO PROJECTS
-- ============================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS billing_cadence TEXT NOT NULL DEFAULT 'manual'
    CHECK (billing_cadence IN ('per_workorder', 'monthly', 'on_completion', 'manual')),
  ADD COLUMN IF NOT EXISTS taxable BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 2. RATE_SETS — versioned pricing per project
--    Never overwrite; new rates = new row with incremented version.
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_sets (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id           BIGINT  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  effective_date       DATE    NOT NULL DEFAULT CURRENT_DATE,
  -- Labor ($/hr)
  technician_rate      NUMERIC(10,4) NOT NULL DEFAULT 0,
  technician_ot_rate   NUMERIC(10,4) NOT NULL DEFAULT 0,
  -- Trip (exactly one should be nonzero)
  trip_flat            NUMERIC(10,4) NOT NULL DEFAULT 0,
  trip_per_mile        NUMERIC(10,4) NOT NULL DEFAULT 0,
  -- Materials
  cylinder_rate        NUMERIC(10,4) NOT NULL DEFAULT 0,
  nuclear_gauge_rate   NUMERIC(10,4) NOT NULL DEFAULT 0,   -- $/day, mutually exclusive with density_test_rate
  density_test_rate    NUMERIC(10,4) NOT NULL DEFAULT 0,   -- $/test, mutually exclusive with nuclear_gauge_rate
  proctor_rate         NUMERIC(10,4) NOT NULL DEFAULT 0,
  atterberg_rate       NUMERIC(10,4) NOT NULL DEFAULT 0,
  sieve200_rate        NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_rate_sets_project ON rate_sets(tenant_id, project_id);

-- ============================================================================
-- 3. WORKORDERS — billing grouping of dispatches on a project
-- ============================================================================
CREATE TABLE IF NOT EXISTS workorders (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id              BIGINT  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workorder_number        TEXT    NOT NULL,
  description             TEXT,
  status                  TEXT    NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'complete', 'approved')),
  billing_status          TEXT    NOT NULL DEFAULT 'unbilled'
    CHECK (billing_status IN ('unbilled', 'claimed', 'billed')),
  invoiced_on_invoice_id  BIGINT,  -- FK added after invoices table is created
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id, workorder_number)
);

CREATE INDEX IF NOT EXISTS idx_workorders_project   ON workorders(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_workorders_billing   ON workorders(tenant_id, billing_status);

-- ============================================================================
-- 4. DISPATCHES — the physical site visit (one tech, one day)
--    Labor and trip charges live here, not on individual reports.
-- ============================================================================
CREATE TABLE IF NOT EXISTS dispatches (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       BIGINT  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workorder_id     BIGINT  NOT NULL REFERENCES workorders(id) ON DELETE RESTRICT,
  technician_id    BIGINT  NOT NULL REFERENCES users(id),
  dispatch_date    DATE    NOT NULL,
  site_location    TEXT,
  clock_in         TIMESTAMPTZ,
  clock_out        TIMESTAMPTZ,
  break_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  miles            NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (miles >= 0),
  status           TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'complete')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatches_workorder  ON dispatches(workorder_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_project    ON dispatches(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_tech_date  ON dispatches(technician_id, dispatch_date);

-- ============================================================================
-- 5. ADD dispatch_id TO TASKS (nullable — legacy tasks have no dispatch)
-- ============================================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS dispatch_id BIGINT REFERENCES dispatches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_dispatch ON tasks(dispatch_id);

-- ============================================================================
-- 6. INVOICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id           BIGINT  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workorder_id         BIGINT  REFERENCES workorders(id) ON DELETE SET NULL,
  status               TEXT    NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'pushed', 'void')),
  rate_set_version     INTEGER NOT NULL,
  billing_period_start DATE,
  billing_period_end   DATE,
  generated_at         TIMESTAMPTZ,
  subtotal_cents       BIGINT NOT NULL DEFAULT 0,
  tax_cents            BIGINT NOT NULL DEFAULT 0,
  total_cents          BIGINT NOT NULL DEFAULT 0,
  idempotency_key      TEXT UNIQUE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(tenant_id, status);

-- ============================================================================
-- 7. CLOSE THE CIRCULAR FK: workorders → invoices
-- ============================================================================
ALTER TABLE workorders
  ADD CONSTRAINT fk_workorders_invoice
  FOREIGN KEY (invoiced_on_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- ============================================================================
-- 8. INVOICE_LINES — snapshotted line items (rate never re-read after push)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  id              BIGSERIAL PRIMARY KEY,
  invoice_id      BIGINT  NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  source_type     TEXT    NOT NULL
    CHECK (source_type IN (
      'cylinder', 'tech_time', 'tech_ot', 'trip',
      'proctor', 'atterberg', 'sieve200',
      'nuclear_day', 'density_test'
    )),
  source_ref_id   BIGINT,   -- dispatch_id or task_id depending on source_type
  description     TEXT,
  qty             NUMERIC(10,4) NOT NULL DEFAULT 0,
  unit_rate_cents BIGINT NOT NULL DEFAULT 0,
  amount_cents    BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
