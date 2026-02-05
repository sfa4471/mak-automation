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
      setError('');
      
      // Validate project ID parameter
      if (!id) {
        setError('Invalid project ID. Please select a project from the dashboard.');
        setLoading(false);
        return;
      }
      
      const projectId = parseInt(id, 10);
      if (isNaN(projectId) || projectId <= 0) {
        setError('Invalid project ID. Please select a project from the dashboard.');
        setLoading(false);
        return;
      }
      
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
      
      // Provide more specific error messages
      if (err.response?.status === 404) {
        setError('Project not found. It may have been deleted.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view this project.');
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError(err.response?.data?.error || 'Failed to load project details. Please try again.');
      }
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
    
    Object.keys(soilSpecs).forEach(structureType => {
      const spec = soilSpecs[structureType];
      
      // Validate densityPct if provided
      if (spec.densityPct && String(spec.densityPct).trim() !== '') {
        const density = parseFloat(String(spec.densityPct));
        if (isNaN(density) || density < 0 || density > 100) {
          errors[`soil-${structureType}-densityPct`] = 'Density must be between 0 and 100';
        }
      }
      
      // Validate moisture range if provided
      if (spec.moistureRange) {
        const min = spec.moistureRange.min ? parseFloat(String(spec.moistureRange.min)) : null;
        const max = spec.moistureRange.max ? parseFloat(String(spec.moistureRange.max)) : null;
        
        if (min !== null && (isNaN(min) || min < 0)) {
          errors[`soil-${structureType}-moistureMin`] = 'Minimum moisture must be a positive number';
        }
        if (max !== null && (isNaN(max) || max < 0)) {
          errors[`soil-${structureType}-moistureMax`] = 'Maximum moisture must be a positive number';
        }
        if (min !== null && max !== null && !isNaN(min) && !isNaN(max) && min > max) {
          errors[`soil-${structureType}-moistureRange`] = 'Minimum must be less than or equal to maximum';
        }
      }
    });
    
    setValidationErrors(prev => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
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

  const validateConcreteSpecs = (): boolean => {
    const errors: { [key: string]: string } = {};
    
    Object.keys(concreteSpecs).forEach(structureType => {
      const spec = concreteSpecs[structureType];
      
      // Validate specStrengthPsi
      if (spec.specStrengthPsi && String(spec.specStrengthPsi).trim() !== '') {
        const strength = parseFloat(String(spec.specStrengthPsi));
        if (isNaN(strength) || strength <= 0) {
          errors[`concrete-${structureType}-specStrengthPsi`] = 'Spec strength must be a positive number';
        }
      }
      
      // Validate temperature ranges (format: "min-max" or single number)
      if (spec.ambientTempF && String(spec.ambientTempF).trim() !== '') {
        const tempStr = String(spec.ambientTempF).trim();
        const tempMatch = tempStr.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/);
        if (!tempMatch) {
          errors[`concrete-${structureType}-ambientTempF`] = 'Invalid temperature format. Use "min-max" or single number';
        } else {
          const min = parseFloat(tempMatch[1]);
          const max = tempMatch[2] ? parseFloat(tempMatch[2]) : min;
          if (min > max) {
            errors[`concrete-${structureType}-ambientTempF`] = 'Minimum must be less than or equal to maximum';
          }
        }
      }
      
      if (spec.concreteTempF && String(spec.concreteTempF).trim() !== '') {
        const tempStr = String(spec.concreteTempF).trim();
        const tempMatch = tempStr.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/);
        if (!tempMatch) {
          errors[`concrete-${structureType}-concreteTempF`] = 'Invalid temperature format. Use "min-max" or single number';
        } else {
          const min = parseFloat(tempMatch[1]);
          const max = tempMatch[2] ? parseFloat(tempMatch[2]) : min;
          if (min > max) {
            errors[`concrete-${structureType}-concreteTempF`] = 'Minimum must be less than or equal to maximum';
          }
        }
      }
      
      // Validate slump if provided
      if (spec.slump && String(spec.slump).trim() !== '') {
        const slump = parseFloat(String(spec.slump));
        if (isNaN(slump) || slump < 0) {
          errors[`concrete-${structureType}-slump`] = 'Slump must be a positive number';
        }
      }
      
      // Validate airContent if provided
      if (spec.airContent && String(spec.airContent).trim() !== '') {
        const airContent = parseFloat(String(spec.airContent));
        if (isNaN(airContent) || airContent < 0 || airContent > 100) {
          errors[`concrete-${structureType}-airContent`] = 'Air content must be between 0 and 100';
        }
      }
    });
    
    setValidationErrors(prev => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const updateConcreteSpec = (structureType: string, field: string, value: any) => {
    setConcreteSpecs({
      ...concreteSpecs,
      [structureType]: {
        ...concreteSpecs[structureType],
        [field]: value
      }
    });
    // Clear validation error for this field
    const errorKey = `concrete-${structureType}-${field}`;
    if (validationErrors[errorKey]) {
      const newErrors = { ...validationErrors };
      delete newErrors[errorKey];
      setValidationErrors(newErrors);
    }
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
      setError('Please fix validation errors in Soil Specs');
      return;
    }

    // Validate concrete specs
    if (!validateConcreteSpecs()) {
      setError('Please fix validation errors in Concrete Specs');
      return;
    }

    try {
      setSaving(true);
      
      // Debug: Log current state before filtering
      console.log('🔍 Saving project specs:', {
        soilSpecsKeys: Object.keys(soilSpecs),
        soilSpecs,
        concreteSpecsKeys: Object.keys(concreteSpecs),
        concreteSpecs
      });
      
      const updateData: any = {
        projectName,
        customerEmails: validEmails
      };
      
      // Build soil specs - start with current state (which has all user-entered values)
      // Then merge with existing saved specs to preserve any that weren't modified
      const filteredSoilSpecs: SoilSpecs = {};
      
      // First, include all structure types from current state (user-entered values)
      Object.keys(soilSpecs).forEach(key => {
        const spec = soilSpecs[key];
        if (spec) {
          // Check if it has at least one non-empty value
          const hasValue = (
            (spec.densityPct && String(spec.densityPct).trim() !== '') ||
            (spec.moistureRange && (
              (spec.moistureRange.min && String(spec.moistureRange.min).trim() !== '') ||
              (spec.moistureRange.max && String(spec.moistureRange.max).trim() !== '')
            ))
          );
          
          if (hasValue) {
            filteredSoilSpecs[key] = { ...spec };
          }
        }
      });
      
      // Then, preserve any existing saved specs that weren't modified in this session
      if (project.soilSpecs) {
        Object.keys(project.soilSpecs).forEach(key => {
          // Only preserve if it wasn't already included from current state
          if (!filteredSoilSpecs[key]) {
            const existingSpec = project.soilSpecs![key];
            // Only preserve if it has values
            if (existingSpec && (
              (existingSpec.densityPct && String(existingSpec.densityPct).trim() !== '') ||
              (existingSpec.moistureRange && (
                (existingSpec.moistureRange.min && String(existingSpec.moistureRange.min).trim() !== '') ||
                (existingSpec.moistureRange.max && String(existingSpec.moistureRange.max).trim() !== '')
              ))
            )) {
              filteredSoilSpecs[key] = { ...existingSpec };
            }
          }
        });
      }
      
      // Build concrete specs - start with current state (which has all user-entered values)
      // Then merge with existing saved specs to preserve any that weren't modified
      const filteredConcreteSpecs: ConcreteSpecs = {};
      
      // First, include all structure types from current state (user-entered values)
      Object.keys(concreteSpecs).forEach(key => {
        const spec = concreteSpecs[key];
        if (spec) {
          // Check if it has at least one non-empty value
          // If a value is in state, it means the user interacted with it, so save it (even if it's "35-95" or "45-95")
          const hasValue = (
            (spec.specStrengthPsi && String(spec.specStrengthPsi).trim() !== '') ||
            (spec.ambientTempF && String(spec.ambientTempF).trim() !== '') ||
            (spec.concreteTempF && String(spec.concreteTempF).trim() !== '') ||
            (spec.slump && String(spec.slump).trim() !== '') ||
            (spec.airContent && String(spec.airContent).trim() !== '')
          );
          
          if (hasValue) {
            filteredConcreteSpecs[key] = { ...spec };
          }
        }
      });
      
      // Then, preserve any existing saved specs that weren't modified in this session
      if (project.concreteSpecs) {
        Object.keys(project.concreteSpecs).forEach(key => {
          // Only preserve if it wasn't already included from current state
          if (!filteredConcreteSpecs[key]) {
            const existingSpec = project.concreteSpecs![key];
            // Only preserve if it has values
            if (existingSpec && (
              (existingSpec.specStrengthPsi && String(existingSpec.specStrengthPsi).trim() !== '') ||
              (existingSpec.ambientTempF && String(existingSpec.ambientTempF).trim() !== '') ||
              (existingSpec.concreteTempF && String(existingSpec.concreteTempF).trim() !== '') ||
              (existingSpec.slump && String(existingSpec.slump).trim() !== '') ||
              (existingSpec.airContent && String(existingSpec.airContent).trim() !== '')
            )) {
              filteredConcreteSpecs[key] = { ...existingSpec };
            }
          }
        });
      }
      
      // Always include specs objects (even if empty) to ensure consistency
      updateData.soilSpecs = filteredSoilSpecs;
      updateData.concreteSpecs = filteredConcreteSpecs;
      
      // Debug: Log what we're sending
      console.log('📤 Sending update data:', {
        soilSpecsKeys: Object.keys(filteredSoilSpecs),
        filteredSoilSpecs,
        concreteSpecsKeys: Object.keys(filteredConcreteSpecs),
        filteredConcreteSpecs
      });
      
      const updatedProject = await projectsAPI.update(project.id, updateData);
      
      // Update local state immediately with response data to prevent data loss
      setProject(updatedProject);
      setProjectName(updatedProject.projectName || '');
      
      // Update customer emails
      if (updatedProject.customerEmails && Array.isArray(updatedProject.customerEmails) && updatedProject.customerEmails.length > 0) {
        setCustomerEmails(updatedProject.customerEmails);
      } else {
        setCustomerEmails(['']);
      }
      
      // Update specs from the API response (which has the saved values)
      // Merge with current state to preserve any unsaved changes (though there shouldn't be any at this point)
      const mergedSoilSpecs = { ...(updatedProject.soilSpecs || {}) };
      const mergedConcreteSpecs = { ...(updatedProject.concreteSpecs || {}) };
      
      // Use the saved values from the API response
      setSoilSpecs(mergedSoilSpecs);
      setConcreteSpecs(mergedConcreteSpecs);
      
      // Clear any validation errors
      setValidationErrors({});
      setError('');
      
      // Show success message (using alert for now, can be replaced with toast notification)
      alert('Project details updated successfully!');
      
      // Don't reload - we already have the updated data from the API response
      // Reloading could cause a flash and might overwrite with stale data
    } catch (err: any) {
      console.error('Error updating project:', err);
      
      // Provide more specific error messages
      if (err.response?.status === 404) {
        setError('Project not found. It may have been deleted.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to update this project.');
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError(err.response?.data?.error || 'Failed to update project details. Please try again.');
      }
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
            {/* Always show the table so users can enter data */}
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
                              className={`form-input ${validationErrors[`concrete-${structureType}-specStrengthPsi`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`concrete-${structureType}-specStrengthPsi`] && (
                              <span className="field-error">{validationErrors[`concrete-${structureType}-specStrengthPsi`]}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.ambientTempF || '35-95'}
                              onChange={(e) => updateConcreteSpec(structureType, 'ambientTempF', e.target.value)}
                              className={`form-input ${validationErrors[`concrete-${structureType}-ambientTempF`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`concrete-${structureType}-ambientTempF`] && (
                              <span className="field-error">{validationErrors[`concrete-${structureType}-ambientTempF`]}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.concreteTempF || '45-95'}
                              onChange={(e) => updateConcreteSpec(structureType, 'concreteTempF', e.target.value)}
                              className={`form-input ${validationErrors[`concrete-${structureType}-concreteTempF`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`concrete-${structureType}-concreteTempF`] && (
                              <span className="field-error">{validationErrors[`concrete-${structureType}-concreteTempF`]}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.slump || ''}
                              onChange={(e) => updateConcreteSpec(structureType, 'slump', e.target.value)}
                              className={`form-input ${validationErrors[`concrete-${structureType}-slump`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`concrete-${structureType}-slump`] && (
                              <span className="field-error">{validationErrors[`concrete-${structureType}-slump`]}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <input
                              type="text"
                              value={spec.airContent || ''}
                              onChange={(e) => updateConcreteSpec(structureType, 'airContent', e.target.value)}
                              className={`form-input ${validationErrors[`concrete-${structureType}-airContent`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`concrete-${structureType}-airContent`] && (
                              <span className="field-error">{validationErrors[`concrete-${structureType}-airContent`]}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>

          <div className="form-section">
            <h2>Soil Specs</h2>
            {/* Always show the table so users can enter data */}
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
                              className={`form-input ${validationErrors[`soil-${structureType}-densityPct`] ? 'error' : ''}`}
                              style={{ width: '100%', padding: '5px' }}
                            />
                            {validationErrors[`soil-${structureType}-densityPct`] && (
                              <span className="field-error">{validationErrors[`soil-${structureType}-densityPct`]}</span>
                            )}
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #dee2e6' }}>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  value={moistureRange.min || ''}
                                  onChange={(e) => {
                                    const currentSpec = soilSpecs[structureType] || {};
                                    const currentRange = currentSpec.moistureRange || {};
                                    updateSoilSpec(structureType, 'moistureRange', { min: e.target.value, max: currentRange.max || '' });
                                  }}
                                  placeholder="Min"
                                  className={`form-input ${validationErrors[`soil-${structureType}-moistureMin`] ? 'error' : ''}`}
                                  style={{ width: '100%', padding: '5px' }}
                                />
                                {validationErrors[`soil-${structureType}-moistureMin`] && (
                                  <span className="field-error">{validationErrors[`soil-${structureType}-moistureMin`]}</span>
                                )}
                              </div>
                              <span>-</span>
                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  value={moistureRange.max || ''}
                                  onChange={(e) => {
                                    const currentSpec = soilSpecs[structureType] || {};
                                    const currentRange = currentSpec.moistureRange || {};
                                    updateSoilSpec(structureType, 'moistureRange', { min: currentRange.min || '', max: e.target.value });
                                  }}
                                  placeholder="Max"
                                  className={`form-input ${validationErrors[`soil-${structureType}-moistureMax`] ? 'error' : ''}`}
                                  style={{ width: '100%', padding: '5px' }}
                                />
                                {validationErrors[`soil-${structureType}-moistureMax`] && (
                                  <span className="field-error">{validationErrors[`soil-${structureType}-moistureMax`]}</span>
                                )}
                              </div>
                            </div>
                            {validationErrors[`soil-${structureType}-moistureRange`] && (
                              <span className="field-error" style={{ marginTop: '4px', display: 'block' }}>{validationErrors[`soil-${structureType}-moistureRange`]}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
