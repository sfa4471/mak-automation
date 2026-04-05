-- Rebar: editable Method of Test and single Result/Remarks text box
ALTER TABLE rebar_reports ADD COLUMN IF NOT EXISTS method_of_test TEXT;
ALTER TABLE rebar_reports ADD COLUMN IF NOT EXISTS result_remarks TEXT;
