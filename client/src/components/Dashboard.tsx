import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { projectsAPI, Project } from '../api/projects';
import { workPackagesAPI, WorkPackage } from '../api/workpackages';
import { tasksAPI, Task, taskTypeLabel } from '../api/tasks';
import { notificationsAPI, Notification } from '../api/notifications';
import { tenantsAPI, TenantMe } from '../api/tenants';
import LoadingSpinner from './LoadingSpinner';
import './Dashboard.css';

const DEFAULT_LOGO = '/MAK logo_consulting.jpg';
const DEFAULT_COMPANY_NAME = 'MAK Lone Star Consulting';

const Dashboard: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_workPackages, setWorkPackages] = useState<{ [projectId: number]: WorkPackage[] }>({});
  const [tasks, setTasks] = useState<{ [projectId: number]: Task[] }>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      // Load current tenant (company name + logo) for header
      try {
        const tenantData = await tenantsAPI.getMe();
        setTenant(tenantData);
      } catch {
        setTenant(null);
      }

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

      // Load notifications for admin
      if (isAdmin()) {
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
  }, [isAdmin]);

  useEffect(() => {
    // Redirect technicians to their dashboard
    if (user && !isAdmin()) {
      navigate('/technician/dashboard');
      return;
    }
    loadData();
  }, [user, isAdmin, navigate, loadData]);

  const getStatusLabel = useCallback((status: string): string => {
    const statusMap: { [key: string]: string } = {
      'Draft': 'Draft',
      'ASSIGNED': 'Assigned',
      'Assigned': 'Assigned',
      'In Progress': 'In Progress',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Ready for Review',
      'Submitted': 'Submitted',
      'APPROVED': 'Approved',
      'Approved': 'Approved',
      'REJECTED_NEEDS_FIX': 'Rejected'
    };
    return statusMap[status] || status;
  }, []);

  const getStatusClass = useCallback((status: string): string => {
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
  }, []);

  const getTaskSummary = useCallback((projectId: number): string => {
    const projectTasks = tasks[projectId] || [];
    const totalTasks = projectTasks.length;
    const readyForReview = projectTasks.filter(t => t.status === 'READY_FOR_REVIEW').length;
    
    if (totalTasks === 0) return 'No tasks';
    if (readyForReview > 0) {
      return `${totalTasks} task${totalTasks !== 1 ? 's' : ''} · ${readyForReview} ready for review`;
    }
    return `${totalTasks} task${totalTasks !== 1 ? 's' : ''}`;
  }, [tasks]);

  const toggleProject = useCallback((projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }, []);

  // Keep for potential future use
  // const handleWorkPackageClick = useCallback((wp: WorkPackage) => {
  //   if (wp.type === 'WP1') {
  //     navigate(`/workpackage/${wp.id}/wp1`);
  //   } else {
  //     alert('This work package is not yet implemented');
  //   }
  // }, [navigate]);

  const handleTaskClick = useCallback((task: Task) => {
    if (task.taskType === 'COMPRESSIVE_STRENGTH') {
      navigate(`/task/${task.id}/wp1`);
    } else if (task.taskType === 'DENSITY_MEASUREMENT') {
      navigate(`/task/${task.id}/density`);
    } else if (task.taskType === 'REBAR') {
      navigate(`/task/${task.id}/rebar`);
    } else if (task.taskType === 'PROCTOR') {
      navigate(`/task/${task.id}/proctor`);
    } else {
      alert('This task type is not yet implemented');
    }
  }, [navigate]);

  const handleClearAllNotifications = useCallback(async () => {
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
  }, []);

  if (loading) {
    return <LoadingSpinner fullScreen message="Loading dashboard..." />;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-logo">
          <img 
            src={tenant?.logoPath ? `/${tenant.logoPath}` : encodeURI(DEFAULT_LOGO)}
            alt={tenant?.name || DEFAULT_COMPANY_NAME}
            className="company-logo"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const h1 = target.parentElement?.querySelector('h1');
              if (h1) {
                h1.style.display = 'block';
              }
            }}
            onLoad={() => {
              const h1 = document.querySelector('.dashboard-header .header-logo h1');
              if (h1) {
                (h1 as HTMLElement).style.display = 'none';
              }
            }}
          />
          <h1>{tenant?.name || DEFAULT_COMPANY_NAME}</h1>
        </div>
        <div className="header-actions">
          {isAdmin() && (
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
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {isAdmin() && (
          <div className="dashboard-actions">
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
            <button
              onClick={() => navigate('/admin/tasks')}
              className="secondary-button"
            >
              Tasks Dashboard
            </button>
            <button
              onClick={() => navigate('/admin/settings')}
              className="secondary-button"
            >
              ⚙️ Settings
            </button>
          </div>
        )}

        <div className="projects-list">
          <h2>{isAdmin() ? 'All Projects' : 'My Assigned Projects'}</h2>
          {projects.length === 0 ? (
            <div className="empty-state">
              {isAdmin() ? 'No projects yet. Create your first project!' : 'No assigned projects.'}
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleProject(project.id);
                      }
                    }}
                    aria-expanded={isExpanded}
                    aria-controls={`project-content-${project.id}`}
                  >
                    <div className="project-header-content">
                      <div className="project-identifier">
                        <span className="project-number-primary">
                          {project.projectNumber}
                          {project.folderCreation && (
                            <span 
                              title={project.folderCreation.success 
                                ? `Folder: ${project.folderCreation.path || 'N/A'}` 
                                : `Error: ${project.folderCreation.error || 'Unknown error'}`}
                              style={{
                                color: project.folderCreation.success ? '#28a745' : '#dc3545',
                                marginLeft: '8px',
                                fontSize: '16px',
                                cursor: 'help'
                              }}
                            >
                              {project.folderCreation.success ? '📁' : '⚠️'}
                            </span>
                          )}
                        </span>
                        <span className="project-name-secondary">{project.projectName}</span>
                      </div>
                      <span className="project-summary">{taskSummary}</span>
                    </div>
                    <div className="project-header-actions">
                      <span className="accordion-toggle">{isExpanded ? '▼' : '▶'}</span>
                      {isAdmin() && (
                        <>
                          {project.folderCreation && !project.folderCreation.success && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const result = await projectsAPI.retryFolderCreation(project.id);
                                  if (result.success) {
                                    alert(`Folder created successfully!\n\nPath: ${result.folderCreation.path}`);
                                    // Reload projects to update status
                                    loadData();
                                  } else {
                                    alert(`Failed to create folder:\n\n${result.folderCreation.error}`);
                                  }
                                } catch (err: any) {
                                  alert(`Error: ${err.response?.data?.error || 'Failed to retry folder creation'}`);
                                }
                              }}
                              className="project-details-button"
                              style={{ marginRight: '10px', fontSize: '12px', padding: '6px 12px' }}
                              title="Retry folder creation"
                            >
                              🔄 Retry Folder
                            </button>
                          )}
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/create-task/${project.id}`);
                            }}
                            className="create-task-button-primary"
                          >
                            Create Task
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="project-content" id={`project-content-${project.id}`}>
                      {projectTasks.length > 0 ? (
                        <div className="tasks-list">
                          {projectTasks.map((task) => (
                            <div
                              key={task.id}
                              className="task-item"
                              onClick={() => handleTaskClick(task)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleTaskClick(task);
                                }
                              }}
                              aria-label={`Task: ${taskTypeLabel(task)}`}
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
                              {isAdmin() && (
                                <button
                                  className="edit-task-button-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/task/${task.id}/edit`, { state: { returnPath: '/dashboard' } });
                                  }}
                                >
                                  Edit Task
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-tasks-message">
                          No tasks yet. {isAdmin() && 'Click "Create Task" to add one.'}
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

    </div>
  );
};

export default Dashboard;

