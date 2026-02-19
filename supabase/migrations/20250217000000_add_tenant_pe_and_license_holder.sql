-- Add P.E. firm registration and license holder fields to tenants
-- Used for Rebar (and other professional) report PDF footer - per client onboarding
-- See REBAR_PDF_TENANT_FOOTER_SPEC.md

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pe_firm_reg TEXT,
  ADD COLUMN IF NOT EXISTS license_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS license_holder_title TEXT;

COMMENT ON COLUMN tenants.pe_firm_reg IS 'P.E. firm registration number (e.g. F-24443) for "Texas Board of Professional Engineers Firm Reg, ..." on reports';
COMMENT ON COLUMN tenants.license_holder_name IS 'License holder name (e.g. "Muhammad Awais Khan, P.E.") for report signature block';
COMMENT ON COLUMN tenants.license_holder_title IS 'License holder title (e.g. "Geotechnical Engineer") for report signature block';
