/**
 * Full Create Project form. Do NOT replace with a simplified version.
 * Required: project number, tenant logo, To/Cc/Bcc emails, customer details,
 * billing/shipping addresses, optional drawings upload. See commit 8b75d4f as reference.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, SoilSpecs, ConcreteSpecs, CustomerDetails } from '../../api/projects';
import { tenantsAPI, TenantMe } from '../../api/tenants';
import './Admin.css';

const DEFAULT_LOGO = '/MAK logo_consulting.jpg';
const DEFAULT_COMPANY_NAME = 'MAK Lone Star Consulting';

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const SOIL_STRUCTURE_TYPES = [
  'Building Pad',
  'Parking Lot',
  'Side Walk',
  'Approach',
  'Utilities',
  'Other'
];

const CONCRETE_STRUCTURE_TYPES = [
  'Slab',
  'Grade Beams',
  'Piers',
  'Side Walk',
  'Paving',
  'Curb',
  'Other'
];

// Characters invalid for folder names (Windows); server will sanitize, but we warn the user
const INVALID_PROJECT_NUMBER_CHARS = /[\\/:*?"<>|]/;

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [projectNumber, setProjectNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [customerEmailsStr, setCustomerEmailsStr] = useState('');
  const [ccEmailsStr, setCcEmailsStr] = useState('');
  const [bccEmailsStr, setBccEmailsStr] = useState('');
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({});
  const [soilSpecs, setSoilSpecs] = useState<SoilSpecs>({});
  const [concreteSpecs, setConcreteSpecs] = useState<ConcreteSpecs>({});
  const [showSoilSpecs, setShowSoilSpecs] = useState(false);
  const [showConcreteSpecs, setShowConcreteSpecs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [drawingFiles, setDrawingFiles] = useState<File[]>([]);

  useEffect(() => {
    tenantsAPI.getMe().then(setTenant).catch(() => setTenant(null));
  }, []);

  const parseEmailString = useCallback((str: string): string[] => {
    if (!str || typeof str !== 'string') return [];
    return str.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  }, []);

  const copyEmailsToClipboard = useCallback(async (emailStr: string) => {
    const list = parseEmailString(emailStr);
    const text = list.length ? list.join('; ') : emailStr.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [parseEmailString]);

  const updateCustomerDetail = useCallback(<K extends keyof CustomerDetails>(key: K, value: CustomerDetails[K]) => {
    setCustomerDetails(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateBillingAddress = useCallback((field: 'street1' | 'street2' | 'city' | 'state' | 'zipCode', value: string) => {
    setCustomerDetails(prev => ({
      ...prev,
      billingAddress: { ...prev.billingAddress, [field]: value }
    }));
  }, []);

  const updateShippingAddress = useCallback((field: 'street1' | 'street2' | 'city' | 'state' | 'zipCode', value: string) => {
    setCustomerDetails(prev => ({
      ...prev,
      shippingAddress: { ...prev.shippingAddress, [field]: value }
    }));
  }, []);

  const validateSoilSpecs = (): boolean => {
    // Soil Specs only have densityPct and moistureRange, no temperature validation needed
    // Validation can be added here if needed in the future
    return true;
  };

  const updateSoilSpec = (structureType: string, field: string, value: any) => {
    // Use functional update to ensure we have the latest state
    setSoilSpecs(prev => {
      const updated = {
        ...prev,
        [structureType]: {
          ...prev[structureType],
          [field]: value
        }
      };
      // Debug: Log state update
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Updated soil spec: ${structureType}.${field} = ${value}`, updated[structureType]);
      }
      return updated;
    });
    // Clear validation error for this field
    const errorKey = `soil-${structureType}-${field}`;
    if (validationErrors[errorKey]) {
      const newErrors = { ...validationErrors };
      delete newErrors[errorKey];
      setValidationErrors(newErrors);
    }
  };

  const updateConcreteSpec = (structureType: string, field: string, value: any) => {
    setConcreteSpecs({
      ...concreteSpecs,
      [structureType]: {
        ...concreteSpecs[structureType],
        [field]: value
      }
    });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    const trimmedProjectNumber = projectNumber.trim();
    if (!trimmedProjectNumber) {
      setError('Project number is required');
      return;
    }
    if (INVALID_PROJECT_NUMBER_CHARS.test(trimmedProjectNumber)) {
      setError('Project number cannot contain: \\ / : * ? " < > |');
      return;
    }

    const validTo = parseEmailString(customerEmailsStr);
    const validCc = parseEmailString(ccEmailsStr);
    const validBcc = parseEmailString(bccEmailsStr);

    if (validTo.length === 0) {
      setError('At least one customer (To) email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of validTo) {
      if (!emailRegex.test(email)) {
        setError(`Invalid To email: ${email}`);
        return;
      }
    }
    for (const email of validCc) {
      if (!emailRegex.test(email)) {
        setError(`Invalid Cc email: ${email}`);
        return;
      }
    }
    for (const email of validBcc) {
      if (!emailRegex.test(email)) {
        setError(`Invalid Bcc email: ${email}`);
        return;
      }
    }

    // Validate soil specs if shown
    if (showSoilSpecs && !validateSoilSpecs()) {
      setError('Please fix validation errors in Concrete Specs');
      return;
    }

    const MAX_DRAWINGS = 10;
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (drawingFiles.length > MAX_DRAWINGS) {
      setError(`Maximum ${MAX_DRAWINGS} PDF drawings allowed.`);
      return;
    }
    for (const f of drawingFiles) {
      if (f.size > MAX_SIZE) {
        setError(`File "${f.name}" is too large. Max 20MB per file.`);
        return;
      }
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        setError('Only PDF files are allowed for drawings.');
        return;
      }
    }

    setLoading(true);

    try {
      const created = await projectsAPI.create({
        projectNumber: trimmedProjectNumber,
        projectName,
        customerEmails: validTo,
        ccEmails: validCc.length > 0 ? validCc : undefined,
        bccEmails: validBcc.length > 0 ? validBcc : undefined,
        customerDetails: Object.keys(customerDetails).length > 0 ? customerDetails : undefined,
        soilSpecs: showSoilSpecs && Object.keys(soilSpecs).length > 0 ? soilSpecs : undefined,
        concreteSpecs: showConcreteSpecs && Object.keys(concreteSpecs).length > 0 ? concreteSpecs : undefined
      });

      if (drawingFiles.length > 0) {
        try {
          await projectsAPI.uploadDrawings(created.id, drawingFiles);
        } catch (uploadErr: any) {
          setError(uploadErr.response?.data?.error || 'Project created but drawings upload failed. You can add drawings in Project Details.');
          setLoading(false);
          return;
        }
      }

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-container">
        <header className="create-project-header">
          <div className="header-logo">
            {!logoError ? (
              <img 
                src={tenant?.logoPath ? `/${tenant.logoPath}` : encodeURI(DEFAULT_LOGO)}
                alt={tenant?.name || DEFAULT_COMPANY_NAME}
                className="company-logo"
                onError={(e) => {
                  console.error('Logo failed to load:', e);
                  setLogoError(true);
                }}
                onLoad={() => setLogoError(false)}
              />
            ) : (
              <span>{tenant?.name || DEFAULT_COMPANY_NAME}</span>
            )}
          </div>
          <h1>Create New Project</h1>
        </header>
        <form onSubmit={handleSubmit} className="admin-form">
          <div className="form-group">
            <label htmlFor="projectNumber">Project Number *</label>
            <input
              type="text"
              id="projectNumber"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              required
              placeholder="e.g. 02-2025-0001 or MAK-2025-001"
            />
            <small>Avoid: \ / : * ? &quot; &lt; &gt; | (used for folder name)</small>
          </div>
          <div className="form-group">
            <label htmlFor="projectName">Project Name *</label>
            <input
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              placeholder="e.g., Storage 365, NEC of Country Club Rd & Hobson Rd"
            />
          </div>

          <div className="form-group email-with-copy">
            <label htmlFor="customerEmails">To (Customer Emails) *</label>
            <div className="input-with-copy">
              <input
                type="text"
                id="customerEmails"
                value={customerEmailsStr}
                onChange={(e) => setCustomerEmailsStr(e.target.value)}
                placeholder="email1@example.com; email2@example.com"
                className="form-input"
                required
              />
              <button
                type="button"
                onClick={() => copyEmailsToClipboard(customerEmailsStr)}
                className="copy-btn"
                title="Copy all email addresses"
                aria-label="Copy emails"
              >
                <CopyIcon />
              </button>
            </div>
            <small>Separate multiple emails with semicolon (;)</small>
          </div>
          <div className="form-group email-with-copy">
            <label htmlFor="ccEmails">Cc</label>
            <div className="input-with-copy">
              <input
                type="text"
                id="ccEmails"
                value={ccEmailsStr}
                onChange={(e) => setCcEmailsStr(e.target.value)}
                placeholder="cc1@example.com; cc2@example.com"
                className="form-input"
              />
              <button
                type="button"
                onClick={() => copyEmailsToClipboard(ccEmailsStr)}
                className="copy-btn"
                title="Copy CC addresses"
                aria-label="Copy CC emails"
              >
                <CopyIcon />
              </button>
            </div>
            <small>Separate multiple emails with semicolon (;)</small>
          </div>
          <div className="form-group email-with-copy">
            <label htmlFor="bccEmails">Bcc</label>
            <div className="input-with-copy">
              <input
                type="text"
                id="bccEmails"
                value={bccEmailsStr}
                onChange={(e) => setBccEmailsStr(e.target.value)}
                placeholder="bcc1@example.com; bcc2@example.com"
                className="form-input"
              />
              <button
                type="button"
                onClick={() => copyEmailsToClipboard(bccEmailsStr)}
                className="copy-btn"
                title="Copy Bcc addresses"
                aria-label="Copy Bcc emails"
              >
                <CopyIcon />
              </button>
            </div>
            <small>Separate multiple emails with semicolon (;)</small>
          </div>

          <h3 className="form-subsection-title">Customer Details</h3>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label htmlFor="customerTitle">Title</label>
              <input
                type="text"
                id="customerTitle"
                value={customerDetails.title ?? ''}
                onChange={(e) => updateCustomerDetail('title', e.target.value)}
                placeholder="Mr, Ms, Dr, etc."
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerCompany">Company Name</label>
              <input
                type="text"
                id="customerCompany"
                value={customerDetails.companyName ?? ''}
                onChange={(e) => updateCustomerDetail('companyName', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label htmlFor="customerFirstName">First Name</label>
              <input
                type="text"
                id="customerFirstName"
                value={customerDetails.firstName ?? ''}
                onChange={(e) => updateCustomerDetail('firstName', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerMiddleName">Middle Name</label>
              <input
                type="text"
                id="customerMiddleName"
                value={customerDetails.middleName ?? ''}
                onChange={(e) => updateCustomerDetail('middleName', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerLastName">Last Name</label>
              <input
                type="text"
                id="customerLastName"
                value={customerDetails.lastName ?? ''}
                onChange={(e) => updateCustomerDetail('lastName', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label htmlFor="customerPhone">Phone Number</label>
              <input
                type="tel"
                id="customerPhone"
                value={customerDetails.phoneNumber ?? ''}
                onChange={(e) => updateCustomerDetail('phoneNumber', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerMobile">Mobile Number</label>
              <input
                type="tel"
                id="customerMobile"
                value={customerDetails.mobileNumber ?? ''}
                onChange={(e) => updateCustomerDetail('mobileNumber', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label htmlFor="customerWebsite">Website</label>
              <input
                type="url"
                id="customerWebsite"
                value={customerDetails.website ?? ''}
                onChange={(e) => updateCustomerDetail('website', e.target.value)}
                placeholder="https://"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="customerNameOnChecks">Name to Put on Checks</label>
              <input
                type="text"
                id="customerNameOnChecks"
                value={customerDetails.nameOnChecks ?? ''}
                onChange={(e) => updateCustomerDetail('nameOnChecks', e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <h3 className="form-subsection-title">Billing Address</h3>
          <div className="form-group">
            <label htmlFor="billingStreet1">Street Address 1</label>
            <input
              type="text"
              id="billingStreet1"
              value={customerDetails.billingAddress?.street1 ?? ''}
              onChange={(e) => updateBillingAddress('street1', e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="billingStreet2">Street Address 2</label>
            <input
              type="text"
              id="billingStreet2"
              value={customerDetails.billingAddress?.street2 ?? ''}
              onChange={(e) => updateBillingAddress('street2', e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label htmlFor="billingCity">City</label>
              <input
                type="text"
                id="billingCity"
                value={customerDetails.billingAddress?.city ?? ''}
                onChange={(e) => updateBillingAddress('city', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="billingState">State</label>
              <input
                type="text"
                id="billingState"
                value={customerDetails.billingAddress?.state ?? ''}
                onChange={(e) => updateBillingAddress('state', e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="billingZip">Zip Code</label>
              <input
                type="text"
                id="billingZip"
                value={customerDetails.billingAddress?.zipCode ?? ''}
                onChange={(e) => updateBillingAddress('zipCode', e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <h3 className="form-subsection-title">Shipping Address</h3>
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={customerDetails.shippingSameAsBilling ?? false}
                onChange={(e) => updateCustomerDetail('shippingSameAsBilling', e.target.checked)}
              />
              Same as billing address
            </label>
          </div>
          {!(customerDetails.shippingSameAsBilling ?? false) && (
            <>
              <div className="form-group">
                <label htmlFor="shippingStreet1">Street Address 1</label>
                <input
                  type="text"
                  id="shippingStreet1"
                  value={customerDetails.shippingAddress?.street1 ?? ''}
                  onChange={(e) => updateShippingAddress('street1', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="shippingStreet2">Street Address 2</label>
                <input
                  type="text"
                  id="shippingStreet2"
                  value={customerDetails.shippingAddress?.street2 ?? ''}
                  onChange={(e) => updateShippingAddress('street2', e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label htmlFor="shippingCity">City</label>
                  <input
                    type="text"
                    id="shippingCity"
                    value={customerDetails.shippingAddress?.city ?? ''}
                    onChange={(e) => updateShippingAddress('city', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="shippingState">State</label>
                  <input
                    type="text"
                    id="shippingState"
                    value={customerDetails.shippingAddress?.state ?? ''}
                    onChange={(e) => updateShippingAddress('state', e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="shippingZip">Zip Code</label>
                  <input
                    type="text"
                    id="shippingZip"
                    value={customerDetails.shippingAddress?.zipCode ?? ''}
                    onChange={(e) => updateShippingAddress('zipCode', e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setShowSoilSpecs(!showSoilSpecs)}
                style={{
                  padding: '12px 24px',
                  background: showSoilSpecs ? '#007bff' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                {showSoilSpecs ? '−' : '+'} Add Concrete Specs
              </button>
              <button
                type="button"
                onClick={() => setShowConcreteSpecs(!showConcreteSpecs)}
                style={{
                  padding: '12px 24px',
                  background: showConcreteSpecs ? '#007bff' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                {showConcreteSpecs ? '−' : '+'} Add Soil Specs
              </button>
            </div>

            {showSoilSpecs && (
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '16px', fontWeight: '600' }}>Soil Specs</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Structure Type</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Dens. (%)</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Moist. (%) Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SOIL_STRUCTURE_TYPES.map((structureType) => {
                        const spec = soilSpecs[structureType] || {};
                        const moistureRange = spec.moistureRange || {};
                        return (
                          <tr key={structureType}>
                            <td style={{ padding: '10px', border: '1px solid #dee2e6', fontWeight: '500' }}>{structureType}</td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.densityPct || ''}
                                onChange={(e) => updateSoilSpec(structureType, 'densityPct', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  value={moistureRange.min || ''}
                                  onChange={(e) => {
                                    const currentSpec = soilSpecs[structureType] || {};
                                    const currentRange = currentSpec.moistureRange || {};
                                    updateSoilSpec(structureType, 'moistureRange', { min: e.target.value, max: currentRange.max || '' });
                                  }}
                                  placeholder="Min"
                                  style={{ width: '80px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                                />
                                <span>-</span>
                                <input
                                  type="text"
                                  value={moistureRange.max || ''}
                                  onChange={(e) => {
                                    const currentSpec = soilSpecs[structureType] || {};
                                    const currentRange = currentSpec.moistureRange || {};
                                    updateSoilSpec(structureType, 'moistureRange', { min: currentRange.min || '', max: e.target.value });
                                  }}
                                  placeholder="Max"
                                  style={{ width: '80px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showConcreteSpecs && (
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ marginBottom: '15px', fontSize: '16px', fontWeight: '600' }}>Concrete Specs</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Structure Type</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Spec Strength (Psi)</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Ambient Temp (°F)</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Concrete Temp (°F)</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Slump</th>
                        <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #dee2e6' }}>Air Content by Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONCRETE_STRUCTURE_TYPES.map((structureType) => {
                        const spec = concreteSpecs[structureType] || {};
                        return (
                          <tr key={structureType}>
                            <td style={{ padding: '10px', border: '1px solid #dee2e6', fontWeight: '500' }}>{structureType}</td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.specStrengthPsi || ''}
                                onChange={(e) => updateConcreteSpec(structureType, 'specStrengthPsi', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.ambientTempF || '35-95'}
                                onChange={(e) => updateConcreteSpec(structureType, 'ambientTempF', e.target.value)}
                                placeholder="35-95"
                                style={{ 
                                  width: '100%', 
                                  padding: '5px', 
                                  border: '1px solid #ccc',
                                  borderRadius: '3px'
                                }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.concreteTempF || '45-95'}
                                onChange={(e) => updateConcreteSpec(structureType, 'concreteTempF', e.target.value)}
                                placeholder="45-95"
                                style={{ 
                                  width: '100%', 
                                  padding: '5px', 
                                  border: '1px solid #ccc',
                                  borderRadius: '3px'
                                }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.slump || ''}
                                onChange={(e) => updateConcreteSpec(structureType, 'slump', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.airContent || ''}
                                onChange={(e) => updateConcreteSpec(structureType, 'airContent', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Drawings (optional)</label>
            <p className="form-hint">Upload PDF drawings for this project. Technicians will be able to view them in Project Details. Max 10 files, 20MB each.</p>
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => {
                const chosen = e.target.files ? Array.from(e.target.files) : [];
                setDrawingFiles(prev => {
                  const combined = [...prev, ...chosen].slice(0, 10);
                  return combined;
                });
                e.target.value = '';
              }}
            />
            {drawingFiles.length > 0 && (
              <ul className="drawing-files-list" style={{ marginTop: 8, paddingLeft: 20 }}>
                {drawingFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span>{f.name}</span>
                    <span style={{ color: '#666', fontSize: '0.9em' }}>({(f.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setDrawingFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="cancel-button"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button type="button" onClick={() => navigate('/dashboard')} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProject;
