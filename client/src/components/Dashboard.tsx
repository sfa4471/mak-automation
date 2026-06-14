import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppDialog } from '../context/AppDialogContext';
import { useTenant } from '../context/TenantContext';
import { getBackendPublicFileUrl } from '../api/api';
import { projectsAPI, Project } from '../api/projects';
import { workPackagesAPI, WorkPackage } from '../api/workpackages';
import { tasksAPI, Task, taskTypeLabel } from '../api/tasks';
import { notificationsAPI, Notification } from '../api/notifications';
import { getWorkorders, Workorder } from '../api/invoicing';
import RejectTaskModal from './RejectTaskModal';
import UnapproveTaskModal from './UnapproveTaskModal';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { user, isAdmin, isStaffReviewer, isTechnician, logout } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workPackages, setWorkPackages] = useState<{ [projectId: number]: WorkPackage[] }>({});
  const [tasks, setTasks] = useState<{ [projectId: number]: Task[] }>({});
  const [workorders, setWorkorders] = useState<{ [projectId: number]: Workorder[] }>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [expandedWorkorders, setExpandedWorkorders] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectModalTask, setRejectModalTask] = useState<Task | null>(null);
  const [unapproveTask, setUnapproveTask] = useState<Task | null>(null);
  const [unapproveAlreadySent, setUnapproveAlreadySent] = useState(false);

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

      // Load workorders per project
      const woPromises = projectsData.map((project) =>
        getWorkorders(project.id).catch(() => [] as Workorder[])
      );
      const woResults = await Promise.all(woPromises);
      const woMap: { [projectId: number]: Workorder[] } = {};
      projectsData.forEach((project, index) => {
        woMap[project.id] = woResults[index] || [];
      });
      setWorkorders(woMap);

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
    const projectWos   = workorders[projectId] || [];
    const projectTasks = tasks[projectId] || [];
    const readyForReview = projectTasks.filter(t => t.status === 'READY_FOR_REVIEW').length;

    if (projectWos.length > 0) {
      const woLabel = `${projectWos.length} workorder${projectWos.length !== 1 ? 's' : ''}`;
      if (readyForReview > 0) return `${woLabel} · ${readyForReview} pending review`;
      return woLabel;
    }
    if (projectTasks.length === 0) return 'No tasks';
    if (readyForReview > 0) {
      return `${projectTasks.length} task${projectTasks.length !== 1 ? 's' : ''} · ${readyForReview} ready for review`;
    }
    return `${projectTasks.length} task${projectTasks.length !== 1 ? 's' : ''}`;
  };

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) { newSet.delete(projectId); } else { newSet.add(projectId); }
      return newSet;
    });
  };

  const toggleWorkorder = (woId: number) => {
    setExpandedWorkorders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(woId)) { newSet.delete(woId); } else { newSet.add(woId); }
      return newSet;
    });
  };

  const fmtDate = (d?: string | null): string => {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const fmtTime = (t?: string | null): string => {
    if (!t) return '';
    const [h, min] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${min.toString().padStart(2, '0')} ${period}`;
  };

  const woStatusBadge = (status: string) => {
    const cfg: Record<string, { label: string; bg: string; color: string }> = {
      open:             { label: 'Open',              bg: '#dbeafe', color: '#1e40af' },
      complete:         { label: 'Complete',          bg: '#dcfce7', color: '#166534' },
      approved:         { label: 'Approved',          bg: '#d1fae5', color: '#065f46' },
      could_not_access: { label: 'Could Not Access',  bg: '#fef9c3', color: '#713f12' },
    };
    const s = cfg[status] || { label: status, bg: '#f3f4f6', color: '#374151' };
    return (
      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
        {s.label}
      </span>
    );
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

  const handleUnapproveClick = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const ctx = await tasksAPI.getUnapproveContext(task.id);
      if (!ctx.canUnapprove) {
        await showAlert('Only approved reports can be unapproved.', 'Cannot unapprove');
        return;
      }
      setUnapproveAlreadySent(ctx.alreadySentToClient);
      setUnapproveTask(task);
    } catch (err: any) {
      await showAlert(
        err.response?.data?.error || 'Could not open unapprove. Please try again.',
        'Error'
      );
    }
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
              src={getBackendPublicFileUrl(tenant.logoPath)}
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
                onClick={() => navigate('/admin/nuclear-gauges')}
                className="secondary-button"
              >
                Nuclear Gauge Log
              </button>
            )}
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
                                navigate(`/admin/projects/${project.id}/create-workorder`);
                              }}
                              className="create-task-button-primary"
                            >
                              Create Workorder
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="project-content">
                      {/* ── Workorder accordion ── */}
                      {(workorders[project.id] || []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(workorders[project.id] || []).map(wo => {
                            const isWoExpanded = expandedWorkorders.has(wo.id);
                            const woTasks = projectTasks.filter(
                              t => (t as any).workorderId === wo.id || (t as any).workorder_id === wo.id
                            );
                            return (
                              <div key={wo.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                                {/* Workorder header row */}
                                <div
                                  style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: isWoExpanded ? '#f0f9ff' : '#f9fafb', cursor: 'pointer', gap: 10, borderBottom: isWoExpanded ? '1px solid #e5e7eb' : 'none' }}
                                  onClick={() => toggleWorkorder(wo.id)}
                                >
                                  <span style={{ color: '#6b7280', fontSize: 11, width: 12 }}>{isWoExpanded ? '▼' : '▶'}</span>

                                  <span style={{ fontWeight: 700, fontSize: 13, color: '#111827', minWidth: 70 }}>
                                    {wo.workorderNumber}
                                  </span>

                                  {/* Date + Report Time */}
                                  {(wo.scheduledDate || (wo as any).scheduled_date) && (
                                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                                      {fmtDate(wo.scheduledDate || (wo as any).scheduled_date)}
                                      {(wo.scheduledTime || (wo as any).scheduled_time) && (
                                        <span style={{ color: '#2563eb', fontWeight: 700, marginLeft: 4 }}>
                                          · {fmtTime(wo.scheduledTime || (wo as any).scheduled_time)}
                                        </span>
                                      )}
                                    </span>
                                  )}

                                  {/* Site location */}
                                  {wo.siteLocation && (
                                    <span style={{ fontSize: 12, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      · {wo.siteLocation}
                                    </span>
                                  )}

                                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {/* Tech name */}
                                    {wo.assignedTechnicianName && (
                                      <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {wo.assignedTechnicianName}
                                      </span>
                                    )}

                                    {/* Task count chip */}
                                    {woTasks.length > 0 && (
                                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
                                        {woTasks.length} {woTasks.length === 1 ? 'task' : 'tasks'}
                                      </span>
                                    )}

                                    {woStatusBadge(wo.status)}

                                    {/* Clock status indicator */}
                                    {wo.clockIn && !wo.clockOut && (
                                      <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>
                                        Clocked In
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Tasks under this workorder */}
                                {isWoExpanded && (
                                  <div style={{ padding: '4px 0' }}>
                                    {woTasks.length === 0 ? (
                                      <div style={{ padding: '10px 40px', color: '#9ca3af', fontSize: 13 }}>
                                        No tasks in this workorder.
                                        {isAdmin() && (
                                          <button
                                            onClick={() => navigate(`/admin/create-task/${project.id}`, { state: { workorderId: wo.id } })}
                                            style={{ marginLeft: 10, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
                                          >
                                            Add task
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      woTasks.map(task => (
                                        <div
                                          key={task.id}
                                          className="task-item"
                                          style={{ paddingLeft: 40 }}
                                          onClick={() => handleTaskClick(task)}
                                        >
                                          <div className="task-status-badge-container">
                                            <span className={`task-status-badge ${getStatusClass(task.status)}`}>
                                              {getStatusLabel(task.status)}
                                            </span>
                                          </div>
                                          <div className="task-info">
                                            <span className="task-name">{taskTypeLabel(task)}</span>
                                          </div>
                                          {isStaffReviewer() && (
                                            <>
                                              {isAdmin() && task.status !== 'APPROVED' && (
                                                <button
                                                  className="edit-task-button-secondary"
                                                  style={{ background: '#6c757d', color: 'white', borderColor: '#6c757d' }}
                                                  onClick={(e) => handleDeleteTask(task, e)}
                                                >
                                                  Delete
                                                </button>
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
                                              {task.status === 'APPROVED' && isReportTask(task) && (
                                                <button
                                                  className="edit-task-button-secondary"
                                                  style={{ background: '#dc3545', color: 'white', borderColor: '#dc3545' }}
                                                  onClick={(e) => void handleUnapproveClick(task, e)}
                                                >
                                                  Unapprove
                                                </button>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : projectTasks.length > 0 ? (
                        /* Legacy: tasks not linked to a workorder */
                        <div className="tasks-list">
                          {projectTasks.map((task) => (
                            <div key={task.id} className="task-item" onClick={() => handleTaskClick(task)}>
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
                                        onClick={(e) => { e.stopPropagation(); navigate(`/task/${task.id}/edit`, { state: { returnPath: '/dashboard' } }); }}
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
                                      <button className="edit-task-button-secondary" style={{ background: '#28a745', color: 'white', borderColor: '#28a745' }} onClick={(e) => handleApprove(task.id, e)}>Approve</button>
                                      <button className="edit-task-button-secondary" style={{ background: '#dc3545', color: 'white', borderColor: '#dc3545' }} onClick={(e) => handleRejectClick(task, e)}>Reject</button>
                                    </>
                                  )}
                                  {task.status === 'APPROVED' && isReportTask(task) && (
                                    <button className="edit-task-button-secondary" style={{ background: '#dc3545', color: 'white', borderColor: '#dc3545' }} onClick={(e) => void handleUnapproveClick(task, e)}>Unapprove</button>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-tasks-message">
                          No workorders yet. {isAdmin() ? 'Click "Create Workorder" to dispatch a technician.' : ''}
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
      <UnapproveTaskModal
        isOpen={unapproveTask !== null}
        contextLine={
          unapproveTask
            ? `${unapproveTask.projectNumber ?? '—'} · ${taskTypeLabel(unapproveTask)}`
            : undefined
        }
        alreadySentToClient={unapproveAlreadySent}
        onClose={() => {
          setUnapproveTask(null);
          setUnapproveAlreadySent(false);
        }}
        onSubmit={async (payload) => {
          if (!unapproveTask) return;
          await tasksAPI.unapprove(unapproveTask.id, payload);
          setUnapproveTask(null);
          setUnapproveAlreadySent(false);
          loadData();
        }}
      />
    </div>
  );
};

export default Dashboard;

