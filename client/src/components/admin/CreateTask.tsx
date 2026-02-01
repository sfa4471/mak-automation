import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { tasksAPI, TaskType, CreateTaskRequest, UpdateTaskRequest, Task, taskTypeLabel } from '../../api/tasks';
import { authAPI, User } from '../../api/auth';
import { projectsAPI, Project } from '../../api/projects';
import './Admin.css';

const CreateTask: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, taskId } = useParams<{ projectId?: string; taskId?: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [_task, setTask] = useState<Task | null>(null);
  const [taskType, setTaskType] = useState<TaskType>('COMPRESSIVE_STRENGTH');
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<number | undefined>();
  const [dueDate, setDueDate] = useState('');
  const [scheduledStartDate, setScheduledStartDate] = useState('');
  const [scheduledEndDate, setScheduledEndDate] = useState('');
  const [isDateRange, setIsDateRange] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [engagementNotes, setEngagementNotes] = useState('');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEditMode = !!taskId;

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskId]);

  const loadData = async () => {
    try {
      const techs = await authAPI.listTechnicians();
      setTechnicians(techs);

      if (isEditMode && taskId) {
        // Load existing task for editing
        const taskData = await tasksAPI.get(parseInt(taskId));
        setTask(taskData);
        
        // Load project from task
        const projectData = await projectsAPI.get(taskData.projectId);
        setProject(projectData);

        // Pre-fill form with existing values
        setTaskType(taskData.taskType);
        setAssignedTechnicianId(taskData.assignedTechnicianId);
        setDueDate(taskData.dueDate || '');
        setScheduledStartDate(taskData.scheduledStartDate || '');
        setScheduledEndDate(taskData.scheduledEndDate || '');
        setIsDateRange(!!taskData.scheduledEndDate);
        setLocationName(taskData.locationName || '');
        setLocationNotes(taskData.locationNotes || '');
        setEngagementNotes(taskData.engagementNotes || '');
      } else if (projectId) {
        // Load project for creating new task
        const projectData = await projectsAPI.get(parseInt(projectId));
        setProject(projectData);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEditMode && taskId) {
        // Update existing task
        const updateData: UpdateTaskRequest = {
          taskType,
          assignedTechnicianId: assignedTechnicianId || undefined,
          dueDate: dueDate ? dueDate.trim() : undefined,
          scheduledStartDate: scheduledStartDate ? scheduledStartDate.trim() : undefined,
          scheduledEndDate: isDateRange && scheduledEndDate ? scheduledEndDate.trim() : undefined,
          locationName: locationName || undefined,
          locationNotes: locationNotes || undefined,
          engagementNotes: engagementNotes || undefined,
        };

        await tasksAPI.update(parseInt(taskId), updateData);
        // Navigate back to the page that was viewing tasks (Dashboard or Tasks Dashboard)
        // Add timestamp to force refresh when navigating back
        const returnPath = location.state?.returnPath || '/dashboard';
        navigate(returnPath, { replace: true });
      } else {
        // Create new task
        const taskData: CreateTaskRequest = {
          projectId: parseInt(projectId!),
          taskType,
          assignedTechnicianId: assignedTechnicianId || undefined,
          dueDate: dueDate ? dueDate.trim() : undefined,
          scheduledStartDate: scheduledStartDate ? scheduledStartDate.trim() : undefined,
          scheduledEndDate: isDateRange && scheduledEndDate ? scheduledEndDate.trim() : undefined,
          locationName: locationName || undefined,
          locationNotes: locationNotes || undefined,
          engagementNotes: engagementNotes || undefined,
        };

        await tasksAPI.create(taskData);
        navigate(`/dashboard`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} task`);
    } finally {
      setLoading(false);
    }
  };

  const taskTypes: TaskType[] = [
    'DENSITY_MEASUREMENT',
    'PROCTOR',
    'REBAR',
    'COMPRESSIVE_STRENGTH',
    'CYLINDER_PICKUP',
  ];

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1>{isEditMode ? 'Edit Task' : 'Create New Task'}</h1>
        {project && (
          <div style={{ marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '4px' }}>
            <strong>Project:</strong> {project.projectName} ({project.projectNumber})
          </div>
        )}
        <form onSubmit={handleSubmit} className="admin-form">
          <div className="form-group">
            <label htmlFor="taskType">Task Type *</label>
            <select
              id="taskType"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType)}
              required
            >
              {taskTypes.map((type) => (
                <option key={type} value={type}>
                  {taskTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="assignedTechnicianId">Assign to Technician</label>
            <select
              id="assignedTechnicianId"
              value={assignedTechnicianId || ''}
              onChange={(e) => setAssignedTechnicianId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">Unassigned</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name || tech.email}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="dueDate">Report Due Date *</label>
            <input
              type="date"
              id="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
            <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
              Deadline for report/PDF delivery
            </small>
          </div>

          <div className="form-group">
            <div className="checkbox-control-group">
              <label htmlFor="isDateRange" className="checkbox-label">
                <input
                  type="checkbox"
                  id="isDateRange"
                  checked={isDateRange}
                  onChange={(e) => {
                    setIsDateRange(e.target.checked);
                    if (!e.target.checked) {
                      setScheduledEndDate('');
                    }
                  }}
                />
                <span>Schedule for date range (multi-day task)</span>
              </label>
            </div>
          </div>

          <div className="form-group scheduled-dates-group">
            <label htmlFor="scheduledStartDate">Scheduled Start Date</label>
            <input
              type="date"
              id="scheduledStartDate"
              value={scheduledStartDate}
              onChange={(e) => setScheduledStartDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
            <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
              When the task is scheduled to begin (optional)
            </small>
          </div>

          {isDateRange && (
            <div className="form-group scheduled-dates-group">
              <label htmlFor="scheduledEndDate">Scheduled End Date</label>
              <input
                type="date"
                id="scheduledEndDate"
                value={scheduledEndDate}
                onChange={(e) => setScheduledEndDate(e.target.value)}
                min={scheduledStartDate || new Date().toISOString().split('T')[0]}
              />
              <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                When the task is scheduled to end (leave empty for single-day task)
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="locationName">Location Name</label>
            <input
              type="text"
              id="locationName"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g., Building A, Foundation Pour 1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="locationNotes">Location Notes</label>
            <textarea
              id="locationNotes"
              value={locationNotes}
              onChange={(e) => setLocationNotes(e.target.value)}
              rows={3}
              placeholder="Additional location details..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="engagementNotes">Engagement Notes</label>
            <textarea
              id="engagementNotes"
              value={engagementNotes}
              onChange={(e) => setEngagementNotes(e.target.value)}
              rows={3}
              placeholder="Special instructions or additional scheduling notes (optional)"
            />
            <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
              Use scheduled dates above for calendar-based scheduling. This field is for special instructions only.
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button type="button" onClick={() => navigate('/dashboard')} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Task' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTask;

