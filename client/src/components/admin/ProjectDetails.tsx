import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI, Project, SoilSpecs, ConcreteSpecs } from '../../api/projects';
import './ProjectDetails.css';

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

const ProjectDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: _user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [customerEmails, setCustomerEmails] = useState<string[]>(['']);
  const [soilSpecs, setSoilSpecs] = useState<SoilSpecs>({});
  const [concreteSpecs, setConcreteSpecs] = useState<ConcreteSpecs>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const projectId = parseInt(id!);
      const projectData = await projectsAPI.get(projectId);
      setProject(projectData);
      setProjectName(projectData.projectName || '');
      
      // Load customer emails (new format)
      if (projectData.customerEmails && Array.isArray(projectData.customerEmails) && projectData.customerEmails.length > 0) {
        setCustomerEmails(projectData.customerEmails);
      } else if (projectData.customerEmail) {
        // Fallback to old format for backward compatibility
        setCustomerEmails([projectData.customerEmail]);
      } else {
        setCustomerEmails(['']);
      }
      
      // Load soil specs and initialize default temp ranges if missing
      let loadedSoilSpecs = projectData.soilSpecs || {};
      
      // Initialize default temp ranges for each structure type if missing
      const initializedSoilSpecs: SoilSpecs = {};
      SOIL_STRUCTURE_TYPES.forEach((structureType) => {
        const spec = loadedSoilSpecs[structureType] || {};
        initializedSoilSpecs[structureType] = {
          ...spec,
          // Default Ambient Temp range: 35-95
          ambientTempF: spec.ambientTempF || '35-95',
          // Default Concrete Temp range: 45-95
          concreteTempF: spec.concreteTempF || '45-95',
        };
      });
      
      setSoilSpecs(initializedSoilSpecs);
      
      // Load concrete specs
      if (projectData.concreteSpecs) {
        setConcreteSpecs(projectData.concreteSpecs);
      } else {
        setConcreteSpecs({});
      }
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.response?.data?.error || 'Failed to load project details.');
    } finally {
      setLoading(false);
    }
  };

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
    if (!project) return;

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

    // Validate soil specs
    if (!validateSoilSpecs()) {
      setError('Please fix validation errors in Concrete Specs');
      return;
    }

    try {
      setSaving(true);
      const updateData: any = {
        projectName,
        customerEmails: validEmails
      };
      
      // Only include specs if they have data
      if (Object.keys(soilSpecs).length > 0) {
        updateData.soilSpecs = soilSpecs;
      }
      if (Object.keys(concreteSpecs).length > 0) {
        updateData.concreteSpecs = concreteSpecs;
      }
      
      await projectsAPI.update(project.id, updateData);
      // Reload project to get updated data
      await loadProject();
      alert('Project details updated successfully!');
    } catch (err: any) {
      console.error('Error updating project:', err);
      setError(err.response?.data?.error || 'Failed to update project details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="project-details-loading">Loading project details...</div>;
  }

  if (error && !project) {
    return (
      <div className="project-details-error">
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')} className="back-button">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-details-error">
        <p>Project not found.</p>
        <button onClick={() => navigate('/dashboard')} className="back-button">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const hasSoilSpecs = Object.keys(soilSpecs).length > 0;
  const hasConcreteSpecs = Object.keys(concreteSpecs).length > 0;

  return (
    <div className="project-details-container">
      <header className="project-details-header">
        <h1>Project Details</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </header>

      <div className="project-details-content">
        <form onSubmit={handleSubmit} className="project-details-form">
          <div className="form-section">
            <h2>Project Information</h2>
            
            <div className="form-group">
              <label htmlFor="projectNumber">Project Number</label>
              <input
                type="text"
                id="projectNumber"
                value={project.projectNumber}
                disabled
                className="form-input disabled"
              />
              <small>Project number cannot be changed</small>
            </div>

            <div className="form-group">
              <label htmlFor="projectName">Project Name / Address</label>
              <input
                type="text"
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="form-input"
                required
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
                    className="form-input"
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
          </div>

          <div className="form-section">
            <h2>Concrete Specs</h2>
            {hasSoilSpecs ? (
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      return (
                        <tr key={structureType}>
                          <td style={{ padding: '10px', border: '1px solid #dee2e6', fontWeight: '500' }}>{structureType}</td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.specStrengthPsi || ''}
                              onChange={(e) => updateSoilSpec(structureType, 'specStrengthPsi', e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.ambientTempF || '35-95'}
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
                              className="form-input"
                              style={{ 
                                width: '100%', 
                                padding: '5px',
                                border: validationErrors[`soil-${structureType}-ambientTempF`] ? '1px solid #dc3545' : undefined
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
                              value={spec.concreteTempF || '45-95'}
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
                              className="form-input"
                              style={{ 
                                width: '100%', 
                                padding: '5px',
                                border: validationErrors[`soil-${structureType}-concreteTempF`] ? '1px solid #dc3545' : undefined
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
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.airContent || ''}
                              onChange={(e) => updateSoilSpec(structureType, 'airContent', e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No concrete specs defined for this project.</p>
            )}
          </div>

          <div className="form-section">
            <h2>Soil Specs</h2>
            {hasConcreteSpecs ? (
              <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={moistureRange.min || ''}
                                onChange={(e) => updateConcreteMoistureRange(structureType, e.target.value, moistureRange.max || '')}
                                placeholder="Min"
                                className="form-input"
                                style={{ width: '80px', padding: '5px' }}
                              />
                              <span>-</span>
                              <input
                                type="text"
                                value={moistureRange.max || ''}
                                onChange={(e) => updateConcreteMoistureRange(structureType, moistureRange.min || '', e.target.value)}
                                placeholder="Max"
                                className="form-input"
                                style={{ width: '80px', padding: '5px' }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No concrete specs defined for this project.</p>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/dashboard')} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="submit-button">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectDetails;
