import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsAPI, ProjectSpecs } from '../../api/projects';
import './Admin.css';

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [specStrengthPsi, setSpecStrengthPsi] = useState('');
  const [specAmbientTempF, setSpecAmbientTempF] = useState('');
  const [specConcreteTempF, setSpecConcreteTempF] = useState('');
  const [specSlump, setSpecSlump] = useState('');
  const [specAirContentByVolume, setSpecAirContentByVolume] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const specs: ProjectSpecs = {};
      if (specStrengthPsi) specs.specStrengthPsi = specStrengthPsi;
      if (specAmbientTempF) specs.specAmbientTempF = specAmbientTempF;
      if (specConcreteTempF) specs.specConcreteTempF = specConcreteTempF;
      if (specSlump) specs.specSlump = specSlump;
      if (specAirContentByVolume) specs.specAirContentByVolume = specAirContentByVolume;

      await projectsAPI.create(
        projectName,
        Object.keys(specs).length > 0 ? specs : undefined,
        customerEmail || undefined
      );
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
            <label htmlFor="customerEmail">Customer Email</label>
            <input
              type="email"
              id="customerEmail"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
            <h3 style={{ marginBottom: '15px', fontSize: '16px', fontWeight: '600' }}>Project Specifications</h3>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
              These specifications will be used across all tasks in this project.
            </p>

            <div className="form-group">
              <label htmlFor="specStrengthPsi">Spec Strength (PSI) *</label>
              <input
                type="text"
                id="specStrengthPsi"
                value={specStrengthPsi}
                onChange={(e) => setSpecStrengthPsi(e.target.value)}
                placeholder="e.g., 4000"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="specAmbientTempF">Ambient Temp (°F)</label>
              <input
                type="text"
                id="specAmbientTempF"
                value={specAmbientTempF}
                onChange={(e) => setSpecAmbientTempF(e.target.value)}
                placeholder="e.g., 70 or 65-75"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specConcreteTempF">Concrete Temp (°F)</label>
              <input
                type="text"
                id="specConcreteTempF"
                value={specConcreteTempF}
                onChange={(e) => setSpecConcreteTempF(e.target.value)}
                placeholder="e.g., 75 or 70-80"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specSlump">Slump</label>
              <input
                type="text"
                id="specSlump"
                value={specSlump}
                onChange={(e) => setSpecSlump(e.target.value)}
                placeholder="e.g., 3-5"
              />
            </div>

            <div className="form-group">
              <label htmlFor="specAirContentByVolume">Air Content (% by Volume)</label>
              <input
                type="text"
                id="specAirContentByVolume"
                value={specAirContentByVolume}
                onChange={(e) => setSpecAirContentByVolume(e.target.value)}
                placeholder="e.g., 3-6"
              />
            </div>
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
          * Project number will be auto-generated in format MAK-YYYY-####
          <br />
          * Tasks can be created after project creation
        </p>
      </div>
    </div>
  );
};

export default CreateProject;

