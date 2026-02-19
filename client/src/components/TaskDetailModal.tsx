import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task, taskTypeLabel } from '../api/tasks';
import { projectsAPI, Project, ProjectDrawing } from '../api/projects';
import './TaskDetailModal.css';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  /** When true (technician dashboard), show only "View drawings" and list of PDFs instead of specs and project details link */
  isTechnicianView?: boolean;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, isTechnicianView }) => {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [drawingsExpanded, setDrawingsExpanded] = useState(false);
  const [openingDrawing, setOpeningDrawing] = useState<string | null>(null);

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
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Not specified';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const drawings: ProjectDrawing[] = project?.drawings && Array.isArray(project.drawings) ? project.drawings : [];

  const handleOpenDrawing = async (filename: string) => {
    if (!task.projectId) return;
    setOpeningDrawing(filename);
    try {
      const blob = await projectsAPI.getDrawingBlob(task.projectId, filename);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Error opening drawing:', err);
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
      READY_FOR_REVIEW: 'Ready for Review',
      APPROVED: 'Approved',
      REJECTED_NEEDS_FIX: 'Rejected – Needs Fix',
    };
    return statusMap[status] || status;
  };

  const hasAdminInstructions = !!(task.locationName || task.locationNotes || task.engagementNotes);

  // Helper function to capitalize structure type names (title case)
  const capitalizeStructureType = (type: string): string => {
    if (!type) return type;
    // Split by spaces and capitalize first letter of each word
    return type
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const renderConcreteSpecs = () => {
    if (!project?.concreteSpecs || Object.keys(project.concreteSpecs).length === 0) {
      return <p className="specs-empty">No concrete specifications available.</p>;
    }

    return (
      <div className="specs-table-container">
        <table className="specs-table">
          <thead>
            <tr>
              <th>Structure Type</th>
              <th>Strength (PSI)</th>
              <th>Ambient Temp (°F)</th>
              <th>Concrete Temp (°F)</th>
              <th>Slump</th>
              <th>Air Content</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(project.concreteSpecs).map(([structureType, spec]: [string, any]) => {
              // Apply default values for temperature fields if they're empty/undefined
              const ambientTemp = spec.ambientTempF && spec.ambientTempF.trim() !== '' 
                ? spec.ambientTempF 
                : '35-95';
              const concreteTemp = spec.concreteTempF && spec.concreteTempF.trim() !== '' 
                ? spec.concreteTempF 
                : '45-95';
              
              return (
                <tr key={structureType}>
                  <td className="spec-structure-type">{capitalizeStructureType(structureType)}</td>
                  <td>{spec.specStrengthPsi || 'N/A'}</td>
                  <td>{ambientTemp}</td>
                  <td>{concreteTemp}</td>
                  <td>{spec.slump || 'N/A'}</td>
                  <td>{spec.airContent || 'N/A'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSoilSpecs = () => {
    if (!project?.soilSpecs || Object.keys(project.soilSpecs).length === 0) {
      return <p className="specs-empty">No soil specifications available.</p>;
    }

    return (
      <div className="specs-table-container">
        <table className="specs-table">
          <thead>
            <tr>
              <th>Structure Type</th>
              <th>Density (%)</th>
              <th>Moisture Range</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(project.soilSpecs).map(([structureType, spec]) => (
              <tr key={structureType}>
                <td className="spec-structure-type">{capitalizeStructureType(structureType)}</td>
                <td>{spec.densityPct || 'N/A'}</td>
                <td>
                  {spec.moistureRange?.min && spec.moistureRange?.max
                    ? `${spec.moistureRange.min}% - ${spec.moistureRange.max}%`
                    : spec.moistureRange?.min
                    ? `≥ ${spec.moistureRange.min}%`
                    : spec.moistureRange?.max
                    ? `≤ ${spec.moistureRange.max}%`
                    : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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
              {(task.locationName || task.locationNotes || task.engagementNotes) && (
                <>
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
                      <div className="instruction-label">Engagement Notes:</div>
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
            {loadingProject ? (
              <div className="specs-loading">Loading specifications...</div>
            ) : (
              <>
                <div className="specs-subsection">
                  <h4>Concrete Specifications</h4>
                  {renderConcreteSpecs()}
                </div>
                <div className="specs-subsection">
                  <h4>Soil Specifications</h4>
                  {renderSoilSpecs()}
                </div>
              </>
            )}
          </div>

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
