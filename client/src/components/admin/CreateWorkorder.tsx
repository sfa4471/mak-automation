import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDialog } from '../../context/AppDialogContext';
import { authAPI, User } from '../../api/auth';
import { createWorkorder } from '../../api/invoicing';
import api from '../../api/api';

const TASK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'DENSITY_MEASUREMENT',  label: 'Field Density Testing' },
  { value: 'REBAR',                label: 'Rebar Inspection' },
  { value: 'PROCTOR',              label: 'Proctor Compaction' },
  { value: 'COMPRESSIVE_STRENGTH', label: 'Compressive Strength (Cylinders)' },
];

// Common CMT report times
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

export default function CreateWorkorder() {
  const { id: projectIdStr } = useParams<{ id: string }>();
  const projectId = Number(projectIdStr);
  const navigate  = useNavigate();
  const { showAlert } = useAppDialog();

  const [technicians,  setTechnicians]  = useState<User[]>([]);
  const [projectName,  setProjectName]  = useState('');
  const [projectNumber, setProjectNumber] = useState('');

  const [workorderNumber,      setWorkorderNumber]      = useState('');
  const [description,          setDescription]          = useState('');
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<number | ''>('');
  const [scheduledDate,        setScheduledDate]        = useState('');
  const [reportTimeSelect,     setReportTimeSelect]     = useState('07:00');
  const [reportTimeCustom,     setReportTimeCustom]     = useState('');
  const [siteLocation,         setSiteLocation]         = useState('');
  const [selectedTaskTypes,    setSelectedTaskTypes]    = useState<string[]>([]);
  const [saving,               setSaving]               = useState(false);

  const isCustomTime = reportTimeSelect === 'other';
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

  const toggleTaskType = (value: string) => {
    setSelectedTaskTypes(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
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

      for (const taskType of selectedTaskTypes) {
        try {
          await api.post('/tasks', {
            projectId,
            workorderId: wo.id,
            taskType,
            assignedTechnicianId: assignedTechnicianId ? Number(assignedTechnicianId) : undefined,
            scheduledStartDate: scheduledDate || undefined,
          });
        } catch (taskErr: any) {
          console.warn(`Failed to create task ${taskType}:`, taskErr.message);
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

          {/* Row 1: WO# + Description */}
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

          {/* Row 2: Technician */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Assigned Technician</label>
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

          {/* Row 3: Date + Report Time */}
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

          {/* Row 4: Site Location */}
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

        {/* ── Task Types ────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Tests / Inspections</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280' }}>
            Select all test types to be performed during this site visit.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TASK_TYPE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '10px 14px',
                  border: `2px solid ${selectedTaskTypes.includes(opt.value) ? '#2563eb' : '#e5e7eb'}`,
                  borderRadius: 6,
                  background: selectedTaskTypes.includes(opt.value) ? '#eff6ff' : '#fafafa',
                  transition: 'all 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTaskTypes.includes(opt.value)}
                  onChange={() => toggleTaskType(opt.value)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 14, fontWeight: selectedTaskTypes.includes(opt.value) ? 600 : 400, color: selectedTaskTypes.includes(opt.value) ? '#1d4ed8' : '#374151' }}>
                  {opt.label}
                </span>
              </label>
            ))}
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
