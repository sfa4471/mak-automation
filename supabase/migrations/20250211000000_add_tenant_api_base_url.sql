-- Per-tenant backend URL for production client path (workflow path on client's machine)
-- When set, frontend (crestfield.app) uses this URL for API calls so path validation and file I/O run on client's backend.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_base_url TEXT;

COMMENT ON COLUMN tenants.api_base_url IS 'Optional API base URL (e.g. https://client-tunnel.ngrok.io/api). When set, frontend uses it for all API requests so workflow path is validated and used on client backend.';
