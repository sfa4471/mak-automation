import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsAPI, WorkflowStatusResponse } from '../../api/settings';
import {
  isFolderPickerSupported,
  hasChosenFolder,
  getChosenFolderName,
  chooseFolder,
  clearChosenFolder,
} from '../../utils/browserFolder';
import './Settings.css';

/**
 * Settings Component
 * Allows admin users to configure the project folder location (choose folder on this device).
 */
const Settings: React.FC = () => {
  const navigate = useNavigate();

  const [status, setStatus] = useState<WorkflowStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [browserFolderName, setBrowserFolderName] = useState<string | null>(null);
  const [browserFolderLoading, setBrowserFolderLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasChosenFolder().then((yes) => {
      if (cancelled) return;
      if (yes) getChosenFolderName().then((n) => { if (!cancelled) setBrowserFolderName(n); });
      else setBrowserFolderName(null);
    });
    return () => { cancelled = true; };
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const statusResponse = await settingsAPI.getWorkflowStatus();
      if (statusResponse.success) {
        setStatus(statusResponse);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
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
            Choose a folder on this device. New project folders and PDFs will be saved there.
            You only need to pick the folder once; no server path or extra setup.
          </p>

          {isFolderPickerSupported() ? (
            <div className="settings-form" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>Folder on this device</label>
                {browserFolderName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className="status-value yes" style={{ fontWeight: 500 }}>
                      ✓ {browserFolderName}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setBrowserFolderLoading(true);
                        try {
                          await clearChosenFolder();
                          setBrowserFolderName(null);
                          setMessage({ type: 'success', text: 'Folder cleared. Click "Choose folder" to pick again.' });
                        } catch (e: any) {
                          setMessage({ type: 'error', text: e?.message || 'Failed to clear' });
                        } finally {
                          setBrowserFolderLoading(false);
                        }
                      }}
                      disabled={browserFolderLoading}
                      className="btn btn-link"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setBrowserFolderLoading(true);
                      setMessage(null);
                      try {
                        const { name } = await chooseFolder();
                        setBrowserFolderName(name);
                        setMessage({ type: 'success', text: 'Folder selected. Project folders and PDFs will save here.' });
                      } catch (e: any) {
                        setMessage({ type: 'error', text: e?.message || 'Could not open folder picker' });
                      } finally {
                        setBrowserFolderLoading(false);
                      }
                    }}
                    disabled={browserFolderLoading}
                    className="btn btn-primary"
                  >
                    {browserFolderLoading ? 'Opening…' : 'Choose folder'}
                  </button>
                )}
                <small className="form-help">
                  Works in Chrome and Edge. Project folders and PDFs will be created in the folder you choose.
                </small>
              </div>
            </div>
          ) : (
            <p className="form-help" style={{ marginBottom: '1rem', color: '#856404' }}>
              Your browser does not support choosing a folder here. Please use Chrome or Edge.
            </p>
          )}

          {(browserFolderName || message) && (
            <div className="settings-status">
              {message && (
                <div className={`message ${message.type}`} style={{ marginTop: '1rem' }}>
                  {message.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
