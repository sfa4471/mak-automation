import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI, Project } from '../../api/projects';
import './ProjectDetails.css';

const ProjectDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    projectName: '',
    customerEmail: '',
    specStrengthPsi: '',
    specAmbientTempF: '',
    specConcreteTempF: '',
    specSlump: '',
    specAirContentByVolume: '',
  });

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const projectId = parseInt(id!);
      const projectData = await projectsAPI.get(projectId);
      setProject(projectData);
      setFormData({
        projectName: projectData.projectName || '',
        customerEmail: projectData.customerEmail || '',
        specStrengthPsi: projectData.specStrengthPsi || '',
        specAmbientTempF: projectData.specAmbientTempF || '',
        specConcreteTempF: projectData.specConcreteTempF || '',
        specSlump: projectData.specSlump || '',
        specAirContentByVolume: projectData.specAirContentByVolume || '',
      });
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.response?.data?.error || 'Failed to load project details.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      setSaving(true);
      setError('');
      await projectsAPI.update(project.id, formData);
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
                name="projectName"
                value={formData.projectName}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="customerEmail">Customer Email</label>
              <input
                type="email"
                id="customerEmail"
                name="customerEmail"
                value={formData.customerEmail}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-section">
            <h2>Project Specifications</h2>
            
            <div className="form-group">
              <label htmlFor="specStrengthPsi">Spec Strength (PSI)</label>
              <input
                type="text"
                id="specStrengthPsi"
                name="specStrengthPsi"
                value={formData.specStrengthPsi}
                onChange={handleChange}
                className="form-input"
                placeholder="e.g., 3000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specAmbientTempF">Spec Ambient Temperature (°F)</label>
              <input
                type="text"
                id="specAmbientTempF"
                name="specAmbientTempF"
                value={formData.specAmbientTempF}
                onChange={handleChange}
                className="form-input"
                placeholder="e.g., 70-80"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specConcreteTempF">Spec Concrete Temperature (°F)</label>
              <input
                type="text"
                id="specConcreteTempF"
                name="specConcreteTempF"
                value={formData.specConcreteTempF}
                onChange={handleChange}
                className="form-input"
                placeholder="e.g., 60-80"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specSlump">Spec Slump</label>
              <input
                type="text"
                id="specSlump"
                name="specSlump"
                value={formData.specSlump}
                onChange={handleChange}
                className="form-input"
                placeholder="e.g., 4-6"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specAirContentByVolume">Spec Air Content by Volume (%)</label>
              <input
                type="text"
                id="specAirContentByVolume"
                name="specAirContentByVolume"
                value={formData.specAirContentByVolume}
                onChange={handleChange}
                className="form-input"
                placeholder="e.g., 4-6"
              />
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

