-- Add customer details, billing/shipping address, and CC/BCC emails to projects
-- Customer details and addresses stored as JSONB for flexibility

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS customer_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cc_emails JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bcc_emails JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN projects.customer_details IS 'Customer info: title, firstName, middleName, lastName, companyName, phoneNumber, mobileNumber, website, nameOnChecks, billingAddress, shippingAddress, shippingSameAsBilling';
COMMENT ON COLUMN projects.cc_emails IS 'CC email addresses (array of strings)';
COMMENT ON COLUMN projects.bcc_emails IS 'BCC email addresses (array of strings)';
