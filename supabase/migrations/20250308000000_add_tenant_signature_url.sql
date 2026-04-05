-- Add signature image URL for PDF report footer (uploaded in Settings)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN tenants.signature_url IS 'Relative path or URL to uploaded signature image for PDF reports';
