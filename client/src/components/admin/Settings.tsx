import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, WorkflowStatusResponse } from '../../api/settings';
import { tenantsAPI, TenantMe } from '../../api/tenants';
import './Settings.css';

/**
 * Settings Component
 * Allows admin users to configure the project folder location and company information (tenant branding).
 */
const Settings: React.FC = () => {
  const navigate = useNavigate();

  // State management for Project Folder Location
  const [folderPath, setFolderPath] = useState<string>('');
  const [status, setStatus] = useState<WorkflowStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ isValid: boolean; error?: string } | null>(null);

  // State for Company information (tenant branding)
  const [company, setCompany] = useState<TenantMe | null>(null);
  const [companyForm, setCompanyForm] = useState<Partial<TenantMe>>({});
  const [companyLoading, setCompanyLoading] = useState<boolean>(false);
  const [companySaving, setCompanySaving] = useState<boolean>(false);
  const [companyMessage, setCompanyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load settings when component mounts
  useEffect(() => {
    loadSettings();
    loadCompany();
  }, []);

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name ?? '',
        companyAddress: company.companyAddress ?? '',
        companyCity: company.companyCity ?? '',
        companyState: company.companyState ?? '',
        companyZip: company.companyZip ?? '',
        companyPhone: company.companyPhone ?? '',
        companyEmail: company.companyEmail ?? '',
        companyWebsite: company.companyWebsite ?? '',
        companyContactName: company.companyContactName ?? '',
        peFirmReg: company.peFirmReg ?? '',
        licenseHolderName: company.licenseHolderName ?? '',
        licenseHolderTitle: company.licenseHolderTitle ?? '',
      });
    }
  }, [company]);

  /**
   * Load current settings from the API
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      const [pathResponse, statusResponse] = await Promise.all([
        settingsAPI.getWorkflowPath(),
        settingsAPI.getWorkflowStatus()
      ]);

      if (pathResponse.success) {
        setFolderPath(pathResponse.path || '');
      }

      if (statusResponse.success) {
        setStatus(statusResponse);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load settings'
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load company (tenant) info for branding / PDFs
   */
  const loadCompany = async () => {
    try {
      setCompanyLoading(true);
      const data = await tenantsAPI.getMe();
      setCompany(data);
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error('Error loading company info:', error);
      }
      setCompany(null);
    } finally {
      setCompanyLoading(false);
    }
  };

  /**
   * Test the path without saving
   */
  const handleTestPath = async () => {
    if (!folderPath.trim()) {
      setTestResult({
        isValid: false,
        error: 'Please enter a path'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const result = await settingsAPI.testWorkflowPath(folderPath.trim());

      setTestResult({
        isValid: result.isValid,
        error: result.error
      });

      if (result.isValid && result.isWritable) {
        setMessage({
          type: 'success',
          text: 'Path is valid and writable!'
        });
      } else if (result.isValid && !result.isWritable) {
        setMessage({
          type: 'error',
          text: 'Path exists but is not writable'
        });
      }
    } catch (error: any) {
      console.error('Error testing path:', error);
      setTestResult({
        isValid: false,
        error: error.response?.data?.error || 'Failed to test path'
      });
    } finally {
      setTesting(false);
    }
  };

  /**
   * Save the path to the database
   */
  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);

      const pathToSave = folderPath.trim() === '' ? null : folderPath.trim();
      const result = await settingsAPI.setWorkflowPath(pathToSave);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Settings saved successfully'
        });
        // Reload status
        const statusResponse = await settingsAPI.getWorkflowStatus();
        if (statusResponse.success) {
          setStatus(statusResponse);
        }
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to save settings'
        });
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save settings'
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear the input field
   */
  const handleClear = () => {
    setFolderPath('');
    setTestResult(null);
    setMessage(null);
  };

  /**
   * Save company info (admin only; API enforces)
   */
  const handleSaveCompany = async () => {
    try {
      setCompanySaving(true);
      setCompanyMessage(null);
      await tenantsAPI.putMe(companyForm);
      await loadCompany();
      setCompanyMessage({ type: 'success', text: 'Company information saved.' });
    } catch (error: any) {
      setCompanyMessage({
        type: 'error',
        text: error.response?.data?.error || 'Failed to save company information'
      });
    } finally {
      setCompanySaving(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2>Project Folder Location</h2>
          <p className="settings-description">
            Configure the base folder location where project folders and PDFs will be stored. 
            When you create a new project, a folder will be created at this location. 
            All PDFs generated for that project will be saved in the project's folder.
            The folder path must exist and be writable (e.g., OneDrive, local drive, network share).
          </p>

          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="folder-path">Project Folder Location</label>
              <input
                id="folder-path"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="C:\Users\YourName\OneDrive\Projects"
                disabled={loading}
                className="form-input"
              />
              <small className="form-help">
                Enter the full path to your project folder (e.g., OneDrive path, local drive, or network share). 
                Leave empty to use the default location.
              </small>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={handleTestPath}
                disabled={loading || testing || !folderPath.trim()}
                className="btn btn-secondary"
              >
                {testing ? 'Testing...' : 'Test Path'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || testing}
                className="btn btn-primary"
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading || testing}
                className="btn btn-link"
              >
                Clear
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.isValid ? 'success' : 'error'}`}>
                {testResult.isValid ? (
                  <span>✓ Path is valid and writable</span>
                ) : (
                  <span>✗ {testResult.error || 'Path is invalid'}</span>
                )}
              </div>
            )}

            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
          </div>

          {status && (
            <div className="settings-status">
              <h3>Current Status</h3>
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Configured:</span>
                  <span className={`status-value ${status.configured ? 'yes' : 'no'}`}>
                    {status.configured ? 'Yes' : 'No'}
                  </span>
                </div>
                {status.configured && (
                  <>
                    <div className="status-item">
                      <span className="status-label">Path:</span>
                      <span className="status-value path">{status.path}</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Valid:</span>
                      <span className={`status-value ${status.isValid ? 'yes' : 'no'}`}>
                        {status.isValid ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Writable:</span>
                      <span className={`status-value ${status.isWritable ? 'yes' : 'no'}`}>
                        {status.isWritable ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {status.error && (
                      <div className="status-item error">
                        <span className="status-label">Error:</span>
                        <span className="status-value">{status.error}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Company information (tenant branding) - multi-tenant only */}
        {(company !== null || companyLoading) && (
          <div className="settings-section">
            <h2>Company Information</h2>
            <p className="settings-description">
              This information appears on generated PDFs (reports, work orders). Only admins can edit. 
              Rebar reports use P.E. firm reg and license holder fields in the signature block.
            </p>

            {companyLoading ? (
              <p className="form-help">Loading...</p>
            ) : company ? (
              <div className="settings-form">
                <div className="form-row-grid">
                  <div className="form-group">
                    <label htmlFor="company-name">Company name</label>
                    <input
                      id="company-name"
                      type="text"
                      value={companyForm.name ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))}
                      className="form-input"
                      placeholder="e.g. MAK Lone Star Consulting"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-contact">Contact name</label>
                    <input
                      id="company-contact"
                      type="text"
                      value={companyForm.companyContactName ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyContactName: e.target.value }))}
                      className="form-input"
                      placeholder="Primary contact"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="company-address">Address (street)</label>
                  <input
                    id="company-address"
                    type="text"
                    value={companyForm.companyAddress ?? ''}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, companyAddress: e.target.value }))}
                    className="form-input"
                    placeholder="940 N Beltline Road, Suite 107"
                  />
                </div>
                <div className="form-row-grid form-row-grid-3">
                  <div className="form-group">
                    <label htmlFor="company-city">City</label>
                    <input
                      id="company-city"
                      type="text"
                      value={companyForm.companyCity ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyCity: e.target.value }))}
                      className="form-input"
                      placeholder="Irving"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-state">State</label>
                    <input
                      id="company-state"
                      type="text"
                      value={companyForm.companyState ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyState: e.target.value }))}
                      className="form-input"
                      placeholder="TX"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-zip">ZIP</label>
                    <input
                      id="company-zip"
                      type="text"
                      value={companyForm.companyZip ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyZip: e.target.value }))}
                      className="form-input"
                      placeholder="75061"
                    />
                  </div>
                </div>
                <div className="form-row-grid">
                  <div className="form-group">
                    <label htmlFor="company-phone">Phone</label>
                    <input
                      id="company-phone"
                      type="text"
                      value={companyForm.companyPhone ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyPhone: e.target.value }))}
                      className="form-input"
                      placeholder="(214) 718-1250"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-email">Email</label>
                    <input
                      id="company-email"
                      type="email"
                      value={companyForm.companyEmail ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, companyEmail: e.target.value }))}
                      className="form-input"
                      placeholder="info@example.com"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="company-website">Website</label>
                  <input
                    id="company-website"
                    type="url"
                    value={companyForm.companyWebsite ?? ''}
                    onChange={(e) => setCompanyForm((f) => ({ ...f, companyWebsite: e.target.value }))}
                    className="form-input"
                    placeholder="https://..."
                  />
                </div>

                <div className="settings-section subsection">
                  <h3>Rebar report (P.E. / license holder)</h3>
                  <div className="form-row-grid">
                    <div className="form-group">
                      <label htmlFor="pe-firm-reg">P.E. firm registration</label>
                      <input
                        id="pe-firm-reg"
                        type="text"
                        value={companyForm.peFirmReg ?? ''}
                        onChange={(e) => setCompanyForm((f) => ({ ...f, peFirmReg: e.target.value }))}
                        className="form-input"
                        placeholder="e.g. F-24443"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="license-holder-name">License holder name</label>
                      <input
                        id="license-holder-name"
                        type="text"
                        value={companyForm.licenseHolderName ?? ''}
                        onChange={(e) => setCompanyForm((f) => ({ ...f, licenseHolderName: e.target.value }))}
                        className="form-input"
                        placeholder="e.g. Muhammad Awais Khan, P.E."
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="license-holder-title">License holder title</label>
                    <input
                      id="license-holder-title"
                      type="text"
                      value={companyForm.licenseHolderTitle ?? ''}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, licenseHolderTitle: e.target.value }))}
                      className="form-input"
                      placeholder="e.g. Geotechnical Engineer"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={handleSaveCompany}
                    disabled={companySaving}
                    className="btn btn-primary"
                  >
                    {companySaving ? 'Saving...' : 'Save company information'}
                  </button>
                </div>

                {companyMessage && (
                  <div className={`message ${companyMessage.type}`}>
                    {companyMessage.text}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
