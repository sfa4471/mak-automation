import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppDialog } from '../context/AppDialogContext';
import { useTenant } from '../context/TenantContext';
import { tasksAPI, Task, taskTypeLabel } from '../api/tasks';
import { notificationsAPI, Notification } from '../api/notifications';
import gaugesApi, { NuclearGauge } from '../api/gauges';
import { getMySchedule, WorkorderWithTasks } from '../api/invoicing';
import TaskDetailModal from './TaskDetailModal';
import CompletedFieldJobsLog from './CompletedFieldJobsLog';
import './TechnicianDashboard.css';

// ── date bucketing ────────────────────────────────────────────────────────────

type Bucket = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later';

interface ScheduleGroups {
  overdue: Task[];
  today: Task[];
  tomorrow: Task[];
  thisWeek: Task[];
  later: Task[];
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDate(tasks: Task[], asOf: string): ScheduleGroups {
  const today = new Date(asOf + 'T00:00:00');
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const todayStr    = toYMD(today);
  const tomorrowStr = toYMD(tomorrow);
  const weekEndStr  = toYMD(weekEnd);

  const groups: ScheduleGroups = { overdue: [], today: [], tomorrow: [], thisWeek: [], later: [] };

  const sorted = [...tasks].sort((a, b) => {
    const da = a.scheduledStartDate || '9999-99-99';
    const db = b.scheduledStartDate || '9999-99-99';
    if (da !== db) return da.localeCompare(db);
    return (a.scheduledStartTime || '99:99').localeCompare(b.scheduledStartTime || '99:99');
  });

  for (const task of sorted) {
    const d = task.scheduledStartDate;
    if (!d || d < todayStr)  groups.overdue.push(task);
    else if (d === todayStr)    groups.today.push(task);
    else if (d === tomorrowStr) groups.tomorrow.push(task);
    else if (d <= weekEndStr)   groups.thisWeek.push(task);
    else                        groups.later.push(task);
  }
  return groups;
}

// ── component ─────────────────────────────────────────────────────────────────

const TechnicianDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workorders, setWorkorders] = useState<WorkorderWithTasks[]>([]);
  const [openReports, setOpenReports] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<'schedule' | 'activity' | 'gauges'>('schedule');
  const [gauges, setGauges] = useState<NuclearGauge[]>([]);
  const [gaugesLoading, setGaugesLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // Memoised group structure — only computed for schedule tab
  const scheduleGroups = useMemo<ScheduleGroups | null>(() => {
    if (activeFilter !== 'schedule') return null;
    return groupByDate(tasks, tasksAPI.getTechnicianCalendarAsOf());
  }, [tasks, activeFilter]);

  const totalScheduled = scheduleGroups
    ? (Object.values(scheduleGroups) as Task[][]).reduce((n, arr) => n + arr.length, 0)
    : 0;

  // Bucket definitions — labels computed once per render (dates don't shift mid-session)
  const bucketOrder = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const fmtDay = (d: Date) =>
      d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return [
      { key: 'overdue'  as Bucket, label: 'Overdue',   sublabel: 'Past scheduled dates — action required', showDate: true  },
      { key: 'today'    as Bucket, label: 'Today',     sublabel: fmtDay(today),    showDate: false },
      { key: 'tomorrow' as Bucket, label: 'Tomorrow',  sublabel: fmtDay(tomorrow), showDate: false },
      { key: 'thisWeek' as Bucket, label: 'This Week', showDate: true  },
      { key: 'later'    as Bucket, label: 'Later',     showDate: true  },
    ];
  }, []);

  // ── gauge loading ────────────────────────────────────────────────────────────

  const loadGauges = useCallback(async () => {
    setGaugesLoading(true);
    try {
      const data = await gaugesApi.list();
      setGauges(data.filter(g => g.active));
    } catch {
      setGauges([]);
    } finally {
      setGaugesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeFilter === 'gauges') loadGauges();
  }, [activeFilter, loadGauges]);

  // ── data loading ────────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      setLoading(true);
      setTasks([]);

      const asOf = tasksAPI.getTechnicianCalendarAsOf();

      // Open-reports banner is always refreshed regardless of active tab
      const reportsData = await tasksAPI.getTechnicianOpenReports().catch(() => [] as Task[]);
      setOpenReports(reportsData);

      if (activeFilter === 'schedule') {
        const [todayData, upcomingData, scheduleData] = await Promise.all([
          tasksAPI.getTechnicianToday(asOf).catch(() => [] as Task[]),
          tasksAPI.getTechnicianUpcoming(asOf).catch(() => [] as Task[]),
          getMySchedule().catch(() => ({ workorders: [] as WorkorderWithTasks[] })),
        ]);
        // Merge and deduplicate — today endpoint takes precedence for the same task
        const byId = new Map<number, Task>();
        todayData.forEach(t => byId.set(t.id, t));
        upcomingData.forEach(t => { if (!byId.has(t.id)) byId.set(t.id, t); });
        setTasks(Array.from(byId.values()));
        setWorkorders(scheduleData.workorders || []);
      } else {
        const completed = await tasksAPI.getTechnicianCompletedFieldWork().catch(() => [] as Task[]);
        setTasks(completed);
      }

      const [notifs, count] = await Promise.all([
        notificationsAPI.list().catch(() => [] as Notification[]),
        notificationsAPI.getUnreadCount().catch(() => 0),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── handlers ────────────────────────────────────────────────────────────────

  const handleTaskClick = (task: Task) => {
    if (task.taskType === 'COMPRESSIVE_STRENGTH') navigate(`/task/${task.id}/wp1`);
    else if (task.taskType === 'DENSITY_MEASUREMENT') navigate(`/task/${task.id}/density`);
    else if (task.taskType === 'REBAR') navigate(`/task/${task.id}/rebar`);
    else if (task.taskType === 'PROCTOR') {
      const reviewStatuses = ['READY_FOR_REVIEW', 'APPROVED'];
      if (reviewStatuses.includes(task.status)) {
        navigate(`/task/${task.id}/proctor/summary`);
      } else {
        navigate(`/task/${task.id}/proctor`);
      }
    }
    else void showAlert('This task type is not available yet.', 'Not available');
  };

  const handleMarkFieldComplete = async (task: Task) => {
    try {
      await tasksAPI.markFieldComplete(task.id);
      loadData();
    } catch (error: any) {
      await showAlert(
        error.response?.data?.error || error.message || 'Could not mark field work complete. Please try again.',
        'Error'
      );
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await notificationsAPI.markAsRead(notification.id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, isRead: 1 } : n));
    }
    if ((notification as any).relatedTaskId) {
      navigate(`/task/${(notification as any).relatedTaskId}/wp1`);
    } else if (notification.relatedWorkPackageId) {
      navigate(`/workpackage/${notification.relatedWorkPackageId}/wp1`);
    }
    setShowNotifications(false);
  };

  const handleClearAllNotifications = async () => {
    const ok = await showConfirm(
      'Clear all notifications? This removes every notification from your list.',
      'Clear notifications'
    );
    if (!ok) return;
    try {
      await notificationsAPI.clearAll();
      setUnreadCount(0);
      setNotifications([]);
    } catch (error: any) {
      await showAlert('Notifications could not be cleared. Please try again.', 'Error');
    }
  };

  // ── formatters ───────────────────────────────────────────────────────────────

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  };

  const formatFieldDates = (task: Task): string => {
    if (!task.scheduledStartDate) return '—';
    const [sy, sm, sd] = task.scheduledStartDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (task.scheduledEndDate && task.scheduledEndDate !== task.scheduledStartDate) {
      const [ey, em, ed] = task.scheduledEndDate.split('-').map(Number);
      const end = new Date(ey, em - 1, ed);
      return `${startFmt} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return startFmt;
  };

  const formatArrivalTime = (timeStr?: string): string => {
    if (!timeStr) return '';
    const [hStr, mStr = '00'] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    if (isNaN(h)) return timeStr;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mStr} ${period}`;
  };

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      ASSIGNED: 'Assigned',
      IN_PROGRESS_TECH: 'In Progress',
      READY_FOR_REVIEW: 'Submitted for Admin Review',
      APPROVED: 'Approved',
      REJECTED_NEEDS_FIX: 'Rejected – Needs Fix',
    };
    return map[status] || status;
  };

  // ── schedule card ────────────────────────────────────────────────────────────

  const renderScheduleCard = (task: Task, showDate: boolean) => {
    const arrivalTime = formatArrivalTime(task.scheduledStartTime);
    const hasMeta = !!(arrivalTime || (showDate && task.scheduledStartDate) || task.locationName || task.dueDate);

    return (
      <div key={task.id} className="schedule-card">
        <div className="schedule-card-top">
          <div className="schedule-card-info">
            <span className="schedule-card-project">{task.projectNumber}</span>
            <span className="schedule-card-sep">·</span>
            <span className="schedule-card-type">{taskTypeLabel(task)}</span>
            {task.projectName && (
              <span className="schedule-card-projname">{task.projectName}</span>
            )}
            {task.status === 'IN_PROGRESS_TECH' && (
              <span className="sched-badge sched-badge--inprogress">In Progress</span>
            )}
            {task.status === 'REJECTED_NEEDS_FIX' && (
              <span className="sched-badge sched-badge--rejected">Rejected</span>
            )}
          </div>
          <div className="schedule-card-actions">
            <button
              type="button"
              className="sched-btn sched-btn--detail"
              onClick={() => setSelectedTaskForDetail(task)}
            >
              Task Detail
            </button>
            <button
              type="button"
              className="sched-btn sched-btn--view"
              onClick={() => handleTaskClick(task)}
            >
              {task.status === 'IN_PROGRESS_TECH' ? 'Continue' : 'View'}
            </button>
          </div>
        </div>

        {hasMeta && (
          <div className="schedule-card-meta">
            {arrivalTime && (
              <span className="sched-meta-time">⏰ {arrivalTime}</span>
            )}
            {showDate && task.scheduledStartDate && (
              <span className="sched-meta-date">{formatFieldDates(task)}</span>
            )}
            {task.locationName && (
              <span className="sched-meta-loc">📍 {task.locationName}</span>
            )}
            {task.dueDate && (
              <span className="sched-meta-due">Report due {formatDate(task.dueDate)}</span>
            )}
          </div>
        )}

        {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
          <div className="schedule-card-rejection">
            Admin note: {task.rejectionRemarks}
          </div>
        )}
      </div>
    );
  };

  // ── workorder card ───────────────────────────────────────────────────────────

  const renderWorkorderCard = (wo: WorkorderWithTasks) => {
    const hasClockedIn  = !!wo.clockIn;
    const hasClockedOut = !!wo.clockOut;
    const isCNA         = wo.status === 'could_not_access';

    const fmtScheduledDate = (d?: string): string => {
      if (!d) return '';
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const clockBtnLabel = hasClockedIn && !hasClockedOut
      ? 'Clock Out'
      : hasClockedIn
      ? 'View'
      : 'Clock In';

    const badgeStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
    };

    return (
      <div key={wo.id} className="schedule-card">
        <div className="schedule-card-top">
          <div className="schedule-card-info">
            <span className="schedule-card-project">{wo.workorderNumber}</span>
            {wo.scheduledDate && (
              <>
                <span className="schedule-card-sep">·</span>
                <span className="schedule-card-type">{fmtScheduledDate(wo.scheduledDate)}</span>
              </>
            )}
            {(wo.siteLocation || (wo.tasks[0] as any)?.projectName) && (
              <span className="schedule-card-projname">
                {wo.siteLocation || (wo.tasks[0] as any)?.projectName}
              </span>
            )}
            {isCNA && (
              <span className="sched-badge sched-badge--cna">Could Not Access</span>
            )}
            {hasClockedIn && !hasClockedOut && !isCNA && (
              <span className="sched-badge sched-badge--inprogress">In Progress</span>
            )}
            {hasClockedIn && hasClockedOut && !isCNA && (
              <span style={{ ...badgeStyle, background: '#dcfce7', color: '#166534' }}>Complete</span>
            )}
          </div>
          <div className="schedule-card-actions">
            <button
              type="button"
              className="sched-btn sched-btn--detail"
              onClick={() => navigate(`/technician/workorder/${wo.id}`)}
            >
              {clockBtnLabel}
            </button>
          </div>
        </div>

        {/* Project info */}
        {wo.tasks.length > 0 && wo.tasks[0].projectNumber && (
          <div className="schedule-card-meta">
            <span className="sched-meta-loc">
              {wo.tasks[0].projectNumber}{wo.tasks[0].projectName ? ` — ${wo.tasks[0].projectName}` : ''}
            </span>
          </div>
        )}

        {/* Task list */}
        {wo.tasks.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            {wo.tasks.map(task => (
              <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontSize: 13, color: '#374151' }}>
                  • {task.taskType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  {task.locationName ? ` — ${task.locationName}` : ''}
                </span>
                <button
                  type="button"
                  className="sched-btn sched-btn--view"
                  onClick={() => {
                    if (task.taskType === 'COMPRESSIVE_STRENGTH') navigate(`/task/${task.id}/wp1`);
                    else if (task.taskType === 'DENSITY_MEASUREMENT') navigate(`/task/${task.id}/density`);
                    else if (task.taskType === 'REBAR') navigate(`/task/${task.id}/rebar`);
                    else if (task.taskType === 'PROCTOR') navigate(`/task/${task.id}/proctor`);
                    else navigate(`/technician/workorder/${wo.id}`);
                  }}
                  style={{ fontSize: 12, padding: '3px 8px' }}
                >
                  Report
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="technician-dashboard-loading">Loading…</div>;
  }

  return (
    <div className="technician-dashboard">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="technician-dashboard-header">
        <div className="header-left">
          <h1>My Tasks</h1>
          {tenant?.name && <span className="tenant-info">{tenant.name}</span>}
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
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true,
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/technician/change-password')}
            className="change-password-button"
          >
            Change Password
          </button>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="technician-dashboard-content">

        {/* ── Open Reports Banner ─────────────────────────────────────────── */}
        {openReports.length > 0 && (
          <div className="open-reports-banner">
            <div className="open-reports-banner-title">
              ⚠️&nbsp;{openReports.length}&nbsp;report{openReports.length !== 1 ? 's' : ''} pending your submission
            </div>
            <div className="open-reports-banner-list">
              {openReports.map(task => (
                <div key={task.id} className="open-reports-banner-item">
                  <span className="open-reports-item-label">
                    {task.projectNumber} · {taskTypeLabel(task)}
                    {task.status === 'REJECTED_NEEDS_FIX' && (
                      <span className="open-reports-item-rejected">Rejected</span>
                    )}
                  </span>
                  {task.dueDate && (
                    <span className="open-reports-item-due">Due {formatDate(task.dueDate)}</span>
                  )}
                  <button
                    type="button"
                    className="open-reports-item-btn"
                    onClick={() => setSelectedTaskForDetail(task)}
                  >
                    Detail
                  </button>
                  <button
                    type="button"
                    className="open-reports-item-btn open-reports-item-btn--primary"
                    onClick={() => handleTaskClick(task)}
                  >
                    Continue →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="filter-tabs">
          <button
            className={`filter-tab ${activeFilter === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveFilter('schedule')}
          >
            My Schedule
          </button>
          <button
            className={`filter-tab ${activeFilter === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveFilter('activity')}
          >
            Activity Log
          </button>
          <button
            className={`filter-tab ${activeFilter === 'gauges' ? 'active' : ''}`}
            onClick={() => setActiveFilter('gauges')}
          >
            Nuclear Gauges
          </button>
        </div>

        {/* ── Activity Log ─────────────────────────────────────────────────── */}
        {activeFilter === 'activity' && (
          <CompletedFieldJobsLog
            key="activity-log"
            tasks={tasks}
            variant="technician"
            taskTypeLabel={taskTypeLabel}
            formatDate={formatDate}
            formatFieldDates={formatFieldDates}
            getStatusLabel={getStatusLabel}
            onTechnicianTaskDetail={setSelectedTaskForDetail}
            onTechnicianOpenTask={handleTaskClick}
          />
        )}

        {/* ── My Schedule ──────────────────────────────────────────────────── */}
        {activeFilter === 'schedule' && scheduleGroups && (
          workorders.length === 0 && totalScheduled === 0 ? (
            <div className="empty-state">
              <p>No upcoming tasks assigned to you.</p>
              <p style={{ fontSize: 14, color: '#888', marginTop: 8 }}>
                Check back later or contact your PM if you're expecting assignments.
              </p>
            </div>
          ) : (
            <div className="schedule-view">
              {/* Workorder cards first */}
              {workorders.length > 0 && (
                <div className="schedule-group schedule-group--today">
                  <div className="schedule-group-header">
                    <div className="schedule-group-header-text">
                      <span className="schedule-group-label">Dispatches</span>
                      <span className="schedule-group-sublabel">Upcoming site visits</span>
                    </div>
                    <span className="schedule-group-count">
                      {workorders.length} {workorders.length === 1 ? 'workorder' : 'workorders'}
                    </span>
                  </div>
                  <div className="schedule-group-body">
                    {workorders.map(wo => renderWorkorderCard(wo))}
                  </div>
                </div>
              )}

              {/* Legacy task-based schedule (tasks without workorders) */}
              {totalScheduled > 0 && bucketOrder.map(({ key, label, sublabel, showDate }) => {
                const group = scheduleGroups[key];
                if (group.length === 0) return null;
                return (
                  <div key={key} className={`schedule-group schedule-group--${key}`}>
                    <div className="schedule-group-header">
                      <div className="schedule-group-header-text">
                        <span className="schedule-group-label">{label}</span>
                        {sublabel && (
                          <span className="schedule-group-sublabel">{sublabel}</span>
                        )}
                      </div>
                      <span className="schedule-group-count">
                        {group.length} {group.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                    <div className="schedule-group-body">
                      {group.map(task => renderScheduleCard(task, showDate))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        {/* ── Nuclear Gauges ───────────────────────────────────────────────── */}
        {activeFilter === 'gauges' && (
          <div className="td-gauges">
            {gaugesLoading && <div className="td-gauges-loading">Loading gauges…</div>}
            {!gaugesLoading && (() => {
              const myCheckout = gauges.find(
                g => g.status === 'in_field' && g.currentCheckout?.technicianId === (user as any)?.id
              );
              const checkedOutByOthers = gauges.filter(
                g => g.status === 'in_field' && g.currentCheckout?.technicianId !== (user as any)?.id
              );
              const inLab = gauges.filter(g => g.status === 'in_lab');

              return (
                <>
                  {/* My current gauge */}
                  <div className="td-gauges-section">
                    <div className="td-gauges-section-title">My Gauge</div>
                    {myCheckout ? (
                      <div className="td-gauge-card td-gauge-mine" onClick={() => navigate(`/gauges/${myCheckout.id}`)}>
                        <div className="td-gauge-dot out" />
                        <div className="td-gauge-info">
                          <div className="td-gauge-name">{myCheckout.model} · S/N {myCheckout.serialNumber}</div>
                          {myCheckout.nickname && <div className="td-gauge-nick">{myCheckout.nickname}</div>}
                          <div className="td-gauge-meta">
                            Checked out {myCheckout.currentCheckout?.timeOut
                              ? new Date(myCheckout.currentCheckout.timeOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                            {myCheckout.currentCheckout?.projectName ? ` · ${myCheckout.currentCheckout.projectName}` : ''}
                          </div>
                        </div>
                        <button className="td-gauge-action checkin">Return to Lab →</button>
                      </div>
                    ) : (
                      <div className="td-gauges-empty">You have no gauge checked out.</div>
                    )}
                  </div>

                  {/* Available in lab */}
                  <div className="td-gauges-section">
                    <div className="td-gauges-section-title">Available in Lab <span className="td-gauges-count">{inLab.length}</span></div>
                    {inLab.length === 0
                      ? <div className="td-gauges-empty">No gauges available — all are in the field.</div>
                      : inLab.map(g => (
                          <div key={g.id} className="td-gauge-card" onClick={() => navigate(`/gauges/${g.id}`)}>
                            <div className="td-gauge-dot in" />
                            <div className="td-gauge-info">
                              <div className="td-gauge-name">{g.model} · S/N {g.serialNumber}</div>
                              {g.nickname && <div className="td-gauge-nick">{g.nickname}</div>}
                            </div>
                            <button className="td-gauge-action checkout">Check Out →</button>
                          </div>
                        ))
                    }
                  </div>

                  {/* In field by others */}
                  {checkedOutByOthers.length > 0 && (
                    <div className="td-gauges-section">
                      <div className="td-gauges-section-title">In Field — Others <span className="td-gauges-count">{checkedOutByOthers.length}</span></div>
                      {checkedOutByOthers.map(g => (
                        <div key={g.id} className="td-gauge-card td-gauge-other">
                          <div className="td-gauge-dot out" />
                          <div className="td-gauge-info">
                            <div className="td-gauge-name">{g.model} · S/N {g.serialNumber}</div>
                            <div className="td-gauge-meta">
                              {g.currentCheckout?.users?.name || (g.currentCheckout as any)?.technicianName || 'Unknown'}
                              {g.currentCheckout?.projectName ? ` · ${g.currentCheckout.projectName}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Task Detail Modal ───────────────────────────────────────────────── */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
          onClose={() => setSelectedTaskForDetail(null)}
          isTechnicianView
        />
      )}
    </div>
  );
};

export default TechnicianDashboard;
