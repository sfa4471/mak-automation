import React, { useState, useEffect } from 'react';
import QboSettings from './QboSettings';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { settingsAPI, WorkflowStatusResponse } from '../../api/settings';
import { intakeAPI, CalibrationStats } from '../../api/intake';
import { tenantsAPI, TenantMe, TenantMeUpdate } from '../../api/tenants';
import { getBackendPublicFileUrl } from '../../api/api';
import {
  isFolderPickerSupported,
  hasChosenFolder,
  getChosenFolderName,
  chooseFolder,
  clearChosenFolder,
} from '../../utils/browserFolder';
import './Settings.css';

const AUTO_SEND_PLACEHOLDERS = '{{companyName}}, {{clientName}}, {{projectNumber}}, {{date}}, {{reportCount}}';

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
  const [signaturePreviewFailed, setSignaturePreviewFailed] = useState(false);
  const [autoSendEnabled, setAutoSendEnabled] = useState<boolean | null>(null);
  const [autoSendBody, setAutoSendBody] = useState('');
  const [autoSendSaving, setAutoSendSaving] = useState(false);
  const [autoSendMsg, setAutoSendMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Automation settings (Phase 6+7)
  const [automationLoaded, setAutomationLoaded] = useState(false);
  const [intakeAutoAccept, setIntakeAutoAccept] = useState(false);
  const [intakeThreshold, setIntakeThreshold] = useState(92);
  const [dispatchAutoAssign, setDispatchAutoAssign] = useState(false);
  const [dispatchHoldMinutes, setDispatchHoldMinutes] = useState(30);
  const [intakeForwardAddress, setIntakeForwardAddress] = useState('');
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationMsg, setAutomationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [calibration, setCalibration] = useState<CalibrationStats | null>(null);

  useEffect(() => {
    loadSettings();
    loadAutoSendSettings();
    loadAutomationSettings();
  }, []);

  const loadAutoSendSettings = async () => {
    try {
      const [enabledResp, bodyResp] = await Promise.all([
        settingsAPI.getAutoSendEnabled(),
        settingsAPI.getAutoSendBodyTemplate(),
      ]);
      setAutoSendEnabled(Boolean(enabledResp.enabled));
      setAutoSendBody(bodyResp.bodyTemplate || '');
    } catch {
      setAutoSendEnabled(false);
    }
  };

  const loadAutomationSettings = async () => {
    try {
      const [auto, cal] = await Promise.all([
        settingsAPI.getAutomationSettings(),
        intakeAPI.getCalibration().catch(() => null),
      ]);
      setIntakeAutoAccept(auto.intakeAutoAccept);
      setIntakeThreshold(auto.intakeAutoAcceptThreshold);
      setDispatchAutoAssign(auto.dispatchAutoAssign);
      setDispatchHoldMinutes(auto.dispatchHoldMinutes);
      setIntakeForwardAddress(auto.intakeForwardAddress || '');
      setAutomationLoaded(true);
      setCalibration(cal);
    } catch {
      setAutomationLoaded(true);
    }
  };

  const saveAutomationSettings = async () => {
    setAutomationSaving(true);
    setAutomationMsg(null);
    try {
      await settingsAPI.setAutomationSettings({
        intakeAutoAccept,
        intakeAutoAcceptThreshold: intakeThreshold,
        dispatchAutoAssign,
        dispatchHoldMinutes,
        intakeForwardAddress,
      });
      setAutomationMsg({ type: 'success', text: 'Automation settings saved.' });
    } catch (e: any) {
      setAutomationMsg({ type: 'error', text: e?.response?.data?.error || 'Failed to save.' });
    } finally {
      setAutomationSaving(false);
    }
  };

  const saveAutoSend = async () => {
    setAutoSendSaving(true);
    setAutoSendMsg(null);
    try {
      await settingsAPI.setAutoSendBodyTemplate(autoSendBody);
      await settingsAPI.setAutoSendEnabled(autoSendEnabled ?? false);
      setAutoSendMsg({ type: 'success', text: 'Auto-send settings saved.' });
    } catch (e: any) {
      setAutoSendMsg({ type: 'error', text: e?.response?.data?.error || 'Failed to save auto-send settings.' });
    } finally {
      setAutoSendSaving(false);
    }
  };

  useEffect(() => {
    setSignaturePreviewFailed(false);
  }, [tenant?.signatureUrl]);

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
            Your company name, address, firm registration, engineer name, title, and signature. Used on reports and correspondence.
          </p>
          {tenantLoading ? (
            <p className="form-help">Loading…</p>
          ) : tenant ? (
            <div className="settings-form">
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
                <label>Firm registration number</label>
                <input className="form-input" value={tenantForm.peFirmReg ?? ''} onChange={(e) => updateTenantField('peFirmReg', e.target.value)} placeholder="Firm registration number" />
              </div>
              <div className="form-group">
                <label>Engineer name</label>
                <input className="form-input" value={tenantForm.licenseHolderName ?? ''} onChange={(e) => updateTenantField('licenseHolderName', e.target.value)} placeholder="Engineer name" />
              </div>
              <div className="form-group">
                <label>Title of Engineer</label>
                <input className="form-input" value={tenantForm.licenseHolderTitle ?? ''} onChange={(e) => updateTenantField('licenseHolderTitle', e.target.value)} placeholder="e.g. Geotechnical Engineer" />
              </div>
              <div className="form-group">
                <label>Enter your signature</label>
                <div className="signature-upload-row">
                  {tenant?.signatureUrl && (
                    <div className="signature-preview-wrap">
                      <div className="signature-preview-frame" aria-label="Signature preview">
                        {signaturePreviewFailed ? (
                          <span className="signature-preview-fallback">
                            Preview unavailable — try uploading again or check that the server can serve files from its public folder.
                          </span>
                        ) : (
                          <img
                            className="signature-preview-img"
                            src={getBackendPublicFileUrl(String(tenant.signatureUrl))}
                            alt=""
                            decoding="async"
                            onError={() => setSignaturePreviewFailed(true)}
                          />
                        )}
                      </div>
                      <div className="form-help signature-preview-caption">Current signature</div>
                    </div>
                  )}
                  <label className="btn btn-primary" style={{ marginBottom: 0 }}>
                    {tenant?.signatureUrl ? 'Replace signature' : 'Upload signature'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setMessage(null);
                        try {
                          await tenantsAPI.uploadSignature(file);
                          const updated = await tenantsAPI.getMe();
                          setTenant(updated);
                          setMessage({ type: 'success', text: 'Signature uploaded.' });
                        } catch (err: any) {
                          setMessage({ type: 'error', text: err?.response?.data?.error || 'Failed to upload signature' });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <small className="form-help">Image of your signature (used on PDF reports). JPEG, PNG, GIF or WebP.</small>
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

        {/* Auto-send approved reports */}
        <div className="settings-section">
          <h2>Auto-send Approved Reports</h2>
          <p className="settings-description">
            When enabled, approved reports are automatically emailed to clients each night.
          </p>
          {autoSendEnabled === null ? (
            <p className="form-help">Loading…</p>
          ) : (
            <div className="settings-form">
              <div className="form-group">
                <label>Nightly auto-send</label>
                <div className="autosend-toggle">
                  <label className="autosend-radio">
                    <input
                      type="radio"
                      name="auto-send-enabled"
                      checked={autoSendEnabled === true}
                      onChange={() => setAutoSendEnabled(true)}
                      disabled={autoSendSaving}
                    />
                    On
                  </label>
                  <label className="autosend-radio">
                    <input
                      type="radio"
                      name="auto-send-enabled"
                      checked={autoSendEnabled === false}
                      onChange={() => setAutoSendEnabled(false)}
                      disabled={autoSendSaving}
                    />
                    Off
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>Email body template</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={autoSendBody}
                  onChange={(e) => setAutoSendBody(e.target.value)}
                  placeholder="Enter the email body sent to clients when reports are delivered…"
                  disabled={autoSendSaving}
                />
                <small className="form-help">Placeholders: {AUTO_SEND_PLACEHOLDERS}</small>
              </div>
              {autoSendMsg && (
                <div className={`message ${autoSendMsg.type}`} style={{ marginBottom: '0.75rem' }}>
                  {autoSendMsg.text}
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveAutoSend}
                disabled={autoSendSaving}
              >
                {autoSendSaving ? 'Saving…' : 'Save auto-send settings'}
              </button>
            </div>
          )}
        </div>

        {/* Automation (Phase 6+7) */}
        <div className="settings-section">
          <h2 className="settings-section-title">Automation</h2>
          {!automationLoaded ? (
            <p style={{ color: '#6b7280', fontSize: 14 }}>Loading…</p>
          ) : (
            <div className="settings-form">

              {/* Intake email address — the address clients forward job requests to */}
              <div className="form-group">
                <label className="form-label">Intake email address</label>
                <input
                  type="email"
                  value={intakeForwardAddress}
                  onChange={e => setIntakeForwardAddress(e.target.value)}
                  placeholder="e.g. intake@crestfield.app"
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 14 }}
                />
                <p className="form-help" style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Emails sent to this address are parsed into draft workorders. Set up MX forwarding to SendGrid Inbound Parse pointing here.
                </p>
              </div>

              {/* Calibration stats — show before toggles so admin can decide */}
              {calibration && calibration.accepted > 0 && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>
                    Intake calibration — last {calibration.accepted} accepted
                  </div>

                  {/* Circuit breaker warning */}
                  {calibration.circuitBreakerActive && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                      <strong>Circuit breaker active</strong> — correction rate is above 20% this week. Auto-accept is suppressed until accuracy improves.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Project match', value: calibration.projectMatchAccuracy != null ? `${calibration.projectMatchAccuracy}%` : '—', good: (calibration.projectMatchAccuracy ?? 0) >= 90 },
                      { label: 'Date match', value: calibration.dateMatchAccuracy != null ? `${calibration.dateMatchAccuracy}%` : '—', good: (calibration.dateMatchAccuracy ?? 0) >= 90 },
                      { label: 'Avg score', value: calibration.avgMatchScore != null ? `${calibration.avgMatchScore}%` : '—', good: (calibration.avgMatchScore ?? 0) >= 85 },
                    ].map(stat => (
                      <div key={stat.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: stat.good ? '#16a34a' : '#dc2626' }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Phase 8: correction rate */}
                  {calibration.correctionRate != null && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#6b7280' }}>
                      <span>
                        Correction rate (7d):&nbsp;
                        <strong style={{ color: calibration.correctionRate > 20 ? '#dc2626' : calibration.correctionRate > 10 ? '#b45309' : '#16a34a' }}>
                          {calibration.correctionRate}%
                        </strong>
                      </span>
                      <span style={{ color: '#d1d5db' }}>|</span>
                      <span>{calibration.autoAccepted} auto · {calibration.humanReviewed} human · {calibration.pendingReview} pending</span>
                    </div>
                  )}

                  {/* Phase 9: outcome stats */}
                  {calibration.outcomeStats && !calibration.outcomeStats.dormant && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                      Real-world outcome accuracy:&nbsp;
                      <strong style={{ color: calibration.outcomeStats.matchRate >= 90 ? '#16a34a' : '#dc2626' }}>
                        {calibration.outcomeStats.matchRate}%
                      </strong>
                      &nbsp;({calibration.outcomeStats.matched}/{calibration.outcomeStats.total} matched)
                    </div>
                  )}
                  {calibration.outcomeStats?.dormant && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
                      Phase 9 outcome feedback dormant — needs {calibration.outcomeStats.minSamples - calibration.outcomeStats.total} more completed workorders to activate.
                    </div>
                  )}

                  {calibration.accepted < 10 && (
                    <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
                      Calibrate on at least 10 accepted intakes before enabling auto-accept.
                    </div>
                  )}
                </div>
              )}

              {/* Intake auto-accept */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Auto-accept high-confidence intakes</span>
                  <div className="autosend-toggle" style={{ display: 'inline-flex', gap: 0 }}>
                    <label className={`toggle-option${intakeAutoAccept ? ' toggle-option-active' : ''}`} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                      <input type="radio" name="intakeAutoAccept" checked={intakeAutoAccept} onChange={() => setIntakeAutoAccept(true)} style={{ display: 'none' }} />
                      On
                    </label>
                    <label className={`toggle-option${!intakeAutoAccept ? ' toggle-option-active' : ''}`} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                      <input type="radio" name="intakeAutoAccept" checked={!intakeAutoAccept} onChange={() => setIntakeAutoAccept(false)} style={{ display: 'none' }} />
                      Off
                    </label>
                  </div>
                </label>
                <p className="form-help" style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  When on, intakes with project match ≥ 85% and all field confidence scores above the threshold are committed automatically.
                </p>
              </div>

              {intakeAutoAccept && (
                <div className="form-group">
                  <label className="form-label">Confidence threshold: {intakeThreshold}%</label>
                  <input
                    type="range"
                    min={70}
                    max={99}
                    value={intakeThreshold}
                    onChange={e => setIntakeThreshold(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                    <span>70% (more auto)</span><span>99% (only sure things)</span>
                  </div>
                </div>
              )}

              {/* Dispatch auto-assign */}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Auto-assign dispatch (Tier 2)</span>
                  <div className="autosend-toggle" style={{ display: 'inline-flex', gap: 0 }}>
                    <label className={`toggle-option${dispatchAutoAssign ? ' toggle-option-active' : ''}`} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                      <input type="radio" name="dispatchAutoAssign" checked={dispatchAutoAssign} onChange={() => setDispatchAutoAssign(true)} style={{ display: 'none' }} />
                      On
                    </label>
                    <label className={`toggle-option${!dispatchAutoAssign ? ' toggle-option-active' : ''}`} style={{ padding: '4px 12px', cursor: 'pointer' }}>
                      <input type="radio" name="dispatchAutoAssign" checked={!dispatchAutoAssign} onChange={() => setDispatchAutoAssign(false)} style={{ display: 'none' }} />
                      Off
                    </label>
                  </div>
                </label>
                <p className="form-help" style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  When on, clicking "Auto-assign" on a workorder will commit immediately if exactly one technician has no conflicts.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Hold window (minutes)</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={dispatchHoldMinutes}
                  onChange={e => setDispatchHoldMinutes(Number(e.target.value) || 30)}
                  style={{ width: 100, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 14 }}
                />
                <p className="form-help" style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Time before the assignment email fires. Cancel appears in the dashboard strip during this window.
                </p>
              </div>

              {automationMsg && (
                <div className={`message ${automationMsg.type}`} style={{ marginBottom: '0.75rem' }}>
                  {automationMsg.text}
                </div>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={saveAutomationSettings}
                disabled={automationSaving}
                style={{ marginTop: 4 }}
              >
                {automationSaving ? 'Saving…' : 'Save Automation Settings'}
              </button>
            </div>
          )}
        </div>

        {/* QuickBooks Integration */}
        <div className="settings-section">
          <h2 className="settings-section-title">QuickBooks Integration</h2>
          <QboSettings />
        </div>

        {/* Support */}
        <div className="settings-section">
          <h2 className="settings-section-title">Support</h2>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>
            For help with your account, billing, or any issue, email us directly:
          </p>
          <a
            href="mailto:admin@crestfield.app"
            style={{ fontSize: 14, color: '#2563eb', fontWeight: 600 }}
          >
            admin@crestfield.app
          </a>
        </div>

      </div>
    </div>
  );
};

export default Settings;
