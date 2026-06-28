import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDialog } from '../../context/AppDialogContext';
import { authAPI, User } from '../../api/auth';
import { createWorkorder } from '../../api/invoicing';
import api from '../../api/api';

interface TechSuggestion {
  technicianId: number;
  name: string;
  hasConflict: boolean;
  workedProjectRecently: boolean;
  recommended: boolean;
}

const TASK_TYPE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  {
    value: 'DENSITY_MEASUREMENT',
    label: 'Field Density Testing',
    hint: 'One task covers multiple test locations. Add separate tasks only for separate reports.',
  },
  {
    value: 'REBAR',
    label: 'Rebar Inspection',
  },
  {
    value: 'PROCTOR',
    label: 'Proctor Compaction',
    hint: 'One per soil type — add a separate task only if multiple soil types are being tested.',
  },
  {
    value: 'COMPRESSIVE_STRENGTH',
    label: 'Compressive Strength (Cylinders)',
    hint: 'One task per concrete pour. Increase quantity if multiple pours are scheduled.',
  },
];

const REPORT_TIME_OPTIONS = [
  { value: '06:00', label: '6:00 AM' },
  { value: '06:30', label: '6:30 AM' },
  { value: '07:00', label: '7:00 AM' },
  { value: '07:30', label: '7:30 AM' },
  { value: '08:00', label: '8:00 AM' },
  { value: '08:30', label: '8:30 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: 'other', label: 'Other…' },
];

interface TaskRow {
  location: string;
  notes: string;
}

interface TaskConfig {
  quantity: number;
  rows: TaskRow[];
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
};

const qtyBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

export default function CreateWorkorder() {
  const { id: projectIdStr } = useParams<{ id: string }>();
  const projectId = Number(projectIdStr);
  const navigate  = useNavigate();
  const { showAlert } = useAppDialog();

  const [technicians,   setTechnicians]   = useState<User[]>([]);
  const [projectName,   setProjectName]   = useState('');
  const [projectNumber, setProjectNumber] = useState('');

  const [workorderNumber,      setWorkorderNumber]      = useState('');
  const [description,          setDescription]          = useState('');
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<number | ''>('');
  const [scheduledDate,        setScheduledDate]        = useState('');
  const [reportTimeSelect,     setReportTimeSelect]     = useState('07:00');
  const [reportTimeCustom,     setReportTimeCustom]     = useState('');
  const [siteLocation,         setSiteLocation]         = useState('');
  const [taskConfig,           setTaskConfig]           = useState<Record<string, TaskConfig>>({});
  const [saving,               setSaving]               = useState(false);
  const [suggestions,          setSuggestions]          = useState<TechSuggestion[]>([]);

  const isCustomTime  = reportTimeSelect === 'other';
  const scheduledTime = isCustomTime ? reportTimeCustom : reportTimeSelect;

  useEffect(() => {
    authAPI.listTechnicians().then(setTechnicians).catch(() => setTechnicians([]));
    api.get(`/projects/${projectId}`)
      .then(({ data }) => {
        setProjectName(data.projectName || data.project_name || '');
        setProjectNumber(data.projectNumber || data.project_number || '');
      })
      .catch(() => {});
  }, [projectId]);

  // Fetch technician suggestions whenever the scheduled date changes
  const suggestionAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!scheduledDate) { setSuggestions([]); return; }
    suggestionAbort.current?.abort();
    const ctrl = new AbortController();
    suggestionAbort.current = ctrl;
    api.get(`/workorders/suggest-assignment?date=${scheduledDate}&projectId=${projectId}`, { signal: ctrl.signal })
      .then(({ data }) => setSuggestions(data))
      .catch(() => {});
  }, [scheduledDate, projectId]);

  const toggleTaskType = (value: string) => {
    setTaskConfig(prev => {
      if (prev[value]) {
        const next = { ...prev };
        delete next[value];
        return next;
      }
      return { ...prev, [value]: { quantity: 1, rows: [{ location: '', notes: '' }] } };
    });
  };

  const changeQuantity = (taskType: string, delta: number) => {
    setTaskConfig(prev => {
      const existing = prev[taskType];
      if (!existing) return prev;
      const newQty  = Math.max(1, existing.quantity + delta);
      const newRows = Array.from({ length: newQty }, (_, i) => existing.rows[i] || { location: '', notes: '' });
      return { ...prev, [taskType]: { quantity: newQty, rows: newRows } };
    });
  };

  const updateRow = (taskType: string, index: number, field: 'location' | 'notes', value: string) => {
    setTaskConfig(prev => {
      const config = prev[taskType];
      if (!config) return prev;
      const rows = config.rows.map((r, i) => i === index ? { ...r, [field]: value } : r);
      return { ...prev, [taskType]: { ...config, rows } };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workorderNumber.trim()) {
      await showAlert('Workorder number is required.', 'Validation');
      return;
    }

    setSaving(true);
    try {
      const wo = await createWorkorder({
        projectId,
        workorderNumber: workorderNumber.trim(),
        description: description.trim() || undefined,
        assignedTechnicianId: assignedTechnicianId ? Number(assignedTechnicianId) : undefined,
        scheduledDate: scheduledDate || undefined,
        scheduledTime: scheduledTime || undefined,
        siteLocation: siteLocation.trim() || undefined,
      });

      for (const taskType of TASK_TYPE_OPTIONS.map(o => o.value)) {
        const config = taskConfig[taskType];
        if (!config) continue;
        for (const row of config.rows) {
          try {
            await api.post('/tasks', {
              projectId,
              workorderId: wo.id,
              taskType,
              assignedTechnicianId: assignedTechnicianId ? Number(assignedTechnicianId) : undefined,
              scheduledStartDate: scheduledDate || undefined,
              locationName: row.location.trim() || undefined,
              engagementNotes: row.notes.trim() || undefined,
            });
          } catch (taskErr: any) {
            console.warn(`Failed to create task ${taskType}:`, taskErr.message);
          }
        }
      }

      navigate(`/admin/projects/${projectId}/details`);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || err.message || 'Failed to create workorder', 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(`/admin/projects/${projectId}/details`)}
          style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}
        >
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Create Workorder</h1>
          {projectNumber && (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              {projectNumber}{projectName ? ` — ${projectName}` : ''}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* ── Dispatch Info ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Dispatch Details</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>WO Number *</label>
              <input
                type="text"
                value={workorderNumber}
                onChange={e => setWorkorderNumber(e.target.value)}
                placeholder="WO-001"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Foundation phase — Level B4 slab"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Assigned Technician</label>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {suggestions.map(s => (
                  <button
                    key={s.technicianId}
                    type="button"
                    onClick={() => setAssignedTechnicianId(s.technicianId)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: assignedTechnicianId === s.technicianId ? '2px solid #2563eb' : '1px solid #d1d5db',
                      background: s.hasConflict ? '#fef2f2' : s.recommended ? '#f0fdf4' : '#f9fafb',
                      color: s.hasConflict ? '#b91c1c' : s.recommended ? '#166534' : '#374151',
                      opacity: s.hasConflict ? 0.75 : 1,
                    }}
                    title={s.hasConflict ? 'Already scheduled on this date' : s.workedProjectRecently ? 'Worked this project recently' : ''}
                  >
                    {s.name}{s.hasConflict ? ' ⚠' : s.recommended ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
            <select
              value={assignedTechnicianId}
              onChange={e => setAssignedTechnicianId(e.target.value ? Number(e.target.value) : '')}
              style={inputStyle}
            >
              <option value="">— Unassigned —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name || t.email}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Scheduled Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>
                Report Time
                <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>— when tech must be on-site</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={reportTimeSelect}
                  onChange={e => setReportTimeSelect(e.target.value)}
                  style={{ ...inputStyle, flex: isCustomTime ? '0 0 140px' : 1 }}
                >
                  {REPORT_TIME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {isCustomTime && (
                  <input
                    type="time"
                    value={reportTimeCustom}
                    onChange={e => setReportTimeCustom(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                )}
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Site Location</label>
            <input
              type="text"
              value={siteLocation}
              onChange={e => setSiteLocation(e.target.value)}
              placeholder="e.g. 123 Main St — Building A, Level B4"
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Tests / Inspections ───────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Tests / Inspections</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280' }}>
            Select all test types to be performed during this site visit.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TASK_TYPE_OPTIONS.map(opt => {
              const isChecked = !!taskConfig[opt.value];
              const config    = taskConfig[opt.value];

              return (
                <div key={opt.value}>
                  {/* Checkbox card */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      border: `2px solid ${isChecked ? '#2563eb' : '#e5e7eb'}`,
                      borderRadius: isChecked ? '6px 6px 0 0' : 6,
                      background: isChecked ? '#eff6ff' : '#fafafa',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onClick={() => toggleTaskType(opt.value)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTaskType(opt.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: isChecked ? 600 : 400, color: isChecked ? '#1d4ed8' : '#374151' }}>
                        {opt.label}
                      </div>
                      {opt.hint && (
                        <div style={{ fontSize: 12, color: isChecked ? '#3b82f6' : '#9ca3af', marginTop: 2 }}>
                          {opt.hint}
                        </div>
                      )}
                    </div>
                    {isChecked && config && (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={e => e.stopPropagation()}
                      >
                        <span style={{ fontSize: 12, color: '#6b7280', marginRight: 2 }}>Qty</span>
                        <button type="button" style={qtyBtnStyle} onClick={() => changeQuantity(opt.value, -1)}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>
                          {config.quantity}
                        </span>
                        <button type="button" style={qtyBtnStyle} onClick={() => changeQuantity(opt.value, 1)}>+</button>
                      </div>
                    )}
                  </div>

                  {/* Per-task location + notes rows */}
                  {isChecked && config && (
                    <div style={{
                      border: '2px solid #2563eb',
                      borderTop: 'none',
                      borderRadius: '0 0 6px 6px',
                      background: '#f8faff',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}>
                      {config.rows.map((row, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ ...labelStyle, fontSize: 12, color: '#4b5563' }}>
                              {config.quantity > 1 ? `Task ${i + 1} · ` : ''}Location
                            </label>
                            <input
                              type="text"
                              value={row.location}
                              onChange={e => updateRow(opt.value, i, 'location', e.target.value)}
                              placeholder="e.g. Building A - Fill Area"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={{ ...labelStyle, fontSize: 12, color: '#4b5563' }}>
                              {config.quantity > 1 ? `Task ${i + 1} · ` : ''}Notes
                            </label>
                            <input
                              type="text"
                              value={row.notes}
                              onChange={e => updateRow(opt.value, i, 'notes', e.target.value)}
                              placeholder="e.g. compact to 95%, 6 cylinders"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={saving}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 28px', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Workorder'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/admin/projects/${projectId}/details`)}
            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '10px 20px', fontSize: 15, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
