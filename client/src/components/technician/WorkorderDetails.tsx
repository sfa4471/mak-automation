import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppDialog } from '../../context/AppDialogContext';
import {
  getWorkorder,
  clockInWorkorder,
  clockOutWorkorder,
  couldNotAccessWorkorder,
  Workorder,
} from '../../api/invoicing';
import { tasksAPI, Task, taskTypeLabel } from '../../api/tasks';
import './TaskDetails.css';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function billableMinutesWo(wo: Workorder): number {
  if (!wo.clockIn || !wo.clockOut) return 0;
  const diff = (new Date(wo.clockOut).getTime() - new Date(wo.clockIn).getTime()) / 60000;
  return Math.max(0, diff - (wo.breakMinutes ?? 0));
}

const WorkorderDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();

  const [workorder, setWorkorder] = useState<Workorder | null>(null);
  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [clockSaving, setClockSaving] = useState(false);
  const [milesInput, setMilesInput]   = useState('');
  const [breakInput, setBreakInput]   = useState('0');

  useEffect(() => {
    loadWorkorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadWorkorder = async () => {
    try {
      setLoading(true);
      setError('');
      const wo = await getWorkorder(parseInt(id!));

      // Verify this workorder is assigned to the current technician
      if (wo.assignedTechnicianId !== user?.id) {
        setError('You do not have access to this workorder');
        return;
      }

      setWorkorder(wo);
      setMilesInput(wo.miles != null ? String(wo.miles) : '');
      setBreakInput(wo.breakMinutes != null ? String(wo.breakMinutes) : '0');

      // Load tasks for this workorder's project filtered by workorder_id
      if (wo.projectId) {
        try {
          const allTasks = await tasksAPI.getByProject(wo.projectId);
          const woTasks = allTasks.filter(
            t => (t as any).workorderId === wo.id || (t as any).workorder_id === wo.id
          );
          setTasks(woTasks);
        } catch (_) {
          // Tasks loading failure is non-fatal
          setTasks([]);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load workorder details');
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    if (!workorder) return;
    setClockSaving(true);
    try {
      const updated = await clockInWorkorder(workorder.id);
      setWorkorder(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to clock in', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleClockOut = async () => {
    if (!workorder) return;
    const breakMins = parseInt(breakInput || '0', 10);
    const miles     = parseFloat(milesInput || '0');
    setClockSaving(true);
    try {
      const updated = await clockOutWorkorder(workorder.id, { breakMinutes: breakMins, miles });
      setWorkorder(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to clock out', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleCouldNotAccess = async () => {
    if (!workorder) return;
    const ok = await showConfirm(
      'Mark this workorder as "Could Not Access Site"? This records that you arrived but could not complete work.',
      'Could Not Access'
    );
    if (!ok) return;
    setClockSaving(true);
    try {
      const updated = await couldNotAccessWorkorder(workorder.id);
      setWorkorder(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to update status', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    if (task.taskType === 'COMPRESSIVE_STRENGTH') navigate(`/task/${task.id}/wp1`);
    else if (task.taskType === 'DENSITY_MEASUREMENT') navigate(`/task/${task.id}/density`);
    else if (task.taskType === 'REBAR') navigate(`/task/${task.id}/rebar`);
    else if (task.taskType === 'PROCTOR') {
      const reviewStatuses = ['READY_FOR_REVIEW', 'APPROVED'];
      if (reviewStatuses.includes(task.status)) {
        navigate(`/task/${task.id}/proctor/summary`);
      } else {
        navigate(`/task/${task.id}/proctor`);
      }
    } else {
      void showAlert('This task type is not available yet.', 'Not available');
    }
  };

  const formatDateTime = (iso?: string | null): string => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (d?: string | null): string => {
    if (!d) return '—';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const getTaskStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      ASSIGNED: 'Assigned',
      IN_PROGRESS_TECH: 'In Progress',
      READY_FOR_REVIEW: 'Under Review',
      APPROVED: 'Approved',
      REJECTED_NEEDS_FIX: 'Rejected',
      COULD_NOT_ACCESS: 'Could Not Access',
    };
    return map[status] || status;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="task-details-container"><p>Loading…</p></div>;
  if (error)   return <div className="task-details-container"><p className="error-message">{error}</p></div>;
  if (!workorder) return null;

  const isCNA      = workorder.status === 'could_not_access';
  const hasClockedIn  = !!workorder.clockIn;
  const hasClockedOut = !!workorder.clockOut;

  return (
    <div className="task-details-container">
      {/* Header */}
      <div className="task-details-header">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/technician/dashboard')}
        >
          Back to Dashboard
        </button>
        <h1>Workorder {workorder.workorderNumber}</h1>
        {workorder.description && (
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>{workorder.description}</p>
        )}
      </div>

      {/* Info section */}
      <div className="task-details-section">
        <h2>Site Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
          {workorder.scheduledDate && (
            <div>
              <span style={{ color: '#6b7280' }}>Scheduled Date</span>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{formatDate(workorder.scheduledDate)}</div>
            </div>
          )}
          {workorder.siteLocation && (
            <div>
              <span style={{ color: '#6b7280' }}>Site Location</span>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{workorder.siteLocation}</div>
            </div>
          )}
        </div>
      </div>

      {/* Clock section */}
      <div className="task-details-section">
        <h2>Time Tracking</h2>

        {isCNA && (
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '14px 18px', color: '#713f12', fontWeight: 600, fontSize: 15 }}>
            Could Not Access Site — recorded
          </div>
        )}

        {!isCNA && !hasClockedIn && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="clock-in-button"
              onClick={handleClockIn}
              disabled={clockSaving}
              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              {clockSaving ? 'Clocking In…' : 'Clock In'}
            </button>
            <button
              type="button"
              onClick={handleCouldNotAccess}
              disabled={clockSaving}
              style={{ background: '#fff', color: '#d97706', border: '2px solid #fbbf24', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Could Not Access Site
            </button>
          </div>
        )}

        {!isCNA && hasClockedIn && !hasClockedOut && (
          <div>
            <p style={{ margin: '0 0 14px', color: '#16a34a', fontWeight: 600 }}>
              Clocked in at {formatDateTime(workorder.clockIn)}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Break (minutes)</label>
                <input
                  type="number"
                  min="0"
                  value={breakInput}
                  onChange={e => setBreakInput(e.target.value)}
                  style={{ width: 90, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Miles driven</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={milesInput}
                  onChange={e => setMilesInput(e.target.value)}
                  style={{ width: 100, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleClockOut}
              disabled={clockSaving}
              style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              {clockSaving ? 'Clocking Out…' : 'Clock Out'}
            </button>
          </div>
        )}

        {!isCNA && hasClockedIn && hasClockedOut && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 14 }}>
              <div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Clocked In</div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(workorder.clockIn)}</div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Clocked Out</div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(workorder.clockOut)}</div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>Billable Time</div>
                <div style={{ fontWeight: 600 }}>{formatDuration(billableMinutesWo(workorder))}</div>
              </div>
            </div>
            {(workorder.breakMinutes > 0 || workorder.miles) && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                {workorder.breakMinutes > 0 && <span>Break: {workorder.breakMinutes}min</span>}
                {workorder.breakMinutes > 0 && workorder.miles && <span style={{ margin: '0 8px' }}>·</span>}
                {workorder.miles && <span>Miles: {workorder.miles}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks section */}
      <div className="task-details-section">
        <h2>Tasks</h2>
        {tasks.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14 }}>No tasks assigned to this workorder.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tasks.map(task => (
              <div
                key={task.id}
                style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{taskTypeLabel(task)}</div>
                  {task.locationName && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{task.locationName}</div>
                  )}
                  <span style={{
                    display: 'inline-block',
                    marginTop: 4,
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    background: task.status === 'APPROVED' ? '#dcfce7' : task.status === 'REJECTED_NEEDS_FIX' ? '#fee2e2' : '#e0f2fe',
                    color: task.status === 'APPROVED' ? '#166534' : task.status === 'REJECTED_NEEDS_FIX' ? '#dc2626' : '#0369a1',
                  }}>
                    {getTaskStatusLabel(task.status)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleTaskClick(task)}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {task.status === 'APPROVED' ? 'View Report' : task.status === 'IN_PROGRESS_TECH' ? 'Continue Report' : 'Open Report'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkorderDetails;
