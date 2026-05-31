-- Allow unregistered (guest) technicians to check out gauges via public QR scan.
-- technician_id becomes nullable; technician_name stores the name for guests.

ALTER TABLE gauge_checkouts ALTER COLUMN technician_id DROP NOT NULL;

ALTER TABLE gauge_checkouts ADD COLUMN IF NOT EXISTS technician_name TEXT;

-- Partial index — only index non-null technician_id rows
DROP INDEX IF EXISTS idx_gauge_checkouts_tech;
CREATE INDEX IF NOT EXISTS idx_gauge_checkouts_tech
  ON gauge_checkouts(technician_id)
  WHERE technician_id IS NOT NULL;
