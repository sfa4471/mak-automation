import React, { useEffect, useRef, useState } from 'react';
import { useAppDialog } from '../../context/AppDialogContext';
import { updateWorkorder, autoAssignWorkorder, Workorder, TechCandidate } from '../../api/invoicing';
import api from '../../api/api';

interface TechSuggestion {
  technicianId: number;
  name: string;
  hasConflict: boolean;
  workedProjectRecently: boolean;
  recommended: boolean;
}

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

const TASK_TYPE_LABELS: Record<string, string> = {
  DENSITY_MEASUREMENT: 'Field Density Testing',
  REBAR: 'Rebar Inspection',
  PROCTOR: 'Proctor Compaction',
  COMPRESSIVE_STRENGTH: 'Compressive Strength (Cylinders)',
  CYLINDER_PICKUP: 'Cylinder Pickup',
};

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

interface LocalTask {
  id: number;
  taskType: string;
  locationName?: string;
  engagementNotes?: string;
  status: string;
}

interface Props {
  workorder: Workorder;
  projectId: number;
  initialTasks: Array<{ id: number; taskType: string; locationName?: string; engagementNotes?: string; status: string }>;
  technicians: { id: number; name: string; email: string }[];
  onSaved: () => void;
  onClose: () => void;
}

function statusChipStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    ASSIGNED:        { bg: '#e0f2fe', color: '#0369a1' },
    READY_FOR_REVIEW:{ bg: '#fef9c3', color: '#92400e' },
    APPROVED:        { bg: '#dcfce7', color: '#166534' },
  };
  const s = map[status] || { bg: '#f3f4f6', color: '#374151' };
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    background: s.bg,
    color: s.color,
    whiteSpace: 'nowrap',
  };
}

export default function EditWorkorderModal({ workorder, projectId, initialTasks, technicians, onSaved, onClose }: Props) {
  const { showAlert } = useAppDialog();

  // Workorder fields
  const [woNumber,     setWoNumber]     = useState(workorder.workorderNumber);
  const [description,  setDescription]  = useState(workorder.description || '');
  const [techId,       setTechId]       = useState<number | ''>(workorder.assignedTechnicianId || '');
  const [schedDate,    setSchedDate]    = useState(workorder.scheduledDate || '');
  const [siteLocation, setSiteLocation] = useState(workorder.siteLocation || '');

  // Report time — map existing value to select or 'other'
  const existingTime = workorder.scheduledTime || '';
  const isKnownTime  = REPORT_TIME_OPTIONS.some(o => o.value !== 'other' && o.value === existingTime);
  const [reportTimeSelect, setReportTimeSelect] = useState(isKnownTime ? existingTime : (existingTime ? 'other' : '07:00'));
  const [reportTimeCustom, setReportTimeCustom] = useState(isKnownTime ? '' : existingTime);
  const isCustomTime  = reportTimeSelect === 'other';
  const scheduledTime = isCustomTime ? reportTimeCustom : reportTimeSelect;

  // Task management
  const [localTasks, setLocalTasks] = useState<LocalTask[]>(initialTasks);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  // Add task form
  const [addType,     setAddType]     = useState('DENSITY_MEASUREMENT');
  const [addLocation, setAddLocation] = useState('');
  const [addNotes,    setAddNotes]    = useState('');
  const [addingTask,  setAddingTask]  = useState(false);

  // Auto-assign (Phase 6)
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignMsg, setAutoAssignMsg] = useState<string | null>(null);
  const [autoAssignCandidates, setAutoAssignCandidates] = useState<TechCandidate[]>([]);

  // Save / delete
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Technician suggestions
  const [suggestions, setSuggestions] = useState<TechSuggestion[]>([]);
  const suggestionAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!schedDate) { setSuggestions([]); return; }
    suggestionAbort.current?.abort();
    const ctrl = new AbortController();
    suggestionAbort.current = ctrl;
    api.get(
      `/workorders/suggest-assignment?date=${schedDate}&projectId=${projectId}&excludeWorkorderId=${workorder.id}`,
      { signal: ctrl.signal }
    )
      .then(({ data }) => setSuggestions(data))
      .catch(() => {});
  }, [schedDate, projectId, workorder.id]);

  const handleRemoveTask = async (taskId: number) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      setLocalTasks(prev => prev.filter(t => t.id !== taskId));
      setConfirmRemoveId(null);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Could not remove task.', 'Error');
    }
  };

  const handleAddTask = async () => {
    setAddingTask(true);
    try {
      const { data } = await api.post('/tasks', {
        projectId,
        workorderId: workorder.id,
        taskType: addType,
        assignedTechnicianId: techId ? Number(techId) : undefined,
        scheduledStartDate: schedDate || undefined,
        locationName: addLocation.trim() || undefined,
        engagementNotes: addNotes.trim() || undefined,
      });
      setLocalTasks(prev => [{
        id: data.id,
        taskType: data.taskType || data.task_type || addType,
        locationName: data.locationName || data.location_name || addLocation.trim() || undefined,
        engagementNotes: data.engagementNotes || data.engagement_notes || addNotes.trim() || undefined,
        status: data.status || 'ASSIGNED',
      }, ...prev]);
      setAddLocation('');
      setAddNotes('');
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Could not add task.', 'Error');
    } finally {
      setAddingTask(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Parameters<typeof updateWorkorder>[1] = {};
      if (woNumber !== workorder.workorderNumber)           payload.workorderNumber = woNumber;
      if (description !== (workorder.description || ''))   payload.description = description || undefined;
      if ((techId || null) !== (workorder.assignedTechnicianId || null)) {
        payload.assignedTechnicianId = techId ? Number(techId) : null;
      }
      if (schedDate !== (workorder.scheduledDate || ''))   payload.scheduledDate = schedDate || undefined;
      if (scheduledTime !== (workorder.scheduledTime || '')) payload.scheduledTime = scheduledTime || null;
      if (siteLocation !== (workorder.siteLocation || '')) payload.siteLocation = siteLocation || undefined;

      if (Object.keys(payload).length > 0) {
        await updateWorkorder(workorder.id, payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Could not save workorder.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/workorders/${workorder.id}`);
      onSaved();
      onClose();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Could not delete workorder.', 'Error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit Workorder</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>&#x2715;</button>
        </div>

        {/* ── Workorder Fields ──────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>WO Number</label>
            <input type="text" value={woNumber} onChange={e => setWoNumber(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Foundation phase" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Assigned Technician</label>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {suggestions.map(s => (
                <button
                  key={s.technicianId}
                  type="button"
                  onClick={() => setTechId(s.technicianId)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: techId === s.technicianId ? '2px solid #2563eb' : '1px solid #d1d5db',
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
          <select value={techId} onChange={e => { setTechId(e.target.value ? Number(e.target.value) : ''); setAutoAssignMsg(null); setAutoAssignCandidates([]); }} style={inputStyle}>
            <option value="">— Unassigned —</option>
            {technicians.map(t => (
              <option key={t.id} value={t.id}>{t.name || t.email}</option>
            ))}
          </select>

          {/* Auto-assign button — only when no tech selected and date is set */}
          {!techId && schedDate && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={autoAssigning}
                onClick={async () => {
                  setAutoAssigning(true);
                  setAutoAssignMsg(null);
                  setAutoAssignCandidates([]);
                  try {
                    const result = await autoAssignWorkorder(workorder.id);
                    if (result.autoAssigned && result.technicianId) {
                      setTechId(result.technicianId);
                      setAutoAssignMsg(`Auto-assigned to ${result.technicianName}. Email sends in ~${result.holdMinutes}m.`);
                    } else {
                      setAutoAssignCandidates(result.candidates || []);
                      setAutoAssignMsg('Multiple candidates — select below.');
                    }
                  } catch {
                    setAutoAssignMsg('Auto-assign failed. Try selecting manually.');
                  } finally {
                    setAutoAssigning(false);
                  }
                }}
                style={{
                  padding: '5px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  background: '#f9fafb',
                  cursor: autoAssigning ? 'not-allowed' : 'pointer',
                  color: '#374151',
                }}
              >
                {autoAssigning ? 'Finding best tech…' : 'Auto-assign'}
              </button>
              {autoAssignMsg && (
                <span style={{ fontSize: 12, color: autoAssignCandidates.length > 0 ? '#92400e' : '#166534' }}>
                  {autoAssignMsg}
                </span>
              )}
            </div>
          )}

          {/* Ambiguous auto-assign candidates */}
          {autoAssignCandidates.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {autoAssignCandidates.filter(c => !c.hasConflict).map(c => (
                <button
                  key={c.technicianId}
                  type="button"
                  onClick={() => { setTechId(c.technicianId); setAutoAssignCandidates([]); setAutoAssignMsg(null); }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #d1d5db',
                    background: c.recommended ? '#f0fdf4' : '#f9fafb',
                    color: c.recommended ? '#166534' : '#374151',
                  }}
                >
                  {c.name}{c.recommended ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Scheduled Date</label>
            <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Report Time</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={reportTimeSelect}
                onChange={e => setReportTimeSelect(e.target.value)}
                style={{ ...inputStyle, flex: isCustomTime ? '0 0 130px' : 1 }}
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

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Site Location</label>
          <input type="text" value={siteLocation} onChange={e => setSiteLocation(e.target.value)} placeholder="e.g. 123 Main St — Building A" style={inputStyle} />
        </div>

        {/* ── Task List ─────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 18, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Tasks ({localTasks.length})</h3>

          {localTasks.length === 0 && (
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 12px' }}>No tasks on this workorder.</p>
          )}

          {localTasks.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={statusChipStyle(task.status)}>{task.status.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 13, flex: 1 }}>
                {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                {task.locationName && <span style={{ color: '#6b7280', marginLeft: 6 }}>· {task.locationName}</span>}
              </span>

              {task.status !== 'APPROVED' && (
                confirmRemoveId === task.id ? (
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    Remove this task? This cannot be undone.{' '}
                    <button onClick={() => handleRemoveTask(task.id)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Confirm</button>
                    {' '}
                    <button onClick={() => setConfirmRemoveId(null)} style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(task.id)}
                    style={{ fontSize: 12, background: 'none', border: '1px solid #fca5a5', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', color: '#dc2626' }}
                  >
                    Remove
                  </button>
                )
              )}
            </div>
          ))}

          {/* Add task form */}
          <div style={{ marginTop: 14, padding: 14, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>+ Add Task</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>Task Type</label>
                <select value={addType} onChange={e => setAddType(e.target.value)} style={inputStyle}>
                  {Object.entries(TASK_TYPE_LABELS).filter(([k]) => k !== 'CYLINDER_PICKUP').map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>Location</label>
                <input type="text" value={addLocation} onChange={e => setAddLocation(e.target.value)} placeholder="e.g. Building A" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>Notes</label>
              <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. compact to 95%" style={inputStyle} />
            </div>
            <button
              onClick={handleAddTask}
              disabled={addingTask}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: addingTask ? 'not-allowed' : 'pointer', opacity: addingTask ? 0.7 : 1 }}
            >
              {addingTask ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </div>

        {/* ── Save / Cancel ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* ── Delete Workorder ──────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 18 }}>
          {showDeleteConfirm ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#7f1d1d', fontWeight: 600 }}>
                Delete workorder {workorder.workorderNumber}? This will permanently delete it and all {localTasks.length} associated task{localTasks.length !== 1 ? 's' : ''}. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
                >
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '7px 16px', fontSize: 13, color: '#dc2626', cursor: 'pointer', fontWeight: 500 }}
            >
              Delete Workorder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
