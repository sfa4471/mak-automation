import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tasksAPI, Task, taskTypeLabel } from '../../api/tasks';
import { projectsAPI, Project } from '../../api/projects';
import ProjectSpecsReadOnly from '../ProjectSpecsReadOnly';
import { useAuth } from '../../context/AuthContext';
import { getApiPathPrefix } from '../../api/api';
import { useAppDialog } from '../../context/AppDialogContext';
import './TaskDetails.css';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function billableMinutes(task: Task): number {
  if (!task.clockIn || !task.clockOut) return 0;
  const diff = (new Date(task.clockOut).getTime() - new Date(task.clockIn).getTime()) / 60000;
  return Math.max(0, diff - (task.breakMinutes ?? 0));
}

const TaskDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [clockSaving, setClockSaving] = useState(false);
  const [milesInput, setMilesInput] = useState('');
  const [breakInput, setBreakInput] = useState('');

  useEffect(() => {
    loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadTask = async () => {
    try {
      const taskData = await tasksAPI.get(parseInt(id!));
      
      // Verify this task is assigned to the current technician
      if (taskData.assignedTechnicianId !== user?.id) {
        setError('You do not have access to this task');
        return;
      }
      
      setTask(taskData);
      setMilesInput(taskData.miles != null ? String(taskData.miles) : '');
      setBreakInput(taskData.breakMinutes != null ? String(taskData.breakMinutes) : '0');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!task?.projectId) {
      setProject(null);
      setLoadingProject(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingProject(true);
        const projectData = await projectsAPI.get(task.projectId);
        if (!cancelled) setProject(projectData);
      } catch (e) {
        console.error('Error loading project for task details:', e);
        if (!cancelled) setProject(null);
      } finally {
        if (!cancelled) setLoadingProject(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task?.projectId]);

  const handleClockIn = async () => {
    if (!task) return;
    setClockSaving(true);
    try {
      const updated = await tasksAPI.updateTime(task.id, { clockIn: new Date().toISOString() });
      setTask(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to clock in', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleClockOut = async () => {
    if (!task) return;
    setClockSaving(true);
    try {
      const updated = await tasksAPI.updateTime(task.id, {
        clockOut: new Date().toISOString(),
        breakMinutes: parseInt(breakInput || '0', 10),
        miles: parseFloat(milesInput || '0'),
      });
      setTask(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to clock out', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleSaveTime = async () => {
    if (!task) return;
    setClockSaving(true);
    try {
      const updated = await tasksAPI.updateTime(task.id, {
        breakMinutes: parseInt(breakInput || '0', 10),
        miles: parseFloat(milesInput || '0'),
      });
      setTask(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to save', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const handleCouldNotAccess = async () => {
    if (!task) return;
    const ok = await showConfirm(
      'Mark this task as "Could Not Access"?\n\nUse this when you arrived on site but couldn\'t perform the work — locked gate, pour delayed, area not ready, etc. Admin will be notified and can decide whether to charge a trip fee.',
    );
    if (!ok) return;
    setClockSaving(true);
    try {
      await tasksAPI.updateStatus(task.id, 'COULD_NOT_ACCESS');
      const updated = await tasksAPI.get(task.id);
      setTask(updated);
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'Failed to update status', 'Error');
    } finally {
      setClockSaving(false);
    }
  };

  const openPdfBlob = (blob: Blob, filename: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const newWin = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!newWin) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 120000);
  };

  const handleDownloadPDF = async () => {
    if (!task) {
      await showAlert('Task details are not available. Please refresh the page and try again.', 'Unable to download');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        await showAlert('Your session has expired. Please log in again.', 'Authentication required');
        return;
      }
      const apiPrefix = getApiPathPrefix();

      let url: string;
      let filename: string;

      switch (task.taskType) {
        case 'COMPRESSIVE_STRENGTH':
          url = `${apiPrefix}/pdf/wp1/${id}?type=task`;
          filename = `compressive-strength-${task.projectNumber || id}.pdf`;
          break;
        case 'PROCTOR':
          url = `${apiPrefix}/proctor/${id}/pdf`;
          filename = `proctor-${task.projectNumber || id}.pdf`;
          break;
        case 'DENSITY_MEASUREMENT':
          url = `${apiPrefix}/pdf/density/${id}`;
          filename = `density-${task.projectNumber || id}.pdf`;
          break;
        case 'REBAR':
          url = `${apiPrefix}/pdf/rebar/${id}`;
          filename = `rebar-${task.projectNumber || id}.pdf`;
          break;
        default:
          await showAlert('A PDF preview is not available for this task type.', 'PDF not available');
          return;
      }
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        let errorMessage = 'Unable to generate the PDF.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          try {
            const t = await response.text();
            if (t) errorMessage = t;
          } catch {
            /* keep default */
          }
        }
        throw new Error(errorMessage);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.pdfBase64) {
          const binaryString = atob(data.pdfBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          openPdfBlob(blob, filename);
        } else {
          throw new Error('The server response did not include PDF data.');
        }
      } else {
        const blob = await response.blob();
        const pdfBlob = blob.type && blob.type.includes('pdf') ? blob : new Blob([blob], { type: 'application/pdf' });
        openPdfBlob(pdfBlob, filename);
      }
    } catch (err: any) {
      console.error('PDF download error:', err);
      await showAlert(
        `The PDF could not be opened or downloaded.\n\nDetails: ${err.message || 'Unknown error'}`,
        'PDF error'
      );
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const _formatDateShort = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'ASSIGNED': 'Assigned',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Submitted for Admin Review',
      'APPROVED': 'Approved',
      'REJECTED_NEEDS_FIX': 'Rejected - Needs Fix',
      'COULD_NOT_ACCESS': 'Could Not Access Site',
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return <div className="task-details-loading">Loading task details...</div>;
  }

  if (error || !task) {
    return (
      <div className="task-details-container">
        <div className="task-details-error">
          <p>{error || 'Task not found'}</p>
          <button onClick={() => navigate('/technician/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-details-container">
      <div className="task-details-header">
        <h1>Task Details</h1>
        <div className="header-actions">
          <button onClick={handleDownloadPDF} className="pdf-button">
            Download PDF
          </button>
          <button onClick={() => navigate('/technician/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="task-details-content">
        <div className="task-details-section">
          <h2>Project Information</h2>
          <div className="detail-row">
            <span className="detail-label">Project Number:</span>
            <span className="detail-value">{task.projectNumber || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Project Name:</span>
            <span className="detail-value">{task.projectName || 'N/A'}</span>
          </div>
        </div>

        <div className="task-details-section">
          <h2>Task Information</h2>
          <div className="detail-row">
            <span className="detail-label">Task Type:</span>
            <span className="detail-value">{taskTypeLabel(task)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Assigned Technician:</span>
            <span className="detail-value">{task.assignedTechnicianName || 'Unassigned'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Status:</span>
            <span className="detail-value">{getStatusLabel(task.status)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Due Date:</span>
            <span className="detail-value">{formatDate(task.dueDate)}</span>
          </div>
        </div>

        <div className="task-details-section">
          <h2>Specifications</h2>
          {!task.projectId ? (
            <p className="specs-empty" style={{ marginTop: 0 }}>
              No project is linked to this task.
            </p>
          ) : (
            <ProjectSpecsReadOnly project={project} loadingProject={loadingProject} />
          )}
        </div>

        <div className="task-details-section">
          <h2>Schedule</h2>
          {task.scheduledStartDate ? (
            <>
              <div className="detail-row">
                <span className="detail-label">Scheduled Start Date:</span>
                <span className="detail-value">{formatDate(task.scheduledStartDate)}</span>
              </div>
              {task.scheduledEndDate ? (
                <div className="detail-row">
                  <span className="detail-label">Scheduled End Date:</span>
                  <span className="detail-value">{formatDate(task.scheduledEndDate)}</span>
                </div>
              ) : (
                <div className="detail-row">
                  <span className="detail-label">Schedule Type:</span>
                  <span className="detail-value">Single Day</span>
                </div>
              )}
            </>
          ) : (
            <div className="detail-row">
              <span className="detail-label">Schedule:</span>
              <span className="detail-value">Not scheduled (see due date)</span>
            </div>
          )}
        </div>

        <div className="task-details-section">
          <h2>Location</h2>
          <div className="detail-row">
            <span className="detail-label">Location Name:</span>
            <span className="detail-value">{task.locationName || 'N/A'}</span>
          </div>
          {task.locationNotes && (
            <div className="detail-row-full">
              <span className="detail-label">Location Notes:</span>
              <div className="detail-value-text">{task.locationNotes}</div>
            </div>
          )}
        </div>

        {task.engagementNotes && (
          <div className="task-details-section">
            <h2>Special Instructions</h2>
            <div className="detail-row-full">
              <div className="detail-value-text">{task.engagementNotes}</div>
            </div>
          </div>
        )}

        {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
          <div className="task-details-section task-details-rejection">
            <h2>Rejection Remarks</h2>
            <div className="detail-row-full">
              <div className="detail-value-text rejection-text">{task.rejectionRemarks}</div>
            </div>
            {task.resubmissionDueDate && (
              <div className="detail-row">
                <span className="detail-label">Resubmission Due Date:</span>
                <span className="detail-value">{formatDate(task.resubmissionDueDate)}</span>
              </div>
            )}
          </div>
        )}

        <div className="task-details-section">
          <h2>Time Tracking</h2>
          {task.status === 'COULD_NOT_ACCESS' ? (
            <div style={{
              background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px',
              padding: '12px 16px', color: '#856404',
            }}>
              <strong>Could Not Access Site</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                This task was marked as site not accessible. Admin will review and determine if a trip charge applies.
              </p>
            </div>
          ) : !task.clockIn ? (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={handleClockIn}
                  disabled={clockSaving}
                  style={{
                    background: '#28a745', color: '#fff', border: 'none',
                    padding: '10px 20px', borderRadius: '4px', cursor: 'pointer',
                    fontSize: '14px', fontWeight: 600,
                  }}
                >
                  {clockSaving ? 'Saving…' : 'Clock In'}
                </button>
                <button
                  onClick={handleCouldNotAccess}
                  disabled={clockSaving}
                  style={{
                    background: '#fff', color: '#856404', border: '1px solid #ffc107',
                    padding: '10px 16px', borderRadius: '4px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 500,
                  }}
                >
                  Could Not Access Site
                </button>
              </div>
              <small style={{ display: 'block', marginTop: '6px', color: '#666' }}>
                Clock in when you arrive. Use "Could Not Access" if the site is locked or work cannot proceed.
              </small>
            </div>
          ) : (
            <>
              <div className="detail-row">
                <span className="detail-label">Clocked In:</span>
                <span className="detail-value">{new Date(task.clockIn).toLocaleTimeString()}</span>
              </div>
              {task.clockOut ? (
                <>
                  <div className="detail-row">
                    <span className="detail-label">Clocked Out:</span>
                    <span className="detail-value">{new Date(task.clockOut).toLocaleTimeString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Billable Time:</span>
                    <span className="detail-value">{formatDuration(billableMinutes(task))}</span>
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <button
                    onClick={handleClockOut}
                    disabled={clockSaving}
                    style={{
                      background: '#dc3545', color: '#fff', border: 'none',
                      padding: '10px 20px', borderRadius: '4px', cursor: 'pointer',
                      fontSize: '14px', fontWeight: 600,
                    }}
                  >
                    {clockSaving ? 'Saving…' : 'Clock Out'}
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                    Break (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={breakInput}
                    onChange={(e) => setBreakInput(e.target.value)}
                    style={{ width: '80px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                    Miles driven
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={milesInput}
                    onChange={(e) => setMilesInput(e.target.value)}
                    style={{ width: '90px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={handleSaveTime}
                    disabled={clockSaving}
                    style={{
                      background: '#007bff', color: '#fff', border: 'none',
                      padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {clockSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetails;

