import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import gaugesApi, { GaugeCheckout as GaugeCheckoutType, NuclearGauge } from '../api/gauges';
import { projectsAPI, Project } from '../api/projects';
import { useAuth } from '../context/AuthContext';
import './GaugeCheckout.css';

type Phase = 'loading' | 'error' | 'checkout' | 'checkin' | 'done-out' | 'done-in';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function hoursAgo(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  return `${Math.round(h * 10) / 10}h ago`;
}

export default function GaugeCheckout() {
  const { id } = useParams<{ id: string }>();
  const gaugeId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const isGuest = !user;

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [gauge, setGauge] = useState<NuclearGauge | null>(null);
  const [openCheckout, setOpenCheckout] = useState<GaugeCheckoutType | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Guest name (unregistered technician)
  const [guestName, setGuestName] = useState('');

  // Checkout form
  const [destination, setDestination] = useState('');
  const [blockClosed, setBlockClosed] = useState<boolean | null>(null);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [manualProject, setManualProject] = useState('');
  const [useManualProject, setUseManualProject] = useState(isGuest); // guests always use text
  const [chd, setChd] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [savedCheckout, setSavedCheckout] = useState<GaugeCheckoutType | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await gaugesApi.getStatus(gaugeId);
      setGauge(data.gauge);
      if (data.status === 'in_field') {
        setOpenCheckout(data.currentCheckout);
        setPhase('checkin');
      } else {
        setPhase('checkout');
      }
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || 'Gauge not found.');
      setPhase('error');
    }
  }, [gaugeId]);

  useEffect(() => {
    loadStatus();
    // Only fetch project dropdown for logged-in users
    if (!isGuest) {
      projectsAPI.list().then(setProjects).catch(() => {});
    }
  }, [loadStatus, isGuest]);

  async function handleCheckout() {
    setValidationError('');
    if (isGuest && !guestName.trim()) return setValidationError('Your name is required.');
    if (!destination.trim()) return setValidationError('Destination / job site is required.');
    if (blockClosed === null) return setValidationError('Please confirm the block standardization check.');

    const finalProjectName = isGuest
      ? (manualProject.trim() || null)
      : useManualProject
        ? (manualProject.trim() || null)
        : (projects.find((p) => p.id === Number(projectId))?.projectName || null);

    setSubmitting(true);
    try {
      const result = await gaugesApi.checkout(gaugeId, {
        destination: destination.trim(),
        blockClosed,
        technicianName: isGuest ? guestName.trim() : undefined,
        projectId: !isGuest && !useManualProject && projectId ? Number(projectId) : null,
        projectName: finalProjectName,
        chd: chd.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSavedCheckout(result);
      setPhase('done-out');
    } catch (e: any) {
      setValidationError(e?.response?.data?.error || 'Failed to check out. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckin() {
    setSubmitting(true);
    try {
      const result = await gaugesApi.checkin(gaugeId, {
        notes: notes.trim() || undefined,
        chd: chd.trim() || undefined,
      });
      setSavedCheckout(result);
      setPhase('done-in');
    } catch (e: any) {
      setValidationError(e?.response?.data?.error || 'Failed to check in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = gauge?.nickname || gauge?.serialNumber || '…';
  const checkedOutByMe = !isGuest && openCheckout?.technicianId === (user as any)?.id;
  const checkedOutName = openCheckout
    ? ((openCheckout as any).users?.name || (openCheckout as any).technicianName || 'Unknown')
    : null;

  // ---- LOADING ----
  if (phase === 'loading') {
    return (
      <div className="gc-wrap">
        <div className="gc-card gc-center">
          <div className="gc-spinner" />
          <p className="gc-sub">Loading gauge…</p>
        </div>
      </div>
    );
  }

  // ---- ERROR ----
  if (phase === 'error') {
    return (
      <div className="gc-wrap">
        <div className="gc-card gc-center">
          <div className="gc-icon-circle error">!</div>
          <h2 className="gc-title">Gauge Not Found</h2>
          <p className="gc-sub">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ---- SUCCESS: CHECKED OUT ----
  if (phase === 'done-out') {
    return (
      <div className="gc-wrap">
        <div className="gc-card gc-center">
          <div className="gc-icon-circle success">✓</div>
          <h2 className="gc-title">Checked Out</h2>
          <p className="gc-sub">{displayName} is signed out to {isGuest ? guestName : user?.name || 'you'}.</p>
          <div className="gc-summary">
            <div className="gc-summary-row">
              <span>Time out</span>
              <span>{savedCheckout ? formatTime(savedCheckout.timeOut) : formatTime(new Date().toISOString())}</span>
            </div>
            {savedCheckout?.projectName && (
              <div className="gc-summary-row">
                <span>Project</span>
                <span>{savedCheckout.projectName}</span>
              </div>
            )}
            <div className="gc-summary-row">
              <span>Destination</span>
              <span>{savedCheckout?.destination}</span>
            </div>
            <div className="gc-summary-row">
              <span>Block std.</span>
              <span className={savedCheckout?.blockClosed ? 'gc-ok' : 'gc-warn'}>
                {savedCheckout?.blockClosed ? 'Completed' : 'Not completed'}
              </span>
            </div>
          </div>
          <p className="gc-footer-note">Scan the QR code when you return the gauge.</p>
          {!isGuest && (
            <button className="gc-home-btn" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
          )}
        </div>
      </div>
    );
  }

  // ---- SUCCESS: CHECKED IN ----
  if (phase === 'done-in') {
    return (
      <div className="gc-wrap">
        <div className="gc-card gc-center">
          <div className="gc-icon-circle green">✓</div>
          <h2 className="gc-title">Returned to Lab</h2>
          <p className="gc-sub">{displayName} has been checked back in.</p>
          <div className="gc-summary">
            <div className="gc-summary-row">
              <span>Time in</span>
              <span>{formatTime(new Date().toISOString())}</span>
            </div>
          </div>
          {!isGuest && (
            <button className="gc-home-btn" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="gc-wrap">
      <div className="gc-card">

        {/* Gauge header */}
        <div className="gc-gauge-header">
          <div className={`gc-status-pill ${phase === 'checkin' ? 'in-field' : 'in-lab'}`}>
            {phase === 'checkin' ? 'In Field' : 'In Lab'}
          </div>
          <h2 className="gc-title">{displayName}</h2>
          <p className="gc-model">{gauge?.model} · S/N {gauge?.serialNumber}</p>
        </div>

        {/* Check-in: current checkout info */}
        {phase === 'checkin' && openCheckout && (
          <div className={`gc-current-info ${!checkedOutByMe ? 'other-user' : ''}`}>
            <div className="gc-info-row">
              <span className="gc-info-label">Checked out by</span>
              <span className="gc-info-value">{checkedOutName}</span>
            </div>
            <div className="gc-info-row">
              <span className="gc-info-label">Time out</span>
              <span className="gc-info-value">{formatTime(openCheckout.timeOut)} · {hoursAgo(openCheckout.timeOut)}</span>
            </div>
            {openCheckout.projectName && (
              <div className="gc-info-row">
                <span className="gc-info-label">Project</span>
                <span className="gc-info-value">{openCheckout.projectName}</span>
              </div>
            )}
            <div className="gc-info-row">
              <span className="gc-info-label">Destination</span>
              <span className="gc-info-value">{openCheckout.destination}</span>
            </div>
            {!checkedOutByMe && (
              <p className="gc-other-warning">
                {isGuest
                  ? 'Only check in if you are returning this gauge to the lab.'
                  : 'This gauge was checked out by someone else. Only check it in if returning it on their behalf.'}
              </p>
            )}
          </div>
        )}

        <div className="gc-divider" />
        <h3 className="gc-form-title">{phase === 'checkout' ? '↑ Check Out' : '↓ Check In'}</h3>

        {validationError && <div className="gc-validation-error">{validationError}</div>}

        {/* ---- GUEST NAME (always first for unregistered users) ---- */}
        {isGuest && (
          <div className="gc-field gc-guest-banner">
            <label className="gc-label">Your Name <span className="gc-required">*</span></label>
            <input
              className="gc-input"
              placeholder="First and last name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* ---- CHECKOUT FIELDS ---- */}
        {phase === 'checkout' && (
          <>
            {/* Project */}
            <div className="gc-field">
              <label className="gc-label">Project <span className="gc-optional">(optional)</span></label>
              {isGuest ? (
                <input
                  className="gc-input"
                  placeholder="Project name"
                  value={manualProject}
                  onChange={(e) => setManualProject(e.target.value)}
                />
              ) : !useManualProject ? (
                <div className="gc-project-row">
                  <select
                    className="gc-select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Select a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.projectName}</option>
                    ))}
                  </select>
                  <button className="gc-link-btn" onClick={() => { setUseManualProject(true); setProjectId(''); }}>
                    Not listed
                  </button>
                </div>
              ) : (
                <div className="gc-project-row">
                  <input
                    className="gc-input"
                    placeholder="Project name"
                    value={manualProject}
                    onChange={(e) => setManualProject(e.target.value)}
                  />
                  <button className="gc-link-btn" onClick={() => { setUseManualProject(false); setManualProject(''); }}>
                    Pick from list
                  </button>
                </div>
              )}
            </div>

            <div className="gc-field">
              <label className="gc-label">Destination / Job Site <span className="gc-required">*</span></label>
              <input
                className="gc-input"
                placeholder="e.g. 1234 Main St, Site B"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div className="gc-field">
              <label className="gc-label">
                Block Standardization Check <span className="gc-required">*</span>
              </label>
              <p className="gc-field-hint">Confirm you performed and closed the block std. before leaving the lab.</p>
              <div className="gc-toggle-row">
                <button className={`gc-toggle ${blockClosed === true ? 'yes' : ''}`} onClick={() => setBlockClosed(true)}>
                  Yes — completed
                </button>
                <button className={`gc-toggle ${blockClosed === false ? 'no' : ''}`} onClick={() => setBlockClosed(false)}>
                  No
                </button>
              </div>
            </div>

            <div className="gc-field">
              <label className="gc-label">CHD <span className="gc-optional">(optional)</span></label>
              <input className="gc-input" placeholder="Count history data reading" value={chd} onChange={(e) => setChd(e.target.value)} />
            </div>

            <div className="gc-field">
              <label className="gc-label">Notes <span className="gc-optional">(optional)</span></label>
              <textarea className="gc-textarea" rows={2} placeholder="Any observations or special conditions" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <button className="gc-submit-btn checkout" onClick={handleCheckout} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Check Out Gauge'}
            </button>
          </>
        )}

        {/* ---- CHECKIN FIELDS ---- */}
        {phase === 'checkin' && (
          <>
            <div className="gc-field">
              <label className="gc-label">CHD <span className="gc-optional">(optional)</span></label>
              <input className="gc-input" placeholder="Count history data reading" value={chd} onChange={(e) => setChd(e.target.value)} />
            </div>

            <div className="gc-field">
              <label className="gc-label">Notes <span className="gc-optional">(optional)</span></label>
              <textarea className="gc-textarea" rows={2} placeholder="Any issues, damage, or observations?" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <button className="gc-submit-btn checkin" onClick={handleCheckin} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Return Gauge to Lab'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
