-- QuickBooks Online integration
-- Column-level encryption: access_token and refresh_token are stored as
--   AES-256-GCM ciphertext (iv:authTag:ciphertext, hex-encoded, colon-separated).
--   The encryption key lives only in server env (QBO_TOKEN_ENCRYPTION_KEY).
--   Even a full DB dump reveals no usable tokens.

-- ============================================================================
-- 1. TENANT QBO CONNECTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_qbo_connections (
  id                  BIGSERIAL    PRIMARY KEY,
  tenant_id           INTEGER      NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  realm_id            TEXT         NOT NULL,               -- Intuit company ID (not secret)
  -- Column-level AES-256-GCM ciphertext — format: iv:authTag:ciphertext (all hex)
  access_token_enc    TEXT         NOT NULL,
  refresh_token_enc   TEXT         NOT NULL,
  token_expiry        TIMESTAMPTZ  NOT NULL,
  service_item_id     TEXT,                                -- cached QBO Item ID for line items
  connected_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- RLS: defence-in-depth — direct DB connections (dashboard, anon key) see only
-- their own tenant's row. The backend (service role) enforces the same isolation
-- at the application layer via tenant_id filtering in every query.
ALTER TABLE tenant_qbo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY qbo_conn_tenant_isolation ON tenant_qbo_connections
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::integer
  );

CREATE INDEX IF NOT EXISTS idx_qbo_conn_tenant ON tenant_qbo_connections(tenant_id);

-- ============================================================================
-- 2. ADD QBO COLUMNS TO INVOICES
-- ============================================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS qbo_invoice_id     TEXT,        -- Intuit entity ID
  ADD COLUMN IF NOT EXISTS qbo_invoice_number TEXT,        -- DocNumber from QBO (e.g. "MAK-42")
  ADD COLUMN IF NOT EXISTS pushed_at          TIMESTAMPTZ;

-- ============================================================================
-- 3. ADD QBO CUSTOMER ID TO PROJECTS (cached to avoid repeat lookups)
-- ============================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS qbo_customer_id TEXT;
