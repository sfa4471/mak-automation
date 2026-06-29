import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { intakeAPI, DraftWorkorder } from '../../api/intake';
import { projectsAPI, Project } from '../../api/projects';
import './IntakeQueue.css';

const TEST_TYPE_LABELS: Record<string, string> = {
  DENSITY_MEASUREMENT: 'Density',
  PROCTOR: 'Proctor',
  REBAR: 'Rebar',
  COMPRESSIVE_STRENGTH: 'Compressive Strength',
  CYLINDER_PICKUP: 'Cylinder Pickup',
};

function scoreToLevel(score?: number): 'high' | 'medium' | 'low' | undefined {
  if (score == null) return undefined;
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function ConfidenceBadge({ score }: { score?: number }) {
  const level = scoreToLevel(score);
  if (level == null) return null;
  const cls = level === 'high' ? 'conf-badge conf-high'
    : level === 'medium' ? 'conf-badge conf-medium'
    : 'conf-badge conf-low';
  const label = level === 'high' ? `${score}% confident` : level === 'medium' ? `${score}% — review` : `${score}% — low`;
  return <span className={cls} title={label}>{level}</span>;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface EditingState {
  parsed_project_id: number | null;
  parsed_project_name_raw: string;
  parsed_scheduled_date: string;
  parsed_test_types: string[];
  parsed_site_location: string;
  parsed_requester_email: string;
}

function DraftCard({
  draft,
  projects,
  onAccept,
  onReject,
}: {
  draft: DraftWorkorder;
  projects: Project[];
  onAccept: (id: number, applySpecs: boolean) => Promise<void>;
  onReject: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<EditingState>({
    parsed_project_id: draft.parsed_project_id ?? null,
    parsed_project_name_raw: draft.parsed_project_name_raw ?? '',
    parsed_scheduled_date: draft.parsed_scheduled_date ?? '',
    parsed_test_types: draft.parsed_test_types ?? [],
    parsed_site_location: draft.parsed_site_location ?? '',
    parsed_requester_email: draft.parsed_requester_email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<'accept' | 'accept-specs' | 'reject' | null>(null);
  const [expanded, setExpanded] = useState(false);

  const soilSpecs = draft.parsed_soil_specs as Record<string, Record<string, unknown>> | null;
  const concreteSpecs = draft.parsed_concrete_specs as Record<string, Record<string, unknown>> | null;
  const confidence = draft.spec_extraction_json?.confidence;
  const conflicts = draft.spec_conflicts ?? draft.spec_extraction_json?.conflicts ?? [];
  const hasDocs = draft.attached_doc_types && draft.attached_doc_types.length > 0;
  const hasSpecs = (soilSpecs && Object.keys(soilSpecs).length > 0)
    || (concreteSpecs && Object.keys(concreteSpecs).length > 0);

  const matchScore = draft.project_match_score != null
    ? Math.round(Number(draft.project_match_score) * 100)
    : null;

  // Field-level confidence scores (0–100) from the AI scheduling extraction
  const fieldConf = (draft.extraction_json as any)?.fieldConfidence as
    { scheduledDate?: number; testTypes?: number; siteLocation?: number } | undefined;

  const matchedProject = projects.find(p => p.id === editing.parsed_project_id) ?? null;

  async function saveField<K extends keyof EditingState>(key: K, value: EditingState[K]) {
    setSaving(true);
    try {
      await intakeAPI.updateDraft(draft.id, { [key]: value });
    } catch { /* non-fatal */ } finally {
      setSaving(false);
    }
  }

  function toggleTestType(type: string) {
    const next = editing.parsed_test_types.includes(type)
      ? editing.parsed_test_types.filter(t => t !== type)
      : [...editing.parsed_test_types, type];
    setEditing(e => ({ ...e, parsed_test_types: next }));
    saveField('parsed_test_types', next);
  }

  async function handleAccept(applySpecs: boolean) {
    setActing(applySpecs ? 'accept-specs' : 'accept');
    try {
      await onAccept(draft.id, applySpecs);
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    setActing('reject');
    try {
      await onReject(draft.id);
    } finally {
      setActing(null);
    }
  }

  const noProject = !editing.parsed_project_id;

  return (
    <div className="draft-card">
      <div className="draft-card-header">
        <div className="draft-from">
          <span className="draft-label">From</span>
          <span>{draft.parsed_requester_email || '—'}</span>
        </div>
        <div className="draft-received">
          {new Date(draft.created_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </div>
      </div>

      <div className="draft-panels">
        {/* Left panel: scheduling */}
        <div className="draft-panel draft-scheduling">
          <h4>Dispatch Details</h4>

          <div className="draft-field">
            <label>Project</label>
            <select
              value={editing.parsed_project_id ?? ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : null;
                setEditing(prev => ({ ...prev, parsed_project_id: val }));
                saveField('parsed_project_id', val);
              }}
            >
              <option value="">— select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.projectNumber ? `${p.projectNumber} · ` : ''}{p.projectName}
                </option>
              ))}
            </select>
            {matchScore != null && !matchedProject && (
              <span className="match-score">{matchScore}% match on "{draft.parsed_project_name_raw}"</span>
            )}
            {matchedProject && matchScore != null && (
              <span className="match-score match-found">{matchScore}% match — {matchedProject.projectName}</span>
            )}
          </div>

          <div className="draft-field">
            <label>Scheduled Date <ConfidenceBadge score={fieldConf?.scheduledDate} /></label>
            <input
              type="date"
              value={editing.parsed_scheduled_date}
              onChange={e => {
                setEditing(prev => ({ ...prev, parsed_scheduled_date: e.target.value }));
                saveField('parsed_scheduled_date', e.target.value || null as unknown as string);
              }}
            />
          </div>

          <div className="draft-field">
            <label>Site Location <ConfidenceBadge score={fieldConf?.siteLocation} /></label>
            <input
              type="text"
              value={editing.parsed_site_location}
              onChange={e => setEditing(prev => ({ ...prev, parsed_site_location: e.target.value }))}
              onBlur={e => saveField('parsed_site_location', e.target.value)}
            />
          </div>

          <div className="draft-field">
            <label>Test Types <ConfidenceBadge score={fieldConf?.testTypes} /></label>
            <div className="test-type-chips">
              {Object.entries(TEST_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`test-type-chip ${editing.parsed_test_types.includes(key) ? 'selected' : ''}`}
                  onClick={() => toggleTestType(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {saving && <div className="draft-saving">Saving…</div>}

          {/* Raw email preview toggle */}
          {draft.raw_source && (
            <div className="draft-raw-toggle">
              <button type="button" className="btn-text" onClick={() => setExpanded(e => !e)}>
                {expanded ? 'Hide original email' : 'Show original email'}
              </button>
              {expanded && (
                <pre className="draft-raw-text">{draft.raw_source.slice(0, 800)}</pre>
              )}
            </div>
          )}
        </div>

        {/* Right panel: specs */}
        <div className="draft-panel draft-specs">
          <h4>
            Extracted Specs
            {hasDocs && (
              <span className="docs-badge">{draft.attached_doc_types!.length} doc{draft.attached_doc_types!.length > 1 ? 's' : ''}</span>
            )}
          </h4>

          {!hasDocs && (
            <p className="specs-empty-msg">No documents attached — specs not extracted.</p>
          )}

          {hasDocs && !hasSpecs && (
            <p className="specs-empty-msg">Documents attached but no specs found.</p>
          )}

          {hasSpecs && (
            <>
              {soilSpecs && Object.keys(soilSpecs).length > 0 && (
                <div className="spec-section">
                  <div className="spec-section-header">
                    <span>Soil / Compaction</span>
                    <ConfidenceBadge level={confidence?.soilSpecs} />
                  </div>
                  {Object.entries(soilSpecs).map(([structure, row]) => (
                    <div key={structure} className="spec-structure">
                      <div className="spec-structure-name">{structure}</div>
                      {(row.densityPcts as string[] | undefined)?.map((pct, i) => (
                        <div key={i} className="spec-row">
                          <span className="spec-key">Density</span>
                          <span className="spec-val">{pct}%</span>
                        </div>
                      ))}
                      {(row.moistureRanges as Array<{min?:string;max?:string}> | undefined)?.map((r, i) => (
                        <div key={i} className="spec-row">
                          <span className="spec-key">Moisture</span>
                          <span className="spec-val">{r.min ?? ''}…{r.max ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {concreteSpecs && Object.keys(concreteSpecs).length > 0 && (
                <div className="spec-section">
                  <div className="spec-section-header">
                    <span>Concrete</span>
                    <ConfidenceBadge level={confidence?.concreteSpecs} />
                  </div>
                  {Object.entries(concreteSpecs).map(([structure, row]) => (
                    <div key={structure} className="spec-structure">
                      <div className="spec-structure-name">{structure}</div>
                      {Boolean(row.specStrengthPsi) && (
                        <div className="spec-row">
                          <span className="spec-key">{'f\'c'}</span>
                          <span className="spec-val">{`${row.specStrengthPsi as string} psi`}</span>
                        </div>
                      )}
                      {Boolean(row.slump) && (
                        <div className="spec-row">
                          <span className="spec-key">Slump</span>
                          <span className="spec-val">{`${row.slump as string}"`}</span>
                        </div>
                      )}
                      {Boolean(row.airContent) && (
                        <div className="spec-row">
                          <span className="spec-key">Air</span>
                          <span className="spec-val">{`${row.airContent as string}%`}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {conflicts && conflicts.length > 0 && (
                <div className="spec-conflicts">
                  <div className="conflicts-header">Conflicts between documents</div>
                  {conflicts.map((c, i) => (
                    <div key={i} className="conflict-row">
                      <span className="conflict-flag">!</span>
                      <span className="conflict-label">{c.structureType} · {c.field}:</span>
                      <span className="conflict-values">{c.values.join(' vs ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="draft-actions">
        <button
          type="button"
          className="btn-reject"
          onClick={handleReject}
          disabled={!!acting}
        >
          {acting === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
        <div className="draft-accept-group">
          {hasSpecs && (
            <button
              type="button"
              className="btn-accept-specs"
              onClick={() => handleAccept(true)}
              disabled={!!acting || noProject}
              title={noProject ? 'Select a project first' : 'Create workorder and apply extracted specs to project'}
            >
              {acting === 'accept-specs' ? 'Accepting…' : 'Accept + Apply Specs'}
            </button>
          )}
          <button
            type="button"
            className="btn-accept"
            onClick={() => handleAccept(false)}
            disabled={!!acting || noProject}
            title={noProject ? 'Select a project first' : 'Create workorder (keep existing project specs)'}
          >
            {acting === 'accept' ? 'Accepting…' : hasSpecs ? 'Accept — Skip Specs' : 'Accept'}
          </button>
        </div>
      </div>
      {noProject && (
        <div className="draft-warning">Select a project to accept this draft.</div>
      )}
    </div>
  );
}

const IntakeQueue: React.FC = () => {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftWorkorder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p] = await Promise.all([intakeAPI.listDrafts(), projectsAPI.list()]);
      setDrafts(d);
      setProjects(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(id: number, applySpecs: boolean) {
    await intakeAPI.acceptDraft(id, applySpecs);
    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  async function handleReject(id: number) {
    await intakeAPI.rejectDraft(id);
    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="intake-queue-page">
      <div className="intake-queue-header">
        <div>
          <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
          <h1>Intake Queue</h1>
          <p className="intake-subtitle">AI-parsed job requests awaiting your review</p>
        </div>
        <button type="button" className="btn-refresh" onClick={load}>Refresh</button>
      </div>

      {loading && <div className="intake-loading">Loading…</div>}
      {error && <div className="intake-error">{error}</div>}

      {!loading && !error && drafts.length === 0 && (
        <div className="intake-empty">
          <div className="intake-empty-icon">📭</div>
          <p>No pending intake requests.</p>
          <p className="intake-empty-hint">
            Incoming job-request emails forwarded to your intake address will appear here for review.
          </p>
        </div>
      )}

      {!loading && drafts.length > 0 && (
        <div className="intake-list">
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              projects={projects}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default IntakeQueue;
