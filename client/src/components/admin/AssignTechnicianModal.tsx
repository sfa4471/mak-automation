import React, { useState, useEffect } from 'react';
import { authAPI, User } from '../../api/auth';
import { tasksAPI, Task } from '../../api/tasks';
import './AssignTechnicianModal.css';

interface AssignTechnicianModalProps {
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
}

const AssignTechnicianModal: React.FC<AssignTechnicianModalProps> = ({ task, onClose, onSuccess }) => {
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<number | ''>(task.assignedTechnicianId || '');
  const [scheduledStartDate, setScheduledStartDate] = useState<string>(task.scheduledStartDate || '');
  const [scheduledEndDate, setScheduledEndDate] = useState<string>(task.scheduledEndDate || '');
  const [dueDate, setDueDate] = useState<string>(task.dueDate || '');
  const [engagementNotes, setEngagementNotes] = useState<string>(task.engagementNotes || '');
  const [isDateRange, setIsDateRange] = useState<boolean>(!!task.scheduledEndDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const techs = await authAPI.listTechnicians();
      setTechnicians(techs);
    } catch (err: any) {
      console.error('Error loading technicians:', err);
      setError('Failed to load technicians');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if reassigning from IN_PROGRESS or READY_FOR_REVIEW
    if (task.assignedTechnicianId && 
        (task.status === 'IN_PROGRESS_TECH' || task.status === 'READY_FOR_REVIEW')) {
      if (!window.confirm('This task is in progress or ready for review. Reassigning will change the assigned technician. Continue?')) {
        return;
      }
    }

    if (!selectedTechnicianId) {
      setError('Please select a technician');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Update task with assignment and scheduling info
      const updateData: any = {
        assignedTechnicianId: selectedTechnicianId,
        scheduledStartDate: scheduledStartDate || null,
        scheduledEndDate: isDateRange ? (scheduledEndDate || null) : null,
        dueDate: dueDate || null,
        engagementNotes: engagementNotes || null
      };

      // Update task via API (backend will handle notifications)
      await tasksAPI.update(task.id, updateData);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error assigning technician:', err);
      setError(err.response?.data?.error || 'Failed to assign technician');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content assign-technician-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task.assignedTechnicianId ? 'Reassign Technician' : 'Assign Technician'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="assign-technician-form">
          <div className="form-group">
            <label htmlFor="technician">Technician *</label>
            <select
              id="technician"
              value={selectedTechnicianId}
              onChange={(e) => setSelectedTechnicianId(e.target.value ? parseInt(e.target.value) : '')}
              required
            >
              <option value="">Select Technician</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>
                  {tech.name || tech.email}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="scheduledStartDate">Scheduled Start Date</label>
            <input
              type="date"
              id="scheduledStartDate"
              value={scheduledStartDate}
              onChange={(e) => setScheduledStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <small>When the task is scheduled to begin (optional)</small>
          </div>

          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="isDateRange"
              checked={isDateRange}
              onChange={(e) => setIsDateRange(e.target.checked)}
            />
            <label htmlFor="isDateRange" className="checkbox-label">
              Schedule for date range (multi-day task)
            </label>
          </div>

          {isDateRange && (
            <div className="form-group">
              <label htmlFor="scheduledEndDate">Scheduled End Date</label>
              <input
                type="date"
                id="scheduledEndDate"
                value={scheduledEndDate}
                onChange={(e) => setScheduledEndDate(e.target.value)}
                min={scheduledStartDate || new Date().toISOString().split('T')[0]}
              />
              <small>When the task is scheduled to end (optional)</small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="dueDate">Report Due Date</label>
            <input
              type="date"
              id="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <small>Deadline for report/PDF delivery (optional)</small>
          </div>

          <div className="form-group">
            <label htmlFor="engagementNotes">Engagement Notes</label>
            <textarea
              id="engagementNotes"
              value={engagementNotes}
              onChange={(e) => setEngagementNotes(e.target.value)}
              rows={3}
              placeholder="Special instructions for the technician..."
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Assigning...' : (task.assignedTechnicianId ? 'Reassign' : 'Assign')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignTechnicianModal;

