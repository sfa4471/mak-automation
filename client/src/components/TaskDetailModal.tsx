import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task, taskTypeLabel, tasksAPI } from '../api/tasks';
import { projectsAPI, Project, ProjectDrawing } from '../api/projects';
import { useAuth } from '../context/AuthContext';
import api from '../api/api';
import ProjectSpecsReadOnly from './ProjectSpecsReadOnly';
import './TaskDetailModal.css';

const REMARKS_TASK_TYPES = new Set([
  'DENSITY_MEASUREMENT', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP', 'PROCTOR', 'REBAR',
]);

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  /** When true (technician dashboard), hide the admin "View project details" link; drawings use expandable list here */
  isTechnicianView?: boolean;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, isTechnicianView }) => {
  const navigate = useNavigate();
  const { isStaffReviewer } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [drawingsExpanded, setDrawingsExpanded] = useState(false);
  const [openingDrawing, setOpeningDrawing] = useState<string | null>(null);
  const [drawingError, setDrawingError] = useState<string | null>(null);

  // PE Remarks — only loaded for staff reviewers on report tasks
  const [remarks, setRemarks] = useState<string>('');
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [remarksDirty, setRemarksDirty] = useState(false);
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [remarksSaved, setRemarksSaved] = useState(false);
  const remarksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadProject = async () => {
      try {
        setLoadingProject(true);
        const projectData = await projectsAPI.get(task.projectId);
        setProject(projectData);
      } catch (error) {
        console.error('Error loading project:', error);
      } finally {
        setLoadingProject(false);
      }
    };

    if (task.projectId) {
      loadProject();
    } else {
      setLoadingProject(false);
    }
  }, [task.projectId]);

  // Load AI-drafted remarks for staff reviewers on report task types
  useEffect(() => {
    if (!isStaffReviewer() || !REMARKS_TASK_TYPES.has(task.taskType)) return;
    api.get<{ remarks: string | null; isAiDraft: boolean }>(`/tasks/${task.id}/remarks`)
      .then(r => {
        setRemarks(r.data.remarks ?? '');
        setIsAiDraft(r.data.isAiDraft);
        setRemarksDirty(false);
        setRemarksSaved(false);
      })
      .catch(() => {});
  }, [task.id, task.taskType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRemarks() {
    setRemarksSaving(true);
    try {
      await api.put(`/tasks/${task.id}/remarks`, { remarks });
      setIsAiDraft(false);
      setRemarksDirty(false);
      setRemarksSaved(true);
      if (remarksTimerRef.current) clearTimeout(remarksTimerRef.current);
      remarksTimerRef.current = setTimeout(() => setRemarksSaved(false), 4000);
    } catch {
      // non-fatal — user can retry
    } finally {
      setRemarksSaving(false);
    }
  }

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Not specified';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const drawings: ProjectDrawing[] = project?.drawings && Array.isArray(project.drawings) ? project.drawings : [];

  const handleOpenDrawing = async (filename: string) => {
    if (!task.projectId) return;
    setDrawingError(null);
    setOpeningDrawing(filename);
    try {
      const blob = await projectsAPI.getDrawingBlob(task.projectId, filename);
      const url = window.URL.createObjectURL(blob);
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newWin) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 120000);
    } catch (err) {
      console.error('Error opening drawing:', err);
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'This file could not be opened. Check your connection and try again, or contact your administrator if the problem continues.';
      setDrawingError(msg);
    } finally {
      setOpeningDrawing(null);
    }
  };

  const formatFieldDates = (): string => {
    if (!task.scheduledStartDate) return 'Not specified';
    
    const [startYear, startMonth, startDay] = task.scheduledStartDate.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    if (task.scheduledEndDate && task.scheduledStartDate !== task.scheduledEndDate) {
      const [endYear, endMonth, endDay] = task.scheduledEndDate.split('-').map(Number);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startFormatted} – ${endFormatted}`;
    }
    return startFormatted;
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      ASSIGNED: 'Assigned',
      IN_PROGRESS_TECH: 'In Progress',
      READY_FOR_REVIEW: 'Under review (PM / Admin)',
      APPROVED: 'Approved',
      REJECTED_NEEDS_FIX: 'Rejected – Needs Fix',
    };
    return statusMap[status] || status;
  };

  const hasAdminInstructions = !!(task.locationName || task.locationNotes || task.engagementNotes || task.scheduledStartTime);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Task Details</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="task-detail-body">
          {/* Admin Instructions Section - Prominent */}
          {hasAdminInstructions && (
            <div className="admin-instructions-section">
              <h3>📋 Admin Instructions</h3>
              {(task.locationName || task.locationNotes || task.engagementNotes || task.scheduledStartTime) && (
                <>
                  {task.scheduledStartTime && (
                    <div className="instruction-block">
                      <div className="instruction-label">Arrival Time:</div>
                      <div className="instruction-content">{task.scheduledStartTime}</div>
                    </div>
                  )}
                  {task.locationName && (
                    <div className="instruction-block">
                      <div className="instruction-label">Location Name:</div>
                      <div className="instruction-content">{task.locationName}</div>
                    </div>
                  )}
                  {task.locationNotes && (
                    <div className="instruction-block">
                      <div className="instruction-label">Location Notes:</div>
                      <div className="instruction-content">{task.locationNotes}</div>
                    </div>
                  )}
                  {task.engagementNotes && (
                    <div className="instruction-block">
                      <div className="instruction-label">Task Details:</div>
                      <div className="instruction-content">{task.engagementNotes}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!hasAdminInstructions && (
            <div className="admin-instructions-section no-instructions">
              <p>No instructions provided by Admin.</p>
            </div>
          )}

          {/* Task Information */}
          <div className="task-info-section">
            <h3>Task Information</h3>
            <div className="info-grid">
              <div className="info-row">
                <div className="info-label">Task Type:</div>
                <div className="info-value">{taskTypeLabel(task)}</div>
              </div>

              <div className="info-row">
                <div className="info-label">Project Number:</div>
                <div className="info-value">{task.projectNumber || 'N/A'}</div>
              </div>

              {task.projectName && (
                <div className="info-row">
                  <div className="info-label">Project Name:</div>
                  <div className="info-value">{task.projectName}</div>
                </div>
              )}

              {task.locationName && (
                <div className="info-row">
                  <div className="info-label">Location:</div>
                  <div className="info-value">{task.locationName}</div>
                </div>
              )}

              <div className="info-row">
                <div className="info-label">Assigned Technician:</div>
                <div className="info-value">
                  {task.assignedTechnicianName || task.assignedTechnicianEmail || 'Unassigned'}
                </div>
              </div>

              <div className="info-row">
                <div className="info-label">Field Date(s):</div>
                <div className="info-value">{formatFieldDates()}</div>
              </div>

              <div className="info-row">
                <div className="info-label">Report Due Date:</div>
                <div className="info-value">{formatDate(task.dueDate)}</div>
              </div>

              <div className="info-row">
                <div className="info-label">Current Status:</div>
                <div className="info-value">
                  <span className={`status-badge status-${task.status.toLowerCase().replace(/[ _]/g, '-')}`}>
                    {getStatusLabel(task.status)}
                  </span>
                </div>
              </div>

              {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
                <div className="info-row full-width">
                  <div className="info-label">Rejection Remarks:</div>
                  <div className="info-value rejection-remarks">{task.rejectionRemarks}</div>
                </div>
              )}

              {task.resubmissionDueDate && (
                <div className="info-row">
                  <div className="info-label">Resubmission Due:</div>
                  <div className="info-value">{formatDate(task.resubmissionDueDate)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Specifications Section - show for both admin and technician */}
          <div className="specs-section">
            <h3>Specifications</h3>
            <ProjectSpecsReadOnly project={project} loadingProject={loadingProject} />
          </div>

          {/* PE Remarks — visible to staff reviewers on report tasks */}
          {isStaffReviewer() && !isTechnicianView && REMARKS_TASK_TYPES.has(task.taskType) && (
            <div className="pe-remarks-section">
              <div className="pe-remarks-header">
                <h3 style={{ margin: 0 }}>Remarks</h3>
                {isAiDraft && !remarksDirty && (
                  <span className="pe-remarks-badge pe-remarks-badge--ai">AI Draft</span>
                )}
                {remarksDirty && (
                  <span className="pe-remarks-badge pe-remarks-badge--edited">Edited</span>
                )}
                {remarksSaved && !remarksDirty && (
                  <span className="pe-remarks-badge pe-remarks-badge--saved">Saved</span>
                )}
              </div>
              {isAiDraft && !remarksDirty && (
                <p className="pe-remarks-hint">
                  AI-drafted narrative — review and edit before approving. Saving clears this label.
                </p>
              )}
              <textarea
                className="pe-remarks-textarea"
                value={remarks}
                rows={5}
                placeholder="No remarks drafted yet. The AI will generate a narrative when the tech submits for review."
                onChange={e => {
                  setRemarks(e.target.value);
                  setRemarksDirty(true);
                  setRemarksSaved(false);
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className="pe-remarks-save-btn"
                  onClick={saveRemarks}
                  disabled={remarksSaving || !remarksDirty}
                >
                  {remarksSaving ? 'Saving…' : 'Save Remarks'}
                </button>
              </div>
            </div>
          )}

          {/* Technician: Drawings list (expandable) */}
          {isTechnicianView && task.projectId && (
            <div className="drawings-section" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="view-project-details-button"
                onClick={() => setDrawingsExpanded((prev) => !prev)}
                style={{ marginBottom: drawingsExpanded ? 12 : 0 }}
              >
                {drawingsExpanded ? 'Hide drawings' : 'View drawings'}
              </button>
              {drawingsExpanded && (
                <div className="drawings-list-container" style={{ padding: '12px 0', borderTop: '1px solid #eee' }}>
                  {drawingError && (
                    <p className="specs-empty" style={{ color: '#c62828', marginBottom: 8 }} role="alert">
                      {drawingError}
                    </p>
                  )}
                  {loadingProject ? (
                    <p className="specs-empty">Loading...</p>
                  ) : drawings.length === 0 ? (
                    <p className="specs-empty">No drawings uploaded.</p>
                  ) : (
                    <ul className="drawings-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {drawings.map((d) => (
                        <li key={d.filename} style={{ marginBottom: 8 }}>
                          <button
                            type="button"
                            className="btn btn-link"
                            onClick={() => handleOpenDrawing(d.filename)}
                            disabled={openingDrawing === d.filename}
                            style={{ padding: 0, textAlign: 'left', cursor: 'pointer' }}
                          >
                            {openingDrawing === d.filename ? 'Opening…' : (d.displayName || d.filename)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {task.projectId && !isTechnicianView && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/admin/projects/${task.projectId}/details`);
              }}
              className="view-project-details-button"
              style={{ marginRight: 8 }}
            >
              View project details (specs &amp; drawings)
            </button>
          )}
          <button type="button" onClick={onClose} className="close-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
