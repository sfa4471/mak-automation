import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, SoilSpecs, ConcreteSpecs } from '../../api/projects';
import './Admin.css';

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

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [customerEmails, setCustomerEmails] = useState<string[]>(['']);
  const [soilSpecs, setSoilSpecs] = useState<SoilSpecs>({});
  const [concreteSpecs, setConcreteSpecs] = useState<ConcreteSpecs>({});
  const [showSoilSpecs, setShowSoilSpecs] = useState(false);
  const [showConcreteSpecs, setShowConcreteSpecs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const addCustomerEmail = () => {
    setCustomerEmails([...customerEmails, '']);
  };

  const removeCustomerEmail = (index: number) => {
    if (customerEmails.length > 1) {
      setCustomerEmails(customerEmails.filter((_, i) => i !== index));
    }
  };

  const updateCustomerEmail = (index: number, value: string) => {
    const newEmails = [...customerEmails];
    newEmails[index] = value;
    setCustomerEmails(newEmails);
  };

  const validateSoilSpecs = (): boolean => {
    const errors: { [key: string]: string } = {};
    
    Object.entries(soilSpecs).forEach(([structureType, spec]) => {
      if (spec.ambientTempF) {
        // Validate range format or single value
        const rangeMatch = spec.ambientTempF.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1]);
          const max = parseInt(rangeMatch[2]);
          if (min < 35 || min > 95 || max < 35 || max > 95 || min > max) {
            errors[`soil-${structureType}-ambientTempF`] = 'Range must be 35-95, and min must be ≤ max';
          }
        } else {
          const temp = parseFloat(spec.ambientTempF);
          if (isNaN(temp) || temp < 35 || temp > 95) {
            errors[`soil-${structureType}-ambientTempF`] = 'Must be between 35 and 95';
          }
        }
      }
      if (spec.concreteTempF) {
        // Validate range format or single value
        const rangeMatch = spec.concreteTempF.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          const min = parseInt(rangeMatch[1]);
          const max = parseInt(rangeMatch[2]);
          if (min < 45 || min > 95 || max < 45 || max > 95 || min > max) {
            errors[`soil-${structureType}-concreteTempF`] = 'Range must be 45-95, and min must be ≤ max';
          }
        } else {
          const temp = parseFloat(spec.concreteTempF);
          if (isNaN(temp) || temp < 45 || temp > 95) {
            errors[`soil-${structureType}-concreteTempF`] = 'Must be between 45 and 95';
          }
        }
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateSoilSpec = (structureType: string, field: string, value: string) => {
    let finalValue = value;
    
    // Enforce temperature ranges for ambientTempF and concreteTempF
    if (field === 'ambientTempF' && value) {
      // Parse range or single value
      const rangeMatch = value.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1]);
        const max = parseInt(rangeMatch[2]);
        // Clamp to valid range 35-95
        const clampedMin = Math.max(35, Math.min(95, min));
        const clampedMax = Math.max(35, Math.min(95, max));
        if (clampedMin !== min || clampedMax !== max) {
          finalValue = `${clampedMin}-${clampedMax}`;
        }
      } else {
        // Single value - convert to range
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const clamped = Math.max(35, Math.min(95, Math.round(num)));
          finalValue = `${clamped}-95`; // Default max is 95
        }
      }
    } else if (field === 'concreteTempF' && value) {
      // Parse range or single value
      const rangeMatch = value.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1]);
        const max = parseInt(rangeMatch[2]);
        // Clamp to valid range 45-95
        const clampedMin = Math.max(45, Math.min(95, min));
        const clampedMax = Math.max(45, Math.min(95, max));
        if (clampedMin !== min || clampedMax !== max) {
          finalValue = `${clampedMin}-${clampedMax}`;
        }
      } else {
        // Single value - convert to range
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const clamped = Math.max(45, Math.min(95, Math.round(num)));
          finalValue = `${clamped}-95`; // Default max is 95
        }
      }
    }
    
    setSoilSpecs({
      ...soilSpecs,
      [structureType]: {
        ...soilSpecs[structureType],
        [field]: finalValue
      }
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

  const updateConcreteMoistureRange = (structureType: string, min: string, max: string) => {
    setConcreteSpecs({
      ...concreteSpecs,
      [structureType]: {
        ...concreteSpecs[structureType],
        moistureRange: { min, max }
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    // Validate customer emails
    const validEmails = customerEmails.filter(email => email.trim() !== '');
    if (validEmails.length === 0) {
      setError('At least one customer email is required');
      return;
    }

    // Check for duplicate emails
    const uniqueEmails = Array.from(new Set(validEmails));
    if (uniqueEmails.length !== validEmails.length) {
      setError('Duplicate emails are not allowed');
      return;
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of validEmails) {
      if (!emailRegex.test(email)) {
        setError(`Invalid email format: ${email}`);
        return;
      }
    }

    // Validate soil specs if shown
    if (showSoilSpecs && !validateSoilSpecs()) {
      setError('Please fix validation errors in Concrete Specs');
      return;
    }

    setLoading(true);

    try {
      await projectsAPI.create({
        projectName,
        customerEmails: validEmails,
        soilSpecs: showSoilSpecs && Object.keys(soilSpecs).length > 0 ? soilSpecs : undefined,
        concreteSpecs: showConcreteSpecs && Object.keys(concreteSpecs).length > 0 ? concreteSpecs : undefined
      });
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
                src="/MAK%20logo_consulting.jpg"
                alt="MAK Lone Star Consulting" 
                className="company-logo"
                onError={(e) => {
                  console.error('Logo failed to load:', e);
                  setLogoError(true);
                }}
                onLoad={() => {
                  console.log('Logo loaded successfully');
                  setLogoError(false);
                }}
              />
            ) : (
              <span>MAK Lone Star Consulting</span>
            )}
          </div>
          <h1>Create New Project</h1>
        </header>
        <form onSubmit={handleSubmit} className="admin-form">
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

          <div className="form-group">
            <label>Customer Emails *</label>
            {customerEmails.map((email, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateCustomerEmail(index, e.target.value)}
                  placeholder="customer@example.com"
                  style={{ flex: 1 }}
                  required={index === 0}
                />
                {customerEmails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCustomerEmail(index)}
                    style={{
                      padding: '8px 12px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCustomerEmail}
              style={{
                padding: '8px 16px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '5px'
              }}
            >
              + Add Email
            </button>
          </div>

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
                      {SOIL_STRUCTURE_TYPES.map((structureType) => {
                        const spec = soilSpecs[structureType] || {};
                        // Ensure defaults are displayed (fallback to defaults if missing)
                        const defaultSpec = {
                          ambientTempF: spec.ambientTempF || '35-95',
                          concreteTempF: spec.concreteTempF || '45-95',
                          ...spec
                        };
                        return (
                          <tr key={structureType}>
                            <td style={{ padding: '10px', border: '1px solid #dee2e6', fontWeight: '500' }}>{structureType}</td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={defaultSpec.specStrengthPsi || ''}
                                onChange={(e) => updateSoilSpec(structureType, 'specStrengthPsi', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={defaultSpec.ambientTempF}
                                onChange={(e) => updateSoilSpec(structureType, 'ambientTempF', e.target.value)}
                                onBlur={(e) => {
                                  // Ensure value is in range format
                                  const val = e.target.value;
                                  if (val && !val.match(/^\d+-\d+$/)) {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      const clamped = Math.max(35, Math.min(95, Math.round(num)));
                                      updateSoilSpec(structureType, 'ambientTempF', `${clamped}-95`);
                                    } else {
                                      updateSoilSpec(structureType, 'ambientTempF', '35-95');
                                    }
                                  } else if (!val) {
                                    updateSoilSpec(structureType, 'ambientTempF', '35-95');
                                  }
                                }}
                                placeholder="35-95"
                                style={{ 
                                  width: '100%', 
                                  padding: '5px', 
                                  border: validationErrors[`soil-${structureType}-ambientTempF`] ? '1px solid #dc3545' : '1px solid #ccc',
                                  borderRadius: '3px'
                                }}
                              />
                              {validationErrors[`soil-${structureType}-ambientTempF`] && (
                                <div style={{ fontSize: '11px', color: '#dc3545', marginTop: '2px' }}>
                                  {validationErrors[`soil-${structureType}-ambientTempF`]}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={defaultSpec.concreteTempF}
                                onChange={(e) => updateSoilSpec(structureType, 'concreteTempF', e.target.value)}
                                onBlur={(e) => {
                                  // Ensure value is in range format
                                  const val = e.target.value;
                                  if (val && !val.match(/^\d+-\d+$/)) {
                                    const num = parseFloat(val);
                                    if (!isNaN(num)) {
                                      const clamped = Math.max(45, Math.min(95, Math.round(num)));
                                      updateSoilSpec(structureType, 'concreteTempF', `${clamped}-95`);
                                    } else {
                                      updateSoilSpec(structureType, 'concreteTempF', '45-95');
                                    }
                                  } else if (!val) {
                                    updateSoilSpec(structureType, 'concreteTempF', '45-95');
                                  }
                                }}
                                placeholder="45-95"
                                style={{ 
                                  width: '100%', 
                                  padding: '5px', 
                                  border: validationErrors[`soil-${structureType}-concreteTempF`] ? '1px solid #dc3545' : '1px solid #ccc',
                                  borderRadius: '3px'
                                }}
                              />
                              {validationErrors[`soil-${structureType}-concreteTempF`] && (
                                <div style={{ fontSize: '11px', color: '#dc3545', marginTop: '2px' }}>
                                  {validationErrors[`soil-${structureType}-concreteTempF`]}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.slump || ''}
                                onChange={(e) => updateSoilSpec(structureType, 'slump', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.airContent || ''}
                                onChange={(e) => updateSoilSpec(structureType, 'airContent', e.target.value)}
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

            {showConcreteSpecs && (
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
                      {CONCRETE_STRUCTURE_TYPES.map((structureType) => {
                        const spec = concreteSpecs[structureType] || {};
                        const moistureRange = spec.moistureRange || {};
                        return (
                          <tr key={structureType}>
                            <td style={{ padding: '10px', border: '1px solid #dee2e6', fontWeight: '500' }}>{structureType}</td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <input
                                type="text"
                                value={spec.densityPct || ''}
                                onChange={(e) => updateConcreteSpec(structureType, 'densityPct', e.target.value)}
                                style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                              />
                            </td>
                            <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  value={moistureRange.min || ''}
                                  onChange={(e) => updateConcreteMoistureRange(structureType, e.target.value, moistureRange.max || '')}
                                  placeholder="Min"
                                  style={{ width: '80px', padding: '5px', border: '1px solid #ccc', borderRadius: '3px' }}
                                />
                                <span>-</span>
                                <input
                                  type="text"
                                  value={moistureRange.max || ''}
                                  onChange={(e) => updateConcreteMoistureRange(structureType, moistureRange.min || '', e.target.value)}
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
        <p className="info-text">
          * Project number will be auto-generated in format 02-YYYY-NNNN
          <br />
          * Tasks can be created after project creation
        </p>
      </div>
    </div>
  );
};

export default CreateProject;
