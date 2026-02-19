-- Add company contact name to tenants (for PDFs and Settings)
-- See IMPLEMENTATION_PLAN_TENANT_BRANDING.md

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS company_contact_name TEXT;

COMMENT ON COLUMN tenants.company_contact_name IS 'Primary contact name for company (e.g. for reports and correspondence)';
