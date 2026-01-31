import React from 'react';
import { Task, taskTypeLabel } from '../api/tasks';
import './TaskDetailModal.css';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Not specified';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  const hasAdminInstructions = task.locationNotes || task.engagementNotes;

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
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="close-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
