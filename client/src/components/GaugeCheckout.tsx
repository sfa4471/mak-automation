import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import gaugesApi, { GaugeCheckout as GaugeCheckoutType, NuclearGauge } from '../api/gauges';
import { projectsAPI, Project } from '../api/projects';
import './GaugeCheckout.css';

type Phase = 'loading' | 'error' | 'checkout' | 'checkin' | 'done';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GaugeCheckout() {
  const { id } = useParams<{ id: string }>();
  const gaugeId = Number(id);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [gauge, setGauge] = useState<NuclearGauge | null>(null);
  const [openCheckout, setOpenCheckout] = useState<GaugeCheckoutType | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Checkout form state
  const [destination, setDestination] = useState('');
  const [blockClosed, setBlockClosed] = useState<boolean | null>(null);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [manualProject, setManualProject] = useState('');
  const [useManualProject, setUseManualProject] = useState(false);
  const [chd, setChd] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

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
      setErrorMsg(e?.response?.data?.error || 'Gauge not found');
      setPhase('error');
    }
  }, [gaugeId]);

  useEffect(() => {
    loadStatus();
    projectsAPI.list().then(setProjects).catch(() => {});
  }, [loadStatus]);

  // ---- Check Out ----
  async function handleCheckout() {
    setValidationError('');
    if (!destination.trim()) return setValidationError('Destination is required.');
    if (blockClosed === null) return setValidationError('Please confirm the block standardization check.');
    const finalProjectName = useManualProject
      ? manualProject.trim() || null
      : projects.find((p) => p.id === Number(projectId))?.projectName || null;

    setSubmitting(true);
    try {
      await gaugesApi.checkout(gaugeId, {
        destination: destination.trim(),
        blockClosed,
        projectId: !useManualProject && projectId ? Number(projectId) : null,
        projectName: finalProjectName,
        chd: chd.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setPhase('done');
    } catch (e: any) {
      setValidationError(e?.response?.data?.error || 'Failed to check out gauge');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Check In ----
  async function handleCheckin() {
    setSubmitting(true);
    try {
      await gaugesApi.checkin(gaugeId, {
        notes: notes.trim() || undefined,
        chd: chd.trim() || undefined,
      });
      setPhase('done');
    } catch (e: any) {
      setValidationError(e?.response?.data?.error || 'Failed to check in gauge');
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = gauge?.nickname || gauge?.serialNumber || '…';

  if (phase === 'loading') {
    return (
      <div className="gc-wrap">
        <div className="gc-card">
          <div className="gc-loading">Loading gauge…</div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="gc-wrap">
        <div className="gc-card">
          <div className="gc-error-icon">⚠️</div>
          <h2 className="gc-title">Gauge Not Found</h2>
          <p className="gc-sub">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const isCheckin = !!openCheckout;
    return (
      <div className="gc-wrap">
        <div className="gc-card gc-success">
          <div className="gc-success-icon">✓</div>
          <h2 className="gc-title">{isCheckin ? 'Checked In' : 'Checked Out'}</h2>
          <p className="gc-sub">
            {isCheckin
              ? `${displayName} has been returned to the lab.`
              : `${displayName} is now signed out to you.`}
          </p>
          <p className="gc-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gc-wrap">
      <div className="gc-card">

        {/* Gauge identity */}
        <div className={`gc-status-dot ${phase === 'checkin' ? 'in-field' : 'in-lab'}`} />
        <h2 className="gc-title">{displayName}</h2>
        <p className="gc-model">{gauge?.model} · S/N {gauge?.serialNumber}</p>

        {phase === 'checkin' && openCheckout && (
          <div className="gc-current-info">
            <div className="gc-info-row">
              <span className="gc-info-label">Checked out</span>
              <span className="gc-info-value">{formatTime(openCheckout.timeOut)}</span>
            </div>
            <div className="gc-info-row">
              <span className="gc-info-label">Project</span>
              <span className="gc-info-value">{openCheckout.projectName || '—'}</span>
            </div>
            <div className="gc-info-row">
              <span className="gc-info-label">Destination</span>
              <span className="gc-info-value">{openCheckout.destination}</span>
            </div>
          </div>
        )}

        <div className="gc-divider" />

        <h3 className="gc-form-title">
          {phase === 'checkout' ? 'Check Out' : 'Check In'}
        </h3>

        {validationError && <div className="gc-validation-error">{validationError}</div>}

        {/* ---- CHECKOUT FIELDS ---- */}
        {phase === 'checkout' && (
          <>
            {/* Project */}
            <div className="gc-field">
              <label className="gc-label">Project</label>
              {!useManualProject ? (
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

            {/* Destination */}
            <div className="gc-field">
              <label className="gc-label">Destination <span className="gc-required">*</span></label>
              <input
                className="gc-input"
                placeholder="Job site address or name"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            {/* Block standardization */}
            <div className="gc-field">
              <label className="gc-label">
                Block Standardization Check <span className="gc-required">*</span>
              </label>
              <div className="gc-toggle-row">
                <button
                  className={`gc-toggle ${blockClosed === true ? 'yes' : ''}`}
                  onClick={() => setBlockClosed(true)}
                >
                  Yes — completed
                </button>
                <button
                  className={`gc-toggle ${blockClosed === false ? 'no' : ''}`}
                  onClick={() => setBlockClosed(false)}
                >
                  No
                </button>
              </div>
            </div>

            {/* CHD */}
            <div className="gc-field">
              <label className="gc-label">CHD</label>
              <input
                className="gc-input"
                placeholder=""
                value={chd}
                onChange={(e) => setChd(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="gc-field">
              <label className="gc-label">Notes <span className="gc-optional">(optional)</span></label>
              <textarea
                className="gc-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              className="gc-submit-btn"
              onClick={handleCheckout}
              disabled={submitting}
            >
              {submitting ? 'Checking out…' : 'Check Out Gauge'}
            </button>
          </>
        )}

        {/* ---- CHECKIN FIELDS ---- */}
        {phase === 'checkin' && (
          <>
            <div className="gc-field">
              <label className="gc-label">CHD</label>
              <input
                className="gc-input"
                value={chd}
                onChange={(e) => setChd(e.target.value)}
              />
            </div>

            <div className="gc-field">
              <label className="gc-label">Notes <span className="gc-optional">(optional)</span></label>
              <textarea
                className="gc-textarea"
                rows={2}
                placeholder="Any issues or observations?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              className="gc-submit-btn checkin"
              onClick={handleCheckin}
              disabled={submitting}
            >
              {submitting ? 'Checking in…' : 'Return Gauge to Lab'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
