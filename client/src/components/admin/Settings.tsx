import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, WorkflowStatusResponse } from '../../api/settings';
import './Settings.css';

/**
 * Settings Component
 * Allows admin users to configure the project folder location for storing projects and PDFs
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

  // Load settings when component mounts
  useEffect(() => {
    loadSettings();
  }, []);

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
      </div>
    </div>
  );
};

export default Settings;
