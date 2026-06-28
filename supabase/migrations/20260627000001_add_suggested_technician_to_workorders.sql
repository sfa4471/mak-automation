-- Advisory-only column: stores the agent's suggested technician for a workorder.
-- No notification fires from this column — it is purely for display purposes.
ALTER TABLE workorders ADD COLUMN IF NOT EXISTS suggested_technician_id INTEGER REFERENCES users(id);
