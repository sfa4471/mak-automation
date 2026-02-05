import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, SoilSpecs, ConcreteSpecs } from '../../api/projects';
import './Admin.css';

const SOIL_STRUCTURE_TYPES = [
  'Building Pad',
  'Parking lot',
  'Sidewalk',
  'Approach',
  'Utilities',
  'Other'
];

const CONCRETE_STRUCTURE_TYPES = [
  'Slab',
  'Grade Beams',
  'Piers',
  'Sidewalk',
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
    // Soil Specs only have densityPct and moistureRange, no temperature validation needed
    // Validation can be added here if needed in the future
    return true;
  };

  const updateSoilSpec = (structureType: string, field: string, value: any) => {
    setSoilSpecs({
      ...soilSpecs,
      [structureType]: {
        ...soilSpecs[structureType],
        [field]: value
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
      // Debug: Log current state before filtering
      console.log('🔍 Creating project with specs:', {
        showSoilSpecs,
        soilSpecsKeys: Object.keys(soilSpecs),
        soilSpecs,
        showConcreteSpecs,
        concreteSpecsKeys: Object.keys(concreteSpecs),
        concreteSpecs
      });
      
      // Filter out empty structure entries but keep objects with values
      const filteredSoilSpecs: SoilSpecs = {};
      if (showSoilSpecs) {
        Object.keys(soilSpecs).forEach(key => {
          const spec = soilSpecs[key];
          // Only include if it has at least one non-empty value
          if (spec && (
            (spec.densityPct && String(spec.densityPct).trim() !== '') ||
            (spec.moistureRange && (
              (spec.moistureRange.min && String(spec.moistureRange.min).trim() !== '') ||
              (spec.moistureRange.max && String(spec.moistureRange.max).trim() !== '')
            ))
          )) {
            filteredSoilSpecs[key] = spec;
          }
        });
      }
      
      const filteredConcreteSpecs: ConcreteSpecs = {};
      if (showConcreteSpecs) {
        Object.keys(concreteSpecs).forEach(key => {
          const spec = concreteSpecs[key];
          // Only include if it has at least one non-empty value
          if (spec && (
            (spec.specStrengthPsi && String(spec.specStrengthPsi).trim() !== '') ||
            (spec.ambientTempF && String(spec.ambientTempF).trim() !== '') ||
            (spec.concreteTempF && String(spec.concreteTempF).trim() !== '') ||
            (spec.slump && String(spec.slump).trim() !== '') ||
            (spec.airContent && String(spec.airContent).trim() !== '')
          )) {
            filteredConcreteSpecs[key] = spec;
          }
        });
      }
      
      // Debug: Log what we're sending
      console.log('📤 Sending create data:', {
        soilSpecsKeys: Object.keys(filteredSoilSpecs),
        filteredSoilSpecs,
        concreteSpecsKeys: Object.keys(filteredConcreteSpecs),
        filteredConcreteSpecs
      });
      
      await projectsAPI.create({
        projectName,
        customerEmails: validEmails,
        soilSpecs: Object.keys(filteredSoilSpecs).length > 0 ? filteredSoilSpecs : undefined,
        concreteSpecs: Object.keys(filteredConcreteSpecs).length > 0 ? filteredConcreteSpecs : undefined
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
                {showConcreteSpecs ? '−' : '+'} Add Concrete Specs
              </button>
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
                {showSoilSpecs ? '−' : '+'} Add Soil Specs
              </button>
            </div>

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
