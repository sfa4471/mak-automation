import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI, Project, ProjectDrawing, SoilSpecs, ConcreteSpecs, CustomerDetails, ProjectAddress } from '../../api/projects';
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

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const ProjectDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: _user, isAdmin } = useAuth();
  const [openingDrawing, setOpeningDrawing] = useState<string | null>(null);
  const [deletingDrawing, setDeletingDrawing] = useState<string | null>(null);
  const [addDrawingFiles, setAddDrawingFiles] = useState<File[]>([]);
  const [uploadingDrawings, setUploadingDrawings] = useState(false);
  const [drawingUploadError, setDrawingUploadError] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  /** To emails: single string, separate multiple with ; */
  const [customerEmailsStr, setCustomerEmailsStr] = useState('');
  /** CC emails: single string, separate multiple with ; */
  const [ccEmailsStr, setCcEmailsStr] = useState('');
  /** BCC emails: single string, separate multiple with ; */
  const [bccEmailsStr, setBccEmailsStr] = useState('');
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>({});
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
      
      // Load customer emails as semicolon-separated strings
      if (projectData.customerEmails && Array.isArray(projectData.customerEmails) && projectData.customerEmails.length > 0) {
        setCustomerEmailsStr(projectData.customerEmails.join('; '));
      } else if (projectData.customerEmail) {
        setCustomerEmailsStr(projectData.customerEmail);
      } else {
        setCustomerEmailsStr('');
      }
      if (projectData.ccEmails && Array.isArray(projectData.ccEmails)) {
        setCcEmailsStr(projectData.ccEmails.join('; '));
      } else {
        setCcEmailsStr('');
      }
      if (projectData.bccEmails && Array.isArray(projectData.bccEmails)) {
        setBccEmailsStr(projectData.bccEmails.join('; '));
      } else {
        setBccEmailsStr('');
      }
      setCustomerDetails(projectData.customerDetails && typeof projectData.customerDetails === 'object' ? projectData.customerDetails : {});
      
      // Load soil specs - normalize keys to match defined structure types
      let loadedSoilSpecs = projectData.soilSpecs || {};
      const normalizedSoilSpecs: SoilSpecs = {};
      Object.keys(loadedSoilSpecs).forEach(key => {
        // Find matching structure type (case-insensitive)
        const matchingType = SOIL_STRUCTURE_TYPES.find(
          type => type.toLowerCase() === key.toLowerCase()
        );
        if (matchingType) {
          // Use the correct case from the defined types
          normalizedSoilSpecs[matchingType] = loadedSoilSpecs[key];
        } else {
          // Keep original if no match (for backward compatibility)
          normalizedSoilSpecs[key] = loadedSoilSpecs[key];
        }
      });
      setSoilSpecs(normalizedSoilSpecs);
      
      // Load concrete specs - normalize keys to match defined structure types
      let loadedConcreteSpecs = projectData.concreteSpecs || {};
      const normalizedConcreteSpecs: ConcreteSpecs = {};
      Object.keys(loadedConcreteSpecs).forEach(key => {
        // Find matching structure type (case-insensitive)
        const matchingType = CONCRETE_STRUCTURE_TYPES.find(
          type => type.toLowerCase() === key.toLowerCase()
        );
        if (matchingType) {
          // Use the correct case from the defined types
          normalizedConcreteSpecs[matchingType] = loadedConcreteSpecs[key];
        } else {
          // Keep original if no match (for backward compatibility)
          normalizedConcreteSpecs[key] = loadedConcreteSpecs[key];
        }
      });
      setConcreteSpecs(normalizedConcreteSpecs);
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

  /** Parse semicolon-separated string into trimmed non-empty emails */
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
      // Could show a brief "Copied!" toast here
    } catch {
      // Fallback for older browsers
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

  const updateBillingAddress = useCallback((field: keyof ProjectAddress, value: string) => {
    setCustomerDetails(prev => ({
      ...prev,
      billingAddress: { ...(prev.billingAddress || {}), [field]: value }
    }));
  }, []);

  const updateShippingAddress = useCallback((field: keyof ProjectAddress, value: string) => {
    setCustomerDetails(prev => ({
      ...prev,
      shippingAddress: { ...(prev.shippingAddress || {}), [field]: value }
    }));
  }, []);

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
    // Use functional update to ensure we have the latest state
    setConcreteSpecs(prev => {
      const updated = {
        ...prev,
        [structureType]: {
          ...prev[structureType],
          [field]: value
        }
      };
      // Debug: Log state update
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Updated concrete spec: ${structureType}.${field} = ${value}`, updated[structureType]);
      }
      return updated;
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validTo = parseEmailString(customerEmailsStr);
    const validCc = parseEmailString(ccEmailsStr);
    const validBcc = parseEmailString(bccEmailsStr);

    if (validTo.length === 0) {
      setError('At least one customer (To) email is required');
      return;
    }
    for (const email of validTo) {
      if (!emailRegex.test(email)) {
        setError(`Invalid To email format: ${email}`);
        return;
      }
    }
    for (const email of validCc) {
      if (!emailRegex.test(email)) {
        setError(`Invalid CC email format: ${email}`);
        return;
      }
    }
    for (const email of validBcc) {
      if (!emailRegex.test(email)) {
        setError(`Invalid BCC email format: ${email}`);
        return;
      }
    }
    const uniqueTo = Array.from(new Set(validTo));
    if (uniqueTo.length !== validTo.length) {
      setError('Duplicate To emails are not allowed');
      return;
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
      console.log('🔍 Current state before filtering:', {
        soilSpecsKeys: Object.keys(soilSpecs),
        soilSpecs: JSON.parse(JSON.stringify(soilSpecs)), // Deep clone for accurate logging
        concreteSpecsKeys: Object.keys(concreteSpecs),
        concreteSpecs: JSON.parse(JSON.stringify(concreteSpecs)) // Deep clone for accurate logging
      });
      
      const detailsPayload: CustomerDetails = {
        ...customerDetails,
        shippingSameAsBilling: customerDetails.shippingSameAsBilling ?? false
      };
      if (detailsPayload.shippingSameAsBilling && detailsPayload.billingAddress) {
        detailsPayload.shippingAddress = { ...detailsPayload.billingAddress };
      }

      const updateData: any = {
        projectName,
        customerEmails: validTo,
        ccEmails: validCc,
        bccEmails: validBcc,
        customerDetails: detailsPayload
      };
      
      // Build soil specs - normalize keys to use correct case from defined structure types
      const filteredSoilSpecs: SoilSpecs = {};
      
      // Process current state (user-entered values) - normalize keys
      Object.keys(soilSpecs).forEach(key => {
        const spec = soilSpecs[key];
        if (spec) {
          // Find matching structure type (case-insensitive)
          const matchingType = SOIL_STRUCTURE_TYPES.find(
            type => type.toLowerCase() === key.toLowerCase()
          ) || key; // Use original if no match
          
          // Check if it has at least one non-empty value
          const hasValue = (
            (spec.densityPct && String(spec.densityPct).trim() !== '') ||
            (spec.moistureRange && (
              (spec.moistureRange.min && String(spec.moistureRange.min).trim() !== '') ||
              (spec.moistureRange.max && String(spec.moistureRange.max).trim() !== '')
            ))
          );
          
          if (hasValue) {
            // Use normalized key (correct case)
            filteredSoilSpecs[matchingType] = { ...spec };
          }
        }
      });
      
      // Process existing saved specs - normalize keys and merge
      if (project.soilSpecs) {
        Object.keys(project.soilSpecs).forEach(key => {
          // Find matching structure type (case-insensitive)
          const matchingType = SOIL_STRUCTURE_TYPES.find(
            type => type.toLowerCase() === key.toLowerCase()
          ) || key; // Use original if no match
          
          // Only preserve if it wasn't already included from current state
          if (!filteredSoilSpecs[matchingType]) {
            const existingSpec = project.soilSpecs![key];
            // Only preserve if it has values
            if (existingSpec && (
              (existingSpec.densityPct && String(existingSpec.densityPct).trim() !== '') ||
              (existingSpec.moistureRange && (
                (existingSpec.moistureRange.min && String(existingSpec.moistureRange.min).trim() !== '') ||
                (existingSpec.moistureRange.max && String(existingSpec.moistureRange.max).trim() !== '')
              ))
            )) {
              filteredSoilSpecs[matchingType] = { ...existingSpec };
            }
          }
        });
      }
      
      // Build concrete specs - normalize keys to use correct case from defined structure types
      const filteredConcreteSpecs: ConcreteSpecs = {};
      
      // Process current state (user-entered values) - normalize keys
      Object.keys(concreteSpecs).forEach(key => {
        const spec = concreteSpecs[key];
        if (spec) {
          // Find matching structure type (case-insensitive)
          const matchingType = CONCRETE_STRUCTURE_TYPES.find(
            type => type.toLowerCase() === key.toLowerCase()
          ) || key; // Use original if no match
          
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
            // Use normalized key (correct case)
            filteredConcreteSpecs[matchingType] = { ...spec };
          }
        }
      });
      
      // Process existing saved specs - normalize keys and merge
      if (project.concreteSpecs) {
        Object.keys(project.concreteSpecs).forEach(key => {
          // Find matching structure type (case-insensitive)
          const matchingType = CONCRETE_STRUCTURE_TYPES.find(
            type => type.toLowerCase() === key.toLowerCase()
          ) || key; // Use original if no match
          
          // Only preserve if it wasn't already included from current state
          if (!filteredConcreteSpecs[matchingType]) {
            const existingSpec = project.concreteSpecs![key];
            // Only preserve if it has values
            if (existingSpec && (
              (existingSpec.specStrengthPsi && String(existingSpec.specStrengthPsi).trim() !== '') ||
              (existingSpec.ambientTempF && String(existingSpec.ambientTempF).trim() !== '') ||
              (existingSpec.concreteTempF && String(existingSpec.concreteTempF).trim() !== '') ||
              (existingSpec.slump && String(existingSpec.slump).trim() !== '') ||
              (existingSpec.airContent && String(existingSpec.airContent).trim() !== '')
            )) {
              filteredConcreteSpecs[matchingType] = { ...existingSpec };
            }
          }
        });
      }
      
      // Always include specs objects (even if empty) to ensure consistency
      // This ensures the backend receives the data even if some structure types are empty
      updateData.soilSpecs = filteredSoilSpecs;
      updateData.concreteSpecs = filteredConcreteSpecs;
      
      // Debug: Log what we're sending
      console.log('📤 Final update data being sent to API:', {
        updateDataKeys: Object.keys(updateData),
        soilSpecsKeys: Object.keys(filteredSoilSpecs),
        soilSpecs: JSON.parse(JSON.stringify(filteredSoilSpecs)), // Deep clone
        concreteSpecsKeys: Object.keys(filteredConcreteSpecs),
        concreteSpecs: JSON.parse(JSON.stringify(filteredConcreteSpecs)) // Deep clone
      });
      
      const updatedProject = await projectsAPI.update(project.id, updateData);
      
      // Update local state immediately with response data to prevent data loss
      setProject(updatedProject);
      setProjectName(updatedProject.projectName || '');
      
      if (updatedProject.customerEmails && Array.isArray(updatedProject.customerEmails)) {
        setCustomerEmailsStr(updatedProject.customerEmails.join('; '));
      } else {
        setCustomerEmailsStr('');
      }
      if (updatedProject.ccEmails && Array.isArray(updatedProject.ccEmails)) {
        setCcEmailsStr(updatedProject.ccEmails.join('; '));
      } else {
        setCcEmailsStr('');
      }
      if (updatedProject.bccEmails && Array.isArray(updatedProject.bccEmails)) {
        setBccEmailsStr(updatedProject.bccEmails.join('; '));
      } else {
        setBccEmailsStr('');
      }
      setCustomerDetails(updatedProject.customerDetails && typeof updatedProject.customerDetails === 'object' ? updatedProject.customerDetails : {});
      
      // Use the normalized filtered specs we just sent (they have the correct case)
      // Don't use the API response directly as it might have different case
      // The filtered specs already have the correct normalized keys
      setSoilSpecs(filteredSoilSpecs);
      setConcreteSpecs(filteredConcreteSpecs);
      
      // Debug: Log state after update
      console.log('✅ Updated state after save (using filtered data):', {
        soilSpecsKeys: Object.keys(filteredSoilSpecs),
        concreteSpecsKeys: Object.keys(filteredConcreteSpecs),
        soilSpecs: JSON.parse(JSON.stringify(filteredSoilSpecs)),
        concreteSpecs: JSON.parse(JSON.stringify(filteredConcreteSpecs))
      });
      
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
                  title="Copy all CC addresses"
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
                  title="Copy all BCC addresses"
                  aria-label="Copy BCC emails"
                >
                  <CopyIcon />
                </button>
              </div>
              <small>Separate multiple emails with semicolon (;)</small>
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

          <div className="form-section">
            <h2>Drawings</h2>
            {project && (project.drawings && project.drawings.length > 0) ? (
              <ul className="drawings-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(project.drawings as ProjectDrawing[]).map((d) => (
                  <li key={d.filename} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{d.displayName || d.filename}</span>
                    <button
                      type="button"
                      className="details-button"
                      style={{ padding: '4px 10px' }}
                      disabled={openingDrawing === d.filename}
                      onClick={async () => {
                        if (!project?.id) return;
                        setOpeningDrawing(d.filename);
                        try {
                          const blob = await projectsAPI.getDrawingBlob(project.id, d.filename);
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        } catch {
                          // ignore
                        } finally {
                          setOpeningDrawing(null);
                        }
                      }}
                    >
                      {openingDrawing === d.filename ? 'Opening...' : 'View'}
                    </button>
                    <a
                      href="#"
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!project?.id) return;
                        try {
                          const blob = await projectsAPI.getDrawingBlob(project.id, d.filename);
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = (d.displayName || d.filename).replace(/\.pdf$/i, '') + '.pdf';
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch {
                          // ignore
                        }
                      }}
                      style={{ fontSize: 14 }}
                    >
                      Download
                    </a>
                    {isAdmin() && (
                      <button
                        type="button"
                        disabled={deletingDrawing === d.filename}
                        onClick={async () => {
                          if (!project?.id || !window.confirm(`Delete "${d.displayName || d.filename}"?`)) return;
                          setDeletingDrawing(d.filename);
                          try {
                            const { drawings } = await projectsAPI.deleteDrawing(project.id, d.filename);
                            setProject(prev => prev ? { ...prev, drawings } : null);
                          } catch {
                            setError('Failed to delete drawing');
                          } finally {
                            setDeletingDrawing(null);
                          }
                        }}
                        className="cancel-button"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        {deletingDrawing === d.filename ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#666', margin: 0 }}>No drawings uploaded.</p>
            )}
            {isAdmin() && project?.id && (
              <div className="add-drawings-block" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #eee' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Add drawings</h3>
                <p style={{ color: '#666', margin: '0 0 8px 0', fontSize: 13 }}>PDF only. Max 10 files total, 20MB each.</p>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => {
                    const chosen = e.target.files ? Array.from(e.target.files) : [];
                    const current = (project?.drawings?.length ?? 0);
                    setAddDrawingFiles(prev => [...prev, ...chosen].slice(0, Math.max(0, 10 - current)));
                    e.target.value = '';
                    setDrawingUploadError('');
                  }}
                />
                {addDrawingFiles.length > 0 && (
                  <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                    {addDrawingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span>{f.name}</span>
                        <span style={{ color: '#666', fontSize: 12 }}>({(f.size / 1024).toFixed(1)} KB)</span>
                        <button
                          type="button"
                          onClick={() => setAddDrawingFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="cancel-button"
                          style={{ padding: '2px 8px', fontSize: 12 }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addDrawingFiles.length > 0 && (
                  <button
                    type="button"
                    disabled={uploadingDrawings}
                    onClick={async () => {
                      if (!project?.id) return;
                      const current = (project?.drawings?.length ?? 0);
                      if (current + addDrawingFiles.length > 10) {
                        setDrawingUploadError('Maximum 10 drawings per project.');
                        return;
                      }
                      const MAX = 20 * 1024 * 1024;
                      for (const f of addDrawingFiles) {
                        if (f.size > MAX) {
                          setDrawingUploadError(`"${f.name}" is too large. Max 20MB per file.`);
                          return;
                        }
                      }
                      setUploadingDrawings(true);
                      setDrawingUploadError('');
                      try {
                        const { drawings } = await projectsAPI.uploadDrawings(project.id, addDrawingFiles);
                        setProject(prev => prev ? { ...prev, drawings } : null);
                        setAddDrawingFiles([]);
                      } catch (err: any) {
                        setDrawingUploadError(err.response?.data?.error || 'Upload failed');
                      } finally {
                        setUploadingDrawings(false);
                      }
                    }}
                    className="submit-button"
                    style={{ marginTop: 8 }}
                  >
                    {uploadingDrawings ? 'Uploading...' : 'Upload selected'}
                  </button>
                )}
                {drawingUploadError && <p style={{ color: '#c00', margin: '8px 0 0 0', fontSize: 13 }}>{drawingUploadError}</p>}
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          {isAdmin() && (
            <div className="form-actions">
              <button type="button" onClick={() => navigate('/dashboard')} className="cancel-button">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="submit-button">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ProjectDetails;
