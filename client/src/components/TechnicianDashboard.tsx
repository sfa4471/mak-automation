import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tasksAPI, Task, taskTypeLabel, TaskHistoryEntry } from '../api/tasks';
import { notificationsAPI, Notification } from '../api/notifications';
import TaskDetailModal from './TaskDetailModal';
import './TechnicianDashboard.css';

const TechnicianDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([]);
  const [openReports, setOpenReports] = useState<Task[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<'today' | 'upcoming' | 'activity'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);

  useEffect(() => {
    loadData();
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, selectedDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Clear data immediately when switching filters
      setTasks([]);
      setActivity([]);
      
      // Always load Tomorrow snapshot and Open Reports (shown at top)
      const [tomorrowData, openReportsData] = await Promise.all([
        tasksAPI.getTechnicianTomorrow().catch(() => []),
        tasksAPI.getTechnicianOpenReports().catch(() => [])
      ]);
      setTomorrowTasks(tomorrowData);
      setOpenReports(openReportsData);
      
      // Load tasks based on active filter
      if (activeFilter === 'today') {
        const tasksData = await tasksAPI.getTechnicianToday();
        setTasks(tasksData);
      } else if (activeFilter === 'upcoming') {
        const tasksData = await tasksAPI.getTechnicianUpcoming();
        setTasks(tasksData);
      } else if (activeFilter === 'activity') {
        const activityData = await tasksAPI.getTechnicianActivity(selectedDate);
        setActivity(activityData);
      }

      // Load notifications
      const notifs = await notificationsAPI.list();
      setNotifications(notifs);
      const count = await notificationsAPI.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading data:', error);
      setTasks([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    if (task.taskType === 'COMPRESSIVE_STRENGTH') {
      navigate(`/task/${task.id}/wp1`);
    } else if (task.taskType === 'DENSITY_MEASUREMENT') {
      navigate(`/task/${task.id}/density`);
    } else if (task.taskType === 'REBAR') {
      navigate(`/task/${task.id}/rebar`);
    } else if (task.taskType === 'PROCTOR') {
      navigate(`/task/${task.id}/proctor`);
    } else {
      // Placeholder for other task types
      alert('This task type is not yet implemented');
    }
  };

  const handleMarkFieldComplete = async (task: Task) => {
    try {
      await tasksAPI.markFieldComplete(task.id);
      // Reload data to refresh tomorrow and open reports
      loadData();
    } catch (error: any) {
      console.error('Error marking field complete:', error);
      alert(`Error: ${error.response?.data?.error || error.message || 'Failed to mark field work as complete'}`);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await notificationsAPI.markAsRead(notification.id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => 
        n.id === notification.id ? { ...n, isRead: 1 } : n
      ));
    }

    // Handle both task and workpackage notifications
    if ((notification as any).relatedTaskId) {
      const taskId = (notification as any).relatedTaskId;
      navigate(`/task/${taskId}/wp1`);
    } else if (notification.relatedWorkPackageId) {
      navigate(`/workpackage/${notification.relatedWorkPackageId}/wp1`);
    }
    setShowNotifications(false);
  };

  const handleClearAllNotifications = async () => {
    if (!window.confirm('Clear all notifications? This will mark them all as read.')) {
      return;
    }
    try {
      await notificationsAPI.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
    } catch (error: any) {
      console.error('Error clearing notifications:', error);
      alert('Failed to clear notifications. Please try again.');
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

  const getStatusBadge = (task: Task): string => {
    if (task.status === 'REJECTED_NEEDS_FIX') return 'REJECTED';
    if (task.dueDate && task.status !== 'APPROVED') {
      // Compare dates as strings (YYYY-MM-DD) to avoid timezone shifts
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (task.dueDate < today) {
        return 'OVERDUE';
      }
    }
    if (task.status === 'READY_FOR_REVIEW') return 'READY_FOR_REVIEW';
    return '';
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    // Parse date string (YYYY-MM-DD) as local date to avoid timezone shifts
    // Split and create date in local timezone
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // Format as date only (no time needed for due dates)
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

  if (loading) {
    return <div className="technician-dashboard-loading">Loading...</div>;
  }

  return (
    <div className="technician-dashboard">
      <header className="technician-dashboard-header">
        <div className="header-left">
          <h1>My Tasks</h1>
          <span className="user-info">{user?.name || user?.email}</span>
        </div>
        <div className="header-right">
          <div className="notifications-container">
            <button
              className="notifications-button"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              🔔
              {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className="notifications-dropdown">
                <div className="notifications-header">
                  <h3>Notifications</h3>
                  {notifications.length > 0 && (
                    <button onClick={handleClearAllNotifications} className="clear-all-notifications">
                      Clear All
                    </button>
                  )}
                </div>
                <div className="notifications-list">
                  {notifications.length === 0 ? (
                    <div className="no-notifications">No notifications</div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <div className="notification-message">{notif.message}</div>
                        <div className="notification-time">
                          {new Date(notif.createdAt).toLocaleString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric', 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true 
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="technician-dashboard-content">
        {/* Tomorrow Snapshot Section */}
        {tomorrowTasks.length > 0 && (
          <div className="tomorrow-snapshot">
            <h2>Tomorrow's Field Work</h2>
            <div className="snapshot-list">
              {tomorrowTasks.map((task) => (
                <div key={task.id} className="snapshot-item">
                  <div className="snapshot-item-main">
                    <div className="snapshot-item-info">
                      <strong>{task.projectNumber}</strong> - {task.projectName || taskTypeLabel(task.taskType)}
                      <div className="snapshot-item-details">
                        <span>Field Date: {formatFieldDates(task)}</span>
                        {task.dueDate && <span>• Report Due: {formatDate(task.dueDate)}</span>}
                      </div>
                    </div>
                    <div className="snapshot-item-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskForDetail(task);
                        }}
                        className="snapshot-action task-detail"
                      >
                        Task Detail
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (task.fieldCompleted) {
                            handleTaskClick(task);
                          } else {
                            handleMarkFieldComplete(task);
                          }
                        }}
                        className={`snapshot-action ${task.fieldCompleted ? 'continue-report' : 'mark-complete'}`}
                      >
                        {task.fieldCompleted ? 'Continue Report' : 'Mark Field Complete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Open Reports Section */}
        {openReports.length > 0 && (
          <div className="open-reports-section">
            <h2>My Open Reports</h2>
            <div className="open-reports-list">
              {openReports.map((task) => (
                <div key={task.id} className="open-report-item">
                    <div className="open-report-main">
                      <div className="open-report-info">
                        <strong>{taskTypeLabel(task.taskType)}</strong> - {task.projectNumber}
                        <div className="open-report-details">
                          {task.dueDate && <span>Due: {formatDate(task.dueDate)}</span>}
                          <span className={`status-badge status-${task.status.toLowerCase().replace(/[ _]/g, '-')}`}>
                            {getStatusLabel(task.status)}
                          </span>
                          {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
                            <span className="rejection-badge" title={task.rejectionRemarks}>
                              Rejected – Notes
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="open-report-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskForDetail(task);
                          }}
                          className="task-detail-button-small"
                        >
                          Task Detail
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTaskClick(task);
                          }}
                          className="continue-report-btn"
                        >
                          Continue Report
                        </button>
                      </div>
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
            className={`filter-tab ${activeFilter === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveFilter('activity')}
          >
            Activity Log
          </button>
        </div>

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

        {loading ? (
          <div className="technician-dashboard-loading">Loading...</div>
        ) : activeFilter === 'activity' ? (
          // Activity Log view
          activity.length === 0 ? (
            <div className="empty-state">
              <p>No activity found for the selected date.</p>
            </div>
          ) : (
            <div className="activity-log-container">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Task Type</th>
                    <th>Project</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((entry: any) => (
                    <tr key={entry.id} className="activity-row">
                      <td>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td>{taskTypeLabel(entry.taskType as any)}</td>
                      <td>{entry.projectNumber}</td>
                      <td>
                        <span className={`action-badge action-${entry.actionType.toLowerCase()}`}>
                          {entry.actionType}
                        </span>
                      </td>
                      <td>{entry.actorName} ({entry.actorRole})</td>
                      <td>{entry.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // Tasks view (Today or Upcoming)
          tasks.length === 0 ? (
            <div className="empty-state">
              <p>No tasks found for the selected filter.</p>
            </div>
          ) : (
            <div className="work-packages-table">
              <table>
                <thead>
                  <tr>
                    <th>Project Number</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Field Dates</th>
                    <th>Resubmission Due</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const badge = getStatusBadge(task);
                    return (
                      <tr
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className="work-package-row"
                      >
                        <td>{task.projectNumber}</td>
                        <td>
                          <div>
                            {taskTypeLabel(task.taskType)}
                            {badge && (
                              <span className={`task-badge badge-${badge.toLowerCase()}`}>
                                {badge}
                              </span>
                            )}
                          </div>
                          {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
                            <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '5px' }}>
                              Remarks: {task.rejectionRemarks}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`status-badge status-${task.status.toLowerCase().replace(/[ _]/g, '-')}`}>
                            {getStatusLabel(task.status)}
                          </span>
                        </td>
                        <td>{formatDate(task.dueDate)}</td>
                        <td>{formatFieldDates(task)}</td>
                        <td>{task.resubmissionDueDate ? formatDate(task.resubmissionDueDate) : 'N/A'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="task-actions">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                              className="task-detail-button"
                            >
                              Task Detail
                            </button>
                            {task.fieldCompleted ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskClick(task);
                                }}
                                className="continue-report-button"
                              >
                                Continue Report
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkFieldComplete(task);
                                }}
                                className="mark-complete-button"
                              >
                                Mark Complete
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTaskClick(task);
                              }}
                              className="details-button"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
          onClose={() => setSelectedTaskForDetail(null)}
        />
      )}
    </div>
  );
};

export default TechnicianDashboard;

