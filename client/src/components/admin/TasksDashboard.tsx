import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { tasksAPI, Task, taskTypeLabel, TaskType } from '../../api/tasks';
import './TasksDashboard.css';

const TasksDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<'today' | 'upcoming' | 'overdue' | 'activity'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [upcomingDays, setUpcomingDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeFilter, selectedDate, upcomingDays]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Clear tasks immediately when switching filters to avoid showing stale data
      setTasks([]);
      
      let data: Task[] = [];
      if (activeFilter === 'today') {
        data = await tasksAPI.getToday();
      } else if (activeFilter === 'upcoming') {
        data = await tasksAPI.getUpcoming(upcomingDays);
      } else if (activeFilter === 'overdue') {
        data = await tasksAPI.getOverdue();
      } else if (activeFilter === 'activity') {
        data = await tasksAPI.getActivity(selectedDate);
      }
      setTasks(data);
    } catch (error) {
      console.error('Error loading tasks:', error);
      setTasks([]); // Clear on error too
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'ASSIGNED': 'Assigned',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Ready for Review',
      'APPROVED': 'Approved',
      'REJECTED_NEEDS_FIX': 'Rejected - Needs Fix'
    };
    return statusMap[status] || status;
  };

  const getStatusClass = (status: string): string => {
    const classMap: { [key: string]: string } = {
      'ASSIGNED': 'status-assigned',
      'IN_PROGRESS_TECH': 'status-in-progress',
      'READY_FOR_REVIEW': 'status-ready',
      'APPROVED': 'status-approved',
      'REJECTED_NEEDS_FIX': 'status-rejected'
    };
    return classMap[status] || '';
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    // Parse date string (YYYY-MM-DD) as local date to avoid timezone shifts
    // Split and create date in local timezone
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString();
  };

  const formatFieldDates = (task: Task): string => {
    if (task.scheduledStartDate) {
      // Parse date string (YYYY-MM-DD) as local date to avoid timezone shifts
      const [startYear, startMonth, startDay] = task.scheduledStartDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (task.scheduledEndDate) {
        const [endYear, endMonth, endDay] = task.scheduledEndDate.split('-').map(Number);
        const endDate = new Date(endYear, endMonth - 1, endDay);
        const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Check if same day
        if (task.scheduledStartDate === task.scheduledEndDate) {
          return startFormatted;
        }
        return `${startFormatted} – ${endFormatted}`;
      }
      return startFormatted;
    }
    return '—';
  };

  const isReportTask = (taskType: TaskType): boolean => {
    return taskType === 'COMPRESSIVE_STRENGTH' || taskType === 'DENSITY_MEASUREMENT' || taskType === 'REBAR';
  };

  const isFieldTask = (taskType: TaskType): boolean => {
    return !isReportTask(taskType);
  };

  const getTaskBadges = (task: Task): string[] => {
    const badges: string[] = [];
    // Get today's date as YYYY-MM-DD string (local date, no timezone conversion)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // Use dueDate directly as string (already in YYYY-MM-DD format)
    const dueDate = task.dueDate || null;
    
    if (task.status === 'APPROVED') {
      badges.push('COMPLETED');
    } else if (dueDate) {
      if (dueDate === today) {
        badges.push('DUE_TODAY');
      } else if (dueDate < today) {
        // Calculate days overdue using string comparison (safer for dates)
        const [year, month, day] = today.split('-').map(Number);
        const [dueYear, dueMonth, dueDay] = dueDate.split('-').map(Number);
        const todayDate = new Date(year, month - 1, day);
        const dueDateObj = new Date(dueYear, dueMonth - 1, dueDay);
        const daysOverdue = Math.floor((todayDate.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
        badges.push(`OVERDUE_${daysOverdue}`);
      }
    }
    
    return badges;
  };

  const getOverdueDays = (task: Task): number | null => {
    if (!task.dueDate) return null;
    // Get today's date as YYYY-MM-DD string (local date, no timezone conversion)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // Use dueDate directly as string (already in YYYY-MM-DD format)
    const dueDate = task.dueDate;
    if (dueDate < today) {
      // Calculate days overdue using string comparison (safer for dates)
      const [year, month, day] = today.split('-').map(Number);
      const [dueYear, dueMonth, dueDay] = dueDate.split('-').map(Number);
      const todayDate = new Date(year, month - 1, day);
      const dueDateObj = new Date(dueYear, dueMonth - 1, dueDay);
      return Math.floor((todayDate.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
    }
    return null;
  };

  const handleViewReport = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.taskType === 'COMPRESSIVE_STRENGTH') {
      navigate(`/task/${task.id}/wp1`);
    } else if (task.taskType === 'DENSITY_MEASUREMENT') {
      navigate(`/task/${task.id}/density`);
    } else if (task.taskType === 'REBAR') {
      navigate(`/task/${task.id}/rebar`);
    } else if (task.taskType === 'PROCTOR') {
      navigate(`/task/${task.id}/proctor`);
    }
  };

  const handleViewTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    // Placeholder for field tasks
    alert(`${taskTypeLabel(task.taskType)} task details coming soon`);
  };


  const handleApprove = async (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to approve this task?')) {
      return;
    }
    try {
      await tasksAPI.approve(taskId);
      loadData(); // Refresh the list
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve task');
    }
  };

  // Helper function to convert MM-DD-YYYY to YYYY-MM-DD
  const convertToISO = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // Try to parse MM-DD-YYYY format
    const parts = dateStr.split(/[-\/]/);
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      // Validate it's a valid date
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return `${year}-${month}-${day}`;
      }
    }
    // If already in YYYY-MM-DD format, return as-is
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
    return null;
  };

  const handleReject = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const remarks = prompt('Enter rejection remarks (required):');
    if (!remarks || remarks.trim() === '') {
      return;
    }
    
    const resubmissionDateInput = prompt('Enter resubmission due date (MM-DD-YYYY, required):');
    if (!resubmissionDateInput || resubmissionDateInput.trim() === '') {
      return;
    }

    const resubmissionDate = convertToISO(resubmissionDateInput.trim());
    if (!resubmissionDate) {
      alert('Invalid date format. Please use MM-DD-YYYY format.');
      return;
    }

    try {
      await tasksAPI.reject(task.id, {
        rejectionRemarks: remarks,
        resubmissionDueDate: resubmissionDate
      });
      loadData(); // Refresh the list
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject task');
    }
  };


  const handleEditTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/task/${task.id}/edit`, { state: { returnPath: '/admin/tasks' } });
  };

  const getTaskActions = (task: Task): React.ReactNode => {
    const actions: React.ReactNode[] = [];
    const isReport = isReportTask(task.taskType);
    const isField = isFieldTask(task.taskType);

    // Edit Task button (always available for Admin) - handles assignment/reassignment
    actions.push(
      <button
        key="edit"
        onClick={(e) => handleEditTask(task, e)}
        className="action-button action-edit"
        title="Edit Task Details (including assignment)"
      >
        Edit Task
      </button>
    );

    if (isReport) {
      // Report tasks: View Report, Approve, Reject based on status
      if (task.status === 'READY_FOR_REVIEW' || task.status === 'APPROVED') {
        actions.push(
          <button
            key="view"
            onClick={(e) => handleViewReport(task, e)}
            className="action-button action-view"
            title="View Report"
          >
            View Report
          </button>
        );
      }

      if (task.status === 'READY_FOR_REVIEW') {
        actions.push(
          <button
            key="approve"
            onClick={(e) => handleApprove(task.id, e)}
            className="action-button action-approve"
            title="Approve Task"
          >
            Approve
          </button>
        );
        actions.push(
          <button
            key="reject"
            onClick={(e) => handleReject(task, e)}
            className="action-button action-reject"
            title="Reject Task"
          >
            Reject
          </button>
        );
      }
    } else if (isField) {
      // Field tasks: View Details (placeholder)
      actions.push(
        <button
          key="view"
          onClick={(e) => handleViewTask(task, e)}
          className="action-button action-view"
          title="View Task Details"
        >
          View Details
        </button>
      );
    }

    return <div className="action-buttons">{actions}</div>;
  };

  if (loading) {
    return <div className="tasks-dashboard-loading">Loading...</div>;
  }

  return (
    <div className="tasks-dashboard">
      <header className="tasks-dashboard-header">
        <h1>Tasks Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">{user?.name || user?.email}</span>
          <span className="user-role">({user?.role})</span>
          <button onClick={() => navigate('/dashboard')} className="back-button">
            Back to Projects
          </button>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="tasks-dashboard-content">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeFilter === 'today' ? 'active' : ''}`}
            onClick={() => setActiveFilter('today')}
          >
            Today
          </button>
          <button
            className={`filter-tab ${activeFilter === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveFilter('upcoming')}
          >
            Upcoming
          </button>
          <button
            className={`filter-tab ${activeFilter === 'overdue' ? 'active' : ''}`}
            onClick={() => setActiveFilter('overdue')}
          >
            Overdue/Pending
          </button>
          <button
            className={`filter-tab ${activeFilter === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveFilter('activity')}
          >
            Activity Log
          </button>
        </div>

        {activeFilter === 'upcoming' && (
          <div className="filter-controls">
            <label htmlFor="upcoming-days">View next:</label>
            <select
              id="upcoming-days"
              value={upcomingDays}
              onChange={(e) => setUpcomingDays(parseInt(e.target.value))}
              className="days-selector"
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
            </select>
          </div>
        )}

        {activeFilter === 'activity' && (
          <div className="date-picker-container">
            <label htmlFor="activity-date">Select Date:</label>
            <input
              type="date"
              id="activity-date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="date-picker"
            />
          </div>
        )}

        <div className="tasks-table-container">
          {tasks.length === 0 && !loading ? (
            <div className="empty-state">
              <p>No tasks found for the selected filter.</p>
            </div>
          ) : (
            <table key={activeFilter} className="tasks-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Technician</th>
                  <th>Task</th>
                  <th>Field Dates</th>
                  <th>Status</th>
                  <th>Report Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const badges = getTaskBadges(task);
                  const isReport = isReportTask(task.taskType);
                  
                  return (
                    <tr
                      key={task.id}
                      className="task-row"
                    >
                      <td>
                        <div className="project-cell">
                          <span className="project-number">{task.projectNumber}</span>
                          {task.projectName && (
                            <span className="project-name">{task.projectName}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {task.assignedTechnicianName ? (
                          <span>{task.assignedTechnicianName}</span>
                        ) : (
                          <span className="unassigned">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <div className="task-name-cell">
                          <span className="task-name">{taskTypeLabel(task.taskType)}</span>
                          <span className={`task-type-badge ${isReport ? 'badge-report' : 'badge-field'}`}>
                            {isReport ? 'Report' : 'Field'}
                          </span>
                          {badges.map(badge => {
                            let badgeText = badge;
                            if (badge === 'DUE_TODAY') {
                              badgeText = 'Due Today';
                            } else if (badge === 'COMPLETED') {
                              badgeText = 'Completed';
                            } else if (badge.startsWith('OVERDUE_')) {
                              const days = badge.replace('OVERDUE_', '');
                              badgeText = `Overdue ${days} ${days === '1' ? 'day' : 'days'}`;
                            }
                            return (
                              <span key={badge} className={`task-status-badge badge-${badge.toLowerCase().split('_')[0]}`}>
                                {badgeText}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td>{formatFieldDates(task)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(task.status)}`}>
                          {getStatusLabel(task.status)}
                        </span>
                      </td>
                      <td>{formatDate(task.dueDate)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {getTaskActions(task)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};

export default TasksDashboard;

