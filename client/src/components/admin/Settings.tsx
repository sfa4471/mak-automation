import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { settingsAPI, WorkflowStatusResponse } from '../../api/settings';
import { tenantsAPI, TenantMe, TenantMeUpdate } from '../../api/tenants';
import { getCurrentApiBaseUrl } from '../../api/api';
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
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const [status, setStatus] = useState<WorkflowStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [browserFolderName, setBrowserFolderName] = useState<string | null>(null);
  const [browserFolderLoading, setBrowserFolderLoading] = useState(false);
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantForm, setTenantForm] = useState<TenantMeUpdate>({});

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTenantLoading(true);
    tenantsAPI.getMe()
      .then((data) => { if (!cancelled) setTenant(data); setTenantForm({
        name: data.name ?? '',
        companyAddress: data.companyAddress ?? '',
        companyCity: data.companyCity ?? '',
        companyState: data.companyState ?? '',
        companyZip: data.companyZip ?? '',
        companyPhone: data.companyPhone ?? '',
        companyEmail: data.companyEmail ?? '',
        companyWebsite: data.companyWebsite ?? '',
        companyContactName: data.companyContactName ?? '',
        peFirmReg: data.peFirmReg ?? '',
        licenseHolderName: data.licenseHolderName ?? '',
        licenseHolderTitle: data.licenseHolderTitle ?? '',
      }); })
      .catch(() => { if (!cancelled) setTenant(null); })
      .finally(() => { if (!cancelled) setTenantLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    hasChosenFolder(tenantId).then((yes) => {
      if (cancelled) return;
      if (yes) getChosenFolderName(tenantId).then((n) => { if (!cancelled) setBrowserFolderName(n); });
      else setBrowserFolderName(null);
    });
    return () => { cancelled = true; };
  }, [tenantId]);

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

  const updateTenantField = <K extends keyof TenantMeUpdate>(key: K, value: TenantMeUpdate[K]) => {
    setTenantForm((prev) => ({ ...prev, [key]: value ?? '' }));
  };

  const saveCompanyProfile = async () => {
    setMessage(null);
    setTenantSaving(true);
    try {
      const payload: TenantMeUpdate = {};
      (Object.keys(tenantForm) as (keyof TenantMeUpdate)[]).forEach((k) => {
        const v = tenantForm[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') payload[k] = v;
        else payload[k] = null;
      });
      await tenantsAPI.putMe(payload);
      const updated = await tenantsAPI.getMe();
      setTenant(updated);
      setMessage({ type: 'success', text: 'Company profile saved.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.response?.data?.error || 'Failed to save company profile' });
    } finally {
      setTenantSaving(false);
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
        {/* Company / Tenant profile */}
        <div className="settings-section">
          <h2>Company Profile</h2>
          <p className="settings-description">
            Your company name, address, P.E. registration, and license holder. Used on reports and correspondence.
          </p>
          {tenantLoading ? (
            <p className="form-help">Loading…</p>
          ) : tenant ? (
            <div className="settings-form">
              <div className="form-group company-logo-preview">
                <label>Company logo</label>
                {tenant.logoPath ? (
                  <img src={`${getCurrentApiBaseUrl()}/${tenant.logoPath.replace(/^\/+/, '')}`} alt={tenant.name ?? 'Logo'} style={{ maxWidth: 120, maxHeight: 80, objectFit: 'contain', border: '1px solid #ddd', borderRadius: 4 }} />
                ) : (
                  <span className="form-help">Logo is set when the company is created.</span>
                )}
              </div>
              <div className="form-group">
                <label>Company name</label>
                <input className="form-input" value={tenantForm.name ?? ''} onChange={(e) => updateTenantField('name', e.target.value)} placeholder="Company name" />
              </div>
              <div className="form-group">
                <label>Company contact name</label>
                <input className="form-input" value={tenantForm.companyContactName ?? ''} onChange={(e) => updateTenantField('companyContactName', e.target.value)} placeholder="Contact name" />
              </div>
              <div className="form-group">
                <label>Street address</label>
                <input className="form-input" value={tenantForm.companyAddress ?? ''} onChange={(e) => updateTenantField('companyAddress', e.target.value)} placeholder="Street address" />
              </div>
              <div className="form-row-grid form-row-grid-3">
                <div className="form-group">
                  <label>City</label>
                  <input className="form-input" value={tenantForm.companyCity ?? ''} onChange={(e) => updateTenantField('companyCity', e.target.value)} placeholder="City" />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input className="form-input" value={tenantForm.companyState ?? ''} onChange={(e) => updateTenantField('companyState', e.target.value)} placeholder="State" />
                </div>
                <div className="form-group">
                  <label>Zip</label>
                  <input className="form-input" value={tenantForm.companyZip ?? ''} onChange={(e) => updateTenantField('companyZip', e.target.value)} placeholder="Zip" />
                </div>
              </div>
              <div className="form-group">
                <label>Company phone</label>
                <input className="form-input" type="tel" value={tenantForm.companyPhone ?? ''} onChange={(e) => updateTenantField('companyPhone', e.target.value)} placeholder="Phone" />
              </div>
              <div className="form-group">
                <label>Company email</label>
                <input className="form-input" type="email" value={tenantForm.companyEmail ?? ''} onChange={(e) => updateTenantField('companyEmail', e.target.value)} placeholder="Email" />
              </div>
              <div className="form-group">
                <label>Company website</label>
                <input className="form-input" type="url" value={tenantForm.companyWebsite ?? ''} onChange={(e) => updateTenantField('companyWebsite', e.target.value)} placeholder="https://..." />
              </div>
              <div className="form-group">
                <label>P.E. registration number</label>
                <input className="form-input" value={tenantForm.peFirmReg ?? ''} onChange={(e) => updateTenantField('peFirmReg', e.target.value)} placeholder="P.E. firm registration" />
              </div>
              <div className="form-group">
                <label>License holder name</label>
                <input className="form-input" value={tenantForm.licenseHolderName ?? ''} onChange={(e) => updateTenantField('licenseHolderName', e.target.value)} placeholder="License holder" />
              </div>
              <div className="form-group">
                <label>License holder title</label>
                <input className="form-input" value={tenantForm.licenseHolderTitle ?? ''} onChange={(e) => updateTenantField('licenseHolderTitle', e.target.value)} placeholder="e.g. P.E." />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={saveCompanyProfile} disabled={tenantSaving}>
                  {tenantSaving ? 'Saving…' : 'Save company profile'}
                </button>
              </div>
            </div>
          ) : (
            <p className="form-help">Unable to load company profile.</p>
          )}
        </div>

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
                          await clearChosenFolder(tenantId);
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
                          const { name } = await chooseFolder(tenantId);
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
