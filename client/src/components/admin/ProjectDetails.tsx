import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI, Project, SoilSpecs, ConcreteSpecs } from '../../api/projects';
import './ProjectDetails.css';

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
      
      // Load soil specs
      let loadedSoilSpecs = projectData.soilSpecs || {};
      setSoilSpecs(loadedSoilSpecs);
      
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
      
      // Always include specs - filter out empty structure entries but keep the object
      // This ensures that any entered values are saved
      const filteredSoilSpecs: SoilSpecs = {};
      Object.keys(soilSpecs).forEach(key => {
        const spec = soilSpecs[key];
        // Only include if it has at least one non-empty value
        if (spec && (
          (spec.densityPct && spec.densityPct.trim() !== '') ||
          (spec.moistureRange && (
            (spec.moistureRange.min && spec.moistureRange.min.trim() !== '') ||
            (spec.moistureRange.max && spec.moistureRange.max.trim() !== '')
          ))
        )) {
          filteredSoilSpecs[key] = spec;
        }
      });
      
      const filteredConcreteSpecs: ConcreteSpecs = {};
      Object.keys(concreteSpecs).forEach(key => {
        const spec = concreteSpecs[key];
        // Only include if it has at least one non-empty value
        if (spec && (
          (spec.specStrengthPsi && spec.specStrengthPsi.trim() !== '') ||
          (spec.ambientTempF && spec.ambientTempF.trim() !== '') ||
          (spec.concreteTempF && spec.concreteTempF.trim() !== '') ||
          (spec.slump && spec.slump.trim() !== '') ||
          (spec.airContent && spec.airContent.trim() !== '')
        )) {
          filteredConcreteSpecs[key] = spec;
        }
      });
      
      // Always include specs objects (even if empty) to ensure consistency
      updateData.soilSpecs = filteredSoilSpecs;
      updateData.concreteSpecs = filteredConcreteSpecs;
      
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
            {hasConcreteSpecs ? (
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
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.ambientTempF || '35-95'}
                              onChange={(e) => updateConcreteSpec(structureType, 'ambientTempF', e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.concreteTempF || '45-95'}
                              onChange={(e) => updateConcreteSpec(structureType, 'concreteTempF', e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.slump || ''}
                              onChange={(e) => updateConcreteSpec(structureType, 'slump', e.target.value)}
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
                            />
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.airContent || ''}
                              onChange={(e) => updateConcreteSpec(structureType, 'airContent', e.target.value)}
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
            {hasSoilSpecs ? (
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
                              className="form-input"
                              style={{ width: '100%', padding: '5px' }}
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
                                className="form-input"
                                style={{ width: '80px', padding: '5px' }}
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
              <p style={{ color: '#666', fontStyle: 'italic' }}>No soil specs defined for this project.</p>
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
