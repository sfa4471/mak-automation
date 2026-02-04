import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, OneDriveStatusResponse } from '../../api/settings';
import './Settings.css';

/**
 * Settings Component
 * Allows admin users to configure the OneDrive base path
 */
const Settings: React.FC = () => {
  const navigate = useNavigate();

  // State management
  const [path, setPath] = useState<string>('');
  const [status, setStatus] = useState<OneDriveStatusResponse | null>(null);
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
        settingsAPI.getOneDrivePath(),
        settingsAPI.getOneDriveStatus()
      ]);

      if (pathResponse.success) {
        setPath(pathResponse.path || '');
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
    if (!path.trim()) {
      setTestResult({
        isValid: false,
        error: 'Please enter a path'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const result = await settingsAPI.testOneDrivePath(path.trim());

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

      const pathToSave = path.trim() === '' ? null : path.trim();
      const result = await settingsAPI.setOneDrivePath(pathToSave);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Settings saved successfully'
        });
        // Reload status
        const statusResponse = await settingsAPI.getOneDriveStatus();
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
    setPath('');
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
          <h2>OneDrive Integration</h2>
          <p className="settings-description">
            Configure the base folder path for OneDrive integration. This folder will be used to store
            all project folders and PDFs. The folder must exist and be writable.
          </p>

          <div className="settings-form">
            <div className="form-group">
              <label htmlFor="onedrive-path">OneDrive Base Path</label>
              <input
                id="onedrive-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\YourName\OneDrive\Projects"
                disabled={loading}
                className="form-input"
              />
              <small className="form-help">
                Enter the full path to your OneDrive folder. Leave empty to disable OneDrive integration.
              </small>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={handleTestPath}
                disabled={loading || testing || !path.trim()}
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
