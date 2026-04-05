import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppDialog } from '../context/AppDialogContext';
import { useTenant } from '../context/TenantContext';
import { getCurrentApiBaseUrl } from '../api/api';
import { projectsAPI, Project } from '../api/projects';
import { workPackagesAPI, WorkPackage } from '../api/workpackages';
import { tasksAPI, Task, taskTypeLabel } from '../api/tasks';
import { notificationsAPI, Notification } from '../api/notifications';
import RejectTaskModal from './RejectTaskModal';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { user, isAdmin, isStaffReviewer, isTechnician, logout } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workPackages, setWorkPackages] = useState<{ [projectId: number]: WorkPackage[] }>({});
  const [tasks, setTasks] = useState<{ [projectId: number]: Task[] }>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectModalTask, setRejectModalTask] = useState<Task | null>(null);

  useEffect(() => {
    if (user && isTechnician()) {
      navigate('/technician/dashboard');
      return;
    }
    loadData();
  }, [user, isTechnician, isStaffReviewer, navigate]);

  const loadData = async () => {
    try {
      const projectsData = await projectsAPI.list();
      setProjects(projectsData);

      // Load tasks for each project
      const taskPromises = projectsData.map((project) =>
        tasksAPI.getByProject(project.id).catch(() => [])
      );
      const taskResults = await Promise.all(taskPromises);
      const taskMap: { [projectId: number]: Task[] } = {};
      projectsData.forEach((project, index) => {
        taskMap[project.id] = taskResults[index] || [];
      });
      setTasks(taskMap);

      // Also load work packages for backward compatibility
      const wpPromises = projectsData.map((project) =>
        workPackagesAPI.getByProject(project.id).catch(() => [])
      );
      const wpResults = await Promise.all(wpPromises);
      const wpMap: { [projectId: number]: WorkPackage[] } = {};
      projectsData.forEach((project, index) => {
        wpMap[project.id] = wpResults[index] || [];
      });
      setWorkPackages(wpMap);

      if (isStaffReviewer()) {
        const notifs = await notificationsAPI.list();
        setNotifications(notifs);
        const count = await notificationsAPI.getUnreadCount();
        setUnreadCount(count);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'Draft': 'Draft',
      'ASSIGNED': 'Assigned',
      'Assigned': 'Assigned',
      'In Progress': 'In Progress',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Under review (PM / Admin)',
      'Submitted': 'Submitted',
      'APPROVED': 'Approved',
      'Approved': 'Approved',
      'REJECTED_NEEDS_FIX': 'Rejected'
    };
    return statusMap[status] || status;
  };

  const getStatusClass = (status: string): string => {
    const classMap: { [key: string]: string } = {
      'Draft': 'status-draft',
      'ASSIGNED': 'status-assigned',
      'Assigned': 'status-assigned',
      'In Progress': 'status-in-progress',
      'IN_PROGRESS_TECH': 'status-in-progress',
      'READY_FOR_REVIEW': 'status-ready-for-review',
      'Submitted': 'status-submitted',
      'APPROVED': 'status-approved',
      'Approved': 'status-approved',
      'REJECTED_NEEDS_FIX': 'status-rejected'
    };
    return classMap[status] || 'status-default';
  };

  const getTaskSummary = (projectId: number): string => {
    const projectTasks = tasks[projectId] || [];
    const totalTasks = projectTasks.length;
    const readyForReview = projectTasks.filter(t => t.status === 'READY_FOR_REVIEW').length;
    
    if (totalTasks === 0) return 'No tasks';
    if (readyForReview > 0) {
      return `${totalTasks} task${totalTasks !== 1 ? 's' : ''} · ${readyForReview} ready for review`;
    }
    return `${totalTasks} task${totalTasks !== 1 ? 's' : ''}`;
  };

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const handleWorkPackageClick = (wp: WorkPackage) => {
    if (wp.type === 'WP1') {
      navigate(`/workpackage/${wp.id}/wp1`);
    } else {
      void showAlert('This work package type is not available yet.', 'Not available');
    }
  };

  const isReportTask = (task: Task) =>
    task.taskType === 'COMPRESSIVE_STRENGTH' ||
    task.taskType === 'DENSITY_MEASUREMENT' ||
    task.taskType === 'REBAR' ||
    task.taskType === 'PROCTOR';

  const handleApprove = async (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await showConfirm('Approve this task?', 'Approve task');
    if (!ok) return;
    try {
      await tasksAPI.approve(taskId);
      loadData();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'The task could not be approved.', 'Approval failed');
    }
  };

  const handleRejectClick = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setRejectModalTask(task);
  };

  const handleDeleteTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.status === 'APPROVED') return;
    const label = taskTypeLabel(task);
    const delOk = await showConfirm(`Delete ${label}? This cannot be undone.`, 'Delete task');
    if (!delOk) return;
    try {
      await tasksAPI.delete(task.id);
      loadData();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'The task could not be deleted.', 'Delete failed');
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
      void showAlert('This task type is not available yet.', 'Not available');
    }
  };

  const handleClearAllNotifications = async () => {
    const clearOk = await showConfirm(
      'Clear all notifications? This removes every notification from your list.',
      'Clear notifications'
    );
    if (!clearOk) return;
    try {
      await notificationsAPI.clearAll();
      setUnreadCount(0);
      setNotifications([]);
    } catch (error: any) {
      console.error('Error clearing notifications:', error);
      await showAlert('Notifications could not be cleared. Please try again.', 'Error');
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-logo">
          {tenant?.logoPath ? (
            <img
              src={`${getCurrentApiBaseUrl()}/${tenant.logoPath.replace(/^\/+/, '')}`}
              alt={tenant.name ?? ''}
              className="company-logo"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const h1 = target.parentElement?.querySelector('h1');
                if (h1) (h1 as HTMLElement).style.display = 'block';
              }}
            />
          ) : (
            <img
              src={encodeURI('/MAK logo_consulting.jpg')}
              alt=""
              className="company-logo"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const h1 = target.parentElement?.querySelector('h1');
                if (h1) (h1 as HTMLElement).style.display = 'block';
              }}
              onLoad={() => {
                const h1 = document.querySelector('.dashboard-header .header-logo h1');
                if (h1) (h1 as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <h1>{tenant?.name ?? user?.tenantName ?? 'Dashboard'}</h1>
        </div>
        <div className="header-actions">
          {isStaffReviewer() && (
            <div className="notifications-container" style={{ position: 'relative' }}>
              <button
                className="notifications-button"
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', position: 'relative', padding: '5px 10px' }}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: '#dc3545',
                    color: 'white',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '10px',
                  background: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  width: '350px',
                  maxHeight: '400px',
                  overflow: 'hidden',
                  zIndex: 1000
                }}>
                  <div style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Notifications</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearAllNotifications();
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#007bff',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '5px 10px',
                          borderRadius: '4px',
                          transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#f0f0f0';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'none';
                        }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No notifications</div>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          onClick={async () => {
                            if (!notif.isRead) {
                              await notificationsAPI.markAsRead(notif.id);
                              setUnreadCount(prev => Math.max(0, prev - 1));
                              setNotifications(prev => prev.map(n =>
                                n.id === notif.id ? { ...n, isRead: 1 } : n
                              ));
                            }
                            const taskId = (notif as { relatedTaskId?: number }).relatedTaskId;
                            if (taskId) {
                              navigate('/admin/tasks');
                              setShowNotifications(false);
                              return;
                            }
                            if (notif.relatedWorkPackageId) {
                              navigate(`/workpackage/${notif.relatedWorkPackageId}/wp1`);
                            }
                            setShowNotifications(false);
                          }}
                          style={{
                            padding: '12px 15px',
                            borderBottom: '1px solid #f0f0f0',
                            cursor: 'pointer',
                            background: notif.isRead ? 'white' : '#e7f3ff',
                            fontWeight: notif.isRead ? 'normal' : '500'
                          }}
                        >
                          <div style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>{notif.message}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
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
          )}
          <span className="user-info">{user?.name || user?.email}</span>
          <span className="user-role">({user?.role})</span>
          <button
            onClick={() => navigate('/admin/change-password')}
            className="change-password-header-btn"
            style={{ marginRight: '10px', padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '14px' }}
          >
            Change Password
          </button>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {isStaffReviewer() && (
          <div className="dashboard-actions">
            {isAdmin() && (
              <>
                <button
                  onClick={() => navigate('/admin/create-project')}
                  className="primary-button"
                >
                  Create New Project
                </button>
                <button
                  onClick={() => navigate('/admin/technicians')}
                  className="secondary-button"
                >
                  Manage Technicians
                </button>
              </>
            )}
            <button
              onClick={() => navigate('/admin/tasks')}
              className="secondary-button"
            >
              Tasks Dashboard
            </button>
            {isAdmin() && (
              <button
                onClick={() => navigate('/admin/settings')}
                className="secondary-button"
              >
                ⚙️ Settings
              </button>
            )}
          </div>
        )}

        <div className="projects-list">
          <h2>{isStaffReviewer() ? 'All Projects' : 'My Assigned Projects'}</h2>
          {projects.length === 0 ? (
            <div className="empty-state">
              {isStaffReviewer()
                ? 'No projects yet.' + (isAdmin() ? ' Create your first project!' : '')
                : 'No assigned projects.'}
            </div>
          ) : (
            projects.map((project) => {
              const projectTasks = tasks[project.id] || [];
              const isExpanded = expandedProjects.has(project.id);
              const taskSummary = getTaskSummary(project.id);
              
              return (
                <div key={project.id} className="project-card">
                  <div 
                    className="project-header-collapsed"
                    onClick={() => toggleProject(project.id)}
                  >
                    <div className="project-header-content">
                      <div className="project-identifier">
                        <span className="project-number-primary">{project.projectNumber}</span>
                        <span className="project-name-secondary">{project.projectName}</span>
                      </div>
                      <span className="project-summary">{taskSummary}</span>
                    </div>
                    <div className="project-header-actions">
                      <span className="accordion-toggle">{isExpanded ? '▼' : '▶'}</span>
                      {isStaffReviewer() && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/projects/${project.id}/details`);
                            }}
                            className="project-details-button"
                            style={{ marginRight: '10px' }}
                          >
                            Project Details
                          </button>
                          {isAdmin() && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/create-task/${project.id}`);
                              }}
                              className="create-task-button-primary"
                            >
                              Create Task
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="project-content">
                      {projectTasks.length > 0 ? (
                        <div className="tasks-list">
                          {projectTasks.map((task) => (
                            <div
                              key={task.id}
                              className="task-item"
                              onClick={() => handleTaskClick(task)}
                            >
                              <div className="task-status-badge-container">
                                <span className={`task-status-badge ${getStatusClass(task.status)}`}>
                                  {getStatusLabel(task.status)}
                                </span>
                              </div>
                              <div className="task-info">
                                <span className="task-name">{taskTypeLabel(task)}</span>
                                {task.assignedTechnicianName && (
                                  <span className="task-technician">Assigned to: {task.assignedTechnicianName}</span>
                                )}
                              </div>
                              {isStaffReviewer() && (
                                <>
                                  {isAdmin() && (
                                    <>
                                      <button
                                        className="edit-task-button-secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/task/${task.id}/edit`, { state: { returnPath: '/dashboard' } });
                                        }}
                                      >
                                        Edit Task
                                      </button>
                                      {task.status !== 'APPROVED' && (
                                        <button
                                          className="edit-task-button-secondary"
                                          style={{ background: '#6c757d', color: 'white', borderColor: '#6c757d' }}
                                          onClick={(e) => handleDeleteTask(task, e)}
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {task.status === 'READY_FOR_REVIEW' && isReportTask(task) && (
                                    <>
                                      <button
                                        className="edit-task-button-secondary"
                                        style={{ background: '#28a745', color: 'white', borderColor: '#28a745' }}
                                        onClick={(e) => handleApprove(task.id, e)}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="edit-task-button-secondary"
                                        style={{ background: '#dc3545', color: 'white', borderColor: '#dc3545' }}
                                        onClick={(e) => handleRejectClick(task, e)}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-tasks-message">
                          No tasks yet. {isAdmin() ? 'Click "Create Task" to add one.' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <RejectTaskModal
        isOpen={rejectModalTask !== null}
        contextLine={
          rejectModalTask
            ? `${rejectModalTask.projectNumber ?? '—'} · ${taskTypeLabel(rejectModalTask)}`
            : undefined
        }
        onClose={() => setRejectModalTask(null)}
        onSubmit={async (payload) => {
          if (!rejectModalTask) return;
          await tasksAPI.reject(rejectModalTask.id, payload);
          loadData();
        }}
      />
    </div>
  );
};

export default Dashboard;

