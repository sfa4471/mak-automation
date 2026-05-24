import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppDialog } from '../../context/AppDialogContext';
import { tasksAPI, Task, taskTypeLabel, TaskType } from '../../api/tasks';
import RejectTaskModal from '../RejectTaskModal';
import UnapproveTaskModal from '../UnapproveTaskModal';
import CompletedFieldJobsLog from '../CompletedFieldJobsLog';
import './TasksDashboard.css';

type ActiveFilter = 'board' | 'pending-approval' | 'activity';

interface BoardGroup {
  label: 'Overdue' | 'Today' | 'Upcoming';
  tasks: Task[];
}

function toPositiveTaskId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

function resolveTaskApiFields(task: Task): {
  taskType: TaskType | undefined;
  status: string;
  fieldCompleted: boolean;
} {
  const raw = task as Task & {
    task_type?: TaskType;
    field_completed?: number | boolean;
  };
  const taskType = task.taskType ?? raw.task_type;
  const status = String(task.status ?? '');
  const fc = task.fieldCompleted ?? raw.field_completed;
  const fieldCompleted = fc === 1 || fc === true;
  return { taskType, status, fieldCompleted };
}

const TasksDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const navigate = useNavigate();
  const location = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [boardGroups, setBoardGroups] = useState<BoardGroup[]>([]);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('board');
  const [loading, setLoading] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [approveModalBusy, setApproveModalBusy] = useState(false);
  const [rejectModalTask, setRejectModalTask] = useState<Task | null>(null);
  const [unapproveTask, setUnapproveTask] = useState<Task | null>(null);
  const [unapproveAlreadySent, setUnapproveAlreadySent] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState<
    | null
    | { mode: 'single'; taskId: number }
    | { mode: 'bulk'; count: number }
  >(null);
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, location.key]);

  const loadData = async () => {
    try {
      setLoading(true);
      setTasks([]);
      setBoardGroups([]);
      setSelectedTaskIds(new Set());

      if (activeFilter === 'board') {
        const [todayRaw, overdueRaw, upcomingRaw] = await Promise.all([
          tasksAPI.getToday(),
          tasksAPI.getOverdue(),
          tasksAPI.getUpcoming(30),
        ]);

        const seen = new Set<number>();
        const overdueList: Task[] = [];
        const todayList: Task[] = [];
        const upcomingList: Task[] = [];

        for (const t of overdueRaw) {
          if (!seen.has(t.id)) { seen.add(t.id); overdueList.push(t); }
        }
        for (const t of todayRaw) {
          if (!seen.has(t.id) && t.status !== 'APPROVED') { seen.add(t.id); todayList.push(t); }
        }
        for (const t of upcomingRaw) {
          if (!seen.has(t.id)) { seen.add(t.id); upcomingList.push(t); }
        }

        const groups: BoardGroup[] = [];
        if (overdueList.length) groups.push({ label: 'Overdue', tasks: overdueList });
        if (todayList.length) groups.push({ label: 'Today', tasks: todayList });
        if (upcomingList.length) groups.push({ label: 'Upcoming', tasks: upcomingList });

        setBoardGroups(groups);
        setTasks([...overdueList, ...todayList, ...upcomingList]);
      } else if (activeFilter === 'pending-approval') {
        const data = await tasksAPI.getPendingApproval();
        setTasks(data);
      } else if (activeFilter === 'activity') {
        const data = await tasksAPI.getCompletedFieldWork();
        setTasks(data);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setTasks([]);
      setBoardGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'ASSIGNED': 'Assigned',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Under review (PM / Admin)',
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

  const getPmReviewLabel = (pmReviewStatus?: string): string => {
    const statusMap: Record<string, string> = {
      'NOT_STARTED': 'In queue',
      'REVIEWING': 'Reviewing',
      'COMPLETED': 'Completed'
    };
    if (!pmReviewStatus) return '—';
    return statusMap[pmReviewStatus] || pmReviewStatus;
  };

  const getPmReviewClass = (pmReviewStatus?: string): string => {
    if (!pmReviewStatus) return '';
    const classMap: Record<string, string> = {
      'NOT_STARTED': 'pm-review-in-queue',
      'REVIEWING': 'pm-review-reviewing',
      'COMPLETED': 'pm-review-completed'
    };
    return classMap[pmReviewStatus] || '';
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString();
  };

  const formatFieldDates = (task: Task): string => {
    if (task.scheduledStartDate) {
      const [startYear, startMonth, startDay] = task.scheduledStartDate.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (task.scheduledEndDate) {
        const [endYear, endMonth, endDay] = task.scheduledEndDate.split('-').map(Number);
        const endDate = new Date(endYear, endMonth - 1, endDay);
        const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (task.scheduledStartDate === task.scheduledEndDate) return startFormatted;
        return `${startFormatted} – ${endFormatted}`;
      }
      return startFormatted;
    }
    return '—';
  };

  const isReportTask = (taskType: TaskType): boolean =>
    taskType === 'COMPRESSIVE_STRENGTH' ||
    taskType === 'DENSITY_MEASUREMENT' ||
    taskType === 'REBAR' ||
    taskType === 'PROCTOR';

  const isFieldTask = (taskType: TaskType): boolean => !isReportTask(taskType);

  const getTaskBadges = (task: Task): string[] => {
    const badges: string[] = [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dueDate = task.dueDate || null;

    if (task.status === 'APPROVED') {
      badges.push('COMPLETED');
    } else if (dueDate) {
      if (dueDate === today) {
        badges.push('DUE_TODAY');
      } else if (dueDate < today) {
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

  const navigateToReport = (task: Task) => {
    if (task.taskType === 'COMPRESSIVE_STRENGTH') navigate(`/task/${task.id}/wp1`);
    else if (task.taskType === 'DENSITY_MEASUREMENT') navigate(`/task/${task.id}/density`);
    else if (task.taskType === 'REBAR') navigate(`/task/${task.id}/rebar`);
    else if (task.taskType === 'PROCTOR') navigate(`/task/${task.id}/proctor/summary`);
  };

  const handleViewReport = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    navigateToReport(task);
  };

  const handleViewTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    void showAlert(`${taskTypeLabel(task)} task details are not available in this view yet.`, 'Coming soon');
  };

  const handleApproveClick = (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setApproveConfirm({ mode: 'single', taskId });
  };

  const handleBulkApproveClick = () => {
    if (selectedTaskIds.size === 0) return;
    setApproveConfirm({ mode: 'bulk', count: selectedTaskIds.size });
  };

  const runApproveSingle = async (taskId: number) => {
    setApproveModalBusy(true);
    try {
      const updated = await tasksAPI.approve(taskId);
      setApproveConfirm(null);
      let message = 'The report has been approved. The assigned technician has been notified.';
      const pdf = updated.pdf;
      if (pdf && !pdf.skipped) {
        if (pdf.success === false) {
          message += ` PDF was not generated (${pdf.error || 'unknown error'}).`;
        } else if (!pdf.saved) {
          message += ' PDF was not saved to the workflow folder (check server path / permissions).';
          if (pdf.saveError) message += ` ${pdf.saveError}`;
        }
      }
      setNotice({ variant: 'success', message });
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error ||
        'We could not approve this report. Please try again or contact support if the problem continues.';
      setNotice({ variant: 'error', message: msg });
    } finally {
      setApproveModalBusy(false);
    }
  };

  const runBulkApprove = async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;

    setIsBulkApproving(true);
    try {
      const result = await tasksAPI.bulkApprove(ids);
      setApproveConfirm(null);

      const { totals, results } = result;
      const firstSaveError = results?.find((r) => r.status === 'ERROR' && r.error)?.error;
      const saveErrorHint = firstSaveError ? ` ${firstSaveError}` : '';

      if (totals.approved === 0) {
        const parts: string[] = [];
        if (totals.skippedWrongStatus) parts.push(`${totals.skippedWrongStatus} not in "ready for review" status`);
        if (totals.notFound) parts.push(`${totals.notFound} not found`);
        if (totals.forbidden) parts.push(`${totals.forbidden} could not be accessed`);
        if (totals.errors) parts.push(`${totals.errors} failed to update in the database`);
        const detail = parts.length ? ` (${parts.join('; ')})` : '';
        setNotice({
          variant: 'error',
          message: `No reports were approved${detail}.${saveErrorHint} Refresh the list and try again, or approve reports individually.`,
        });
      } else {
        let msg = `Successfully approved ${totals.approved} report${totals.approved === 1 ? '' : 's'}. Technicians have been notified where applicable.`;
        if (totals.skippedWrongStatus > 0 || totals.notFound > 0 || totals.errors > 0) {
          const skipped = totals.skippedWrongStatus + totals.notFound + totals.forbidden + totals.errors;
          msg += ` ${skipped} item${skipped === 1 ? '' : 's'} could not be approved (wrong status, missing, or database error).`;
          if (firstSaveError) msg += ` ${firstSaveError}`;
        }
        const approvedRows = results?.filter((r) => r.status === 'APPROVED') || [];
        const pdfGenFailed = approvedRows.filter((r) => r.pdf && !r.pdf.skipped && r.pdf.success === false).length;
        const pdfNotSaved = approvedRows.filter((r) => r.pdf && !r.pdf.skipped && r.pdf.success === true && !r.pdf.saved).length;
        if (pdfGenFailed > 0) {
          const firstPdfErr = approvedRows.find((r) => r.pdf && !r.pdf.skipped && r.pdf.success === false)?.pdf?.error;
          msg += ` ${pdfGenFailed} PDF${pdfGenFailed === 1 ? '' : 's'} could not be generated (approvals are still saved).`;
          if (firstPdfErr) msg += ` Detail: ${firstPdfErr}`;
        }
        if (pdfNotSaved > 0) {
          msg += ` ${pdfNotSaved} PDF${pdfNotSaved === 1 ? '' : 's'} did not save to the workflow folder (check path settings).`;
        }
        setNotice({ variant: 'success', message: msg });
      }
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.error ||
        'We could not complete bulk approval. Please try again or contact support if the problem continues.';
      setNotice({ variant: 'error', message: msg });
    } finally {
      setIsBulkApproving(false);
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
      await showAlert(err.response?.data?.error || 'Could not open unapprove. Please try again.', 'Error');
    }
  };

  const handleEditTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/task/${task.id}/edit`, { state: { returnPath: '/admin/tasks' } });
  };

  const handleDeleteTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.status === 'APPROVED') return;
    const delOk = await showConfirm(`Delete ${taskTypeLabel(task)}? This cannot be undone.`, 'Delete task');
    if (!delOk) return;
    try {
      await tasksAPI.delete(task.id);
      await loadData();
    } catch (err: any) {
      await showAlert(err?.response?.data?.error || 'The task could not be deleted.', 'Delete failed');
    }
  };

  const getTaskActions = (task: Task): React.ReactNode => {
    const actions: React.ReactNode[] = [];
    const { taskType, status } = resolveTaskApiFields(task);
    const isReport = taskType != null && isReportTask(taskType);
    const isField = taskType != null && isFieldTask(taskType);

    actions.push(
      <button key="edit" onClick={(e) => handleEditTask(task, e)} className="action-button action-edit" title="Edit Task Details">
        Edit Task
      </button>
    );

    if (status !== 'APPROVED') {
      actions.push(
        <button key="delete" onClick={(e) => handleDeleteTask(task, e)} className="action-button action-reject" title="Delete this task">
          Delete
        </button>
      );
    }

    if (isReport) {
      actions.push(
        <button key="view" onClick={(e) => handleViewReport(task, e)} className="action-button action-view" title="View Report">
          {taskType === 'PROCTOR' && status === 'READY_FOR_REVIEW' ? 'Open summary' : 'View Report'}
        </button>
      );

      if (status === 'READY_FOR_REVIEW' || status === 'IN_PROGRESS_TECH') {
        actions.push(
          <button
            key="approve"
            onClick={(e) => {
              const tid = toPositiveTaskId(task.id);
              if (tid != null) handleApproveClick(tid, e);
            }}
            className="action-button action-approve"
            title="Approve report"
          >
            Approve
          </button>
        );
      }
      if (status === 'READY_FOR_REVIEW') {
        actions.push(
          <button key="reject" onClick={(e) => handleRejectClick(task, e)} className="action-button action-reject" title="Reject Task">
            Reject
          </button>
        );
      }
      if (status === 'APPROVED') {
        actions.push(
          <button key="unapprove" onClick={(e) => void handleUnapproveClick(task, e)} className="action-button action-reject" title="Unapprove report">
            Unapprove
          </button>
        );
      }
    } else if (isField) {
      actions.push(
        <button key="view" onClick={(e) => handleViewTask(task, e)} className="action-button action-view" title="View Task Details">
          View Details
        </button>
      );
    }

    return <div className="action-buttons">{actions}</div>;
  };

  const renderTaskRow = (task: Task) => {
    const badges = getTaskBadges(task);
    const isReport = isReportTask(task.taskType);
    const canBulkApprove = task.status === 'READY_FOR_REVIEW';
    const rowTaskId = toPositiveTaskId(task.id);

    return (
      <tr
        key={task.id}
        className={`task-row${isReport ? ' task-row-clickable' : ''}`}
        onClick={() => { if (isReport) navigateToReport(task); }}
        title={isReport ? 'Open report' : undefined}
      >
        <td onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={rowTaskId != null && selectedTaskIds.has(rowTaskId)}
            disabled={!canBulkApprove || rowTaskId == null}
            onChange={(e) => {
              if (rowTaskId == null) return;
              const checked = e.target.checked;
              setSelectedTaskIds(prev => {
                const next = new Set(prev);
                if (checked) next.add(rowTaskId);
                else next.delete(rowTaskId);
                return next;
              });
            }}
          />
        </td>
        <td>
          <div className="project-cell">
            <span className="project-number">{task.projectNumber}</span>
            {task.projectName && <span className="project-name">{task.projectName}</span>}
          </div>
        </td>
        <td>
          {task.assignedTechnicianName
            ? <span>{task.assignedTechnicianName}</span>
            : <span className="unassigned">Unassigned</span>}
        </td>
        <td>
          <div className="task-name-cell">
            <span className="task-name">{taskTypeLabel(task)}</span>
            <span className={`task-type-badge ${isReport ? 'badge-report' : 'badge-field'}`}>
              {isReport ? 'Report' : 'Field'}
            </span>
            {badges.map(badge => {
              let badgeText = badge;
              if (badge === 'DUE_TODAY') badgeText = 'Due Today';
              else if (badge === 'COMPLETED') badgeText = 'Completed';
              else if (badge.startsWith('OVERDUE_')) {
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
        <td>
          <span className={`pm-review-badge ${getPmReviewClass(task.pm_review_status)}`}>
            {getPmReviewLabel(task.pm_review_status)}
          </span>
        </td>
        <td>{formatDate(task.dueDate)}</td>
        <td onClick={(e) => e.stopPropagation()}>{getTaskActions(task)}</td>
      </tr>
    );
  };

  if (loading) {
    return <div className="tasks-dashboard-loading">Loading...</div>;
  }

  const pendingCount = tasks.filter(t => t.status === 'READY_FOR_REVIEW').length;

  return (
    <div className="tasks-dashboard">
      <header className="tasks-dashboard-header">
        <h1>Tasks Dashboard</h1>
        <div className="header-actions">
          <span className="user-info">{user?.name || user?.email}</span>
          <span className="user-role">({user?.role})</span>
          <button onClick={() => navigate('/dashboard')} className="back-button">Back to Projects</button>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>
      </header>

      <div className="tasks-dashboard-content">
        {notice && (
          <div className={`tasks-dashboard-notice tasks-dashboard-notice--${notice.variant}`} role="status">
            {notice.message}
            <button type="button" className="tasks-dashboard-notice-dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        <div className="filter-tabs">
          <button className={`filter-tab ${activeFilter === 'board' ? 'active' : ''}`} onClick={() => setActiveFilter('board')}>
            Task Board
          </button>
          <button className={`filter-tab ${activeFilter === 'pending-approval' ? 'active' : ''}`} onClick={() => setActiveFilter('pending-approval')}>
            Pending Approval{pendingCount > 0 && activeFilter !== 'pending-approval' ? ` (${pendingCount})` : ''}
          </button>
          <button className={`filter-tab ${activeFilter === 'activity' ? 'active' : ''}`} onClick={() => setActiveFilter('activity')}>
            Activity Log
          </button>
        </div>

        <div className="tasks-table-container">
          {activeFilter === 'activity' ? (
            <CompletedFieldJobsLog
              key="activity-log"
              tasks={tasks}
              variant="admin"
              taskTypeLabel={taskTypeLabel}
              formatDate={formatDate}
              formatFieldDates={formatFieldDates}
              getStatusLabel={getStatusLabel}
              renderAdminActions={getTaskActions}
            />
          ) : (
            <>
              {activeFilter === 'pending-approval' && (
                <div className="bulk-approve-bar bulk-approve-bar--prominent">
                  <div className="bulk-approve-meta">
                    {tasks.length === 0
                      ? 'No reports waiting for approval'
                      : <><strong>{selectedTaskIds.size}</strong> of <strong>{tasks.length}</strong> selected</>}
                  </div>
                  <div className="bulk-approve-actions">
                    {tasks.length > 0 && selectedTaskIds.size < tasks.length && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const allIds = tasks
                            .filter(t => t.status === 'READY_FOR_REVIEW')
                            .map(t => toPositiveTaskId(t.id))
                            .filter((id): id is number => id != null);
                          setSelectedTaskIds(new Set(allIds));
                        }}
                      >
                        Select all
                      </button>
                    )}
                    {selectedTaskIds.size > 0 && (
                      <button type="button" className="btn-secondary" onClick={() => setSelectedTaskIds(new Set())}>
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary bulk-approve-button"
                      disabled={selectedTaskIds.size === 0 || isBulkApproving}
                      onClick={handleBulkApproveClick}
                    >
                      {isBulkApproving ? 'Approving...' : `Approve selected (${selectedTaskIds.size})`}
                    </button>
                  </div>
                </div>
              )}

              {activeFilter === 'board' && (
                <div className="bulk-approve-bar">
                  <div className="bulk-approve-meta">
                    Selected: <strong>{selectedTaskIds.size}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-primary bulk-approve-button"
                    disabled={selectedTaskIds.size === 0 || isBulkApproving}
                    onClick={handleBulkApproveClick}
                  >
                    {isBulkApproving ? 'Approving...' : 'Approve selected'}
                  </button>
                </div>
              )}

              {tasks.length === 0 ? (
                <div className="empty-state">
                  <p>
                    {activeFilter === 'pending-approval'
                      ? 'No reports waiting for approval.'
                      : 'No tasks found.'}
                  </p>
                </div>
              ) : (
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th className="select-col">Select</th>
                      <th>Project</th>
                      <th>Technician</th>
                      <th>Task</th>
                      <th>Field Dates</th>
                      <th>Status</th>
                      <th>PM Review</th>
                      <th>Report Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeFilter === 'board' && boardGroups.length > 0
                      ? boardGroups.map(group => (
                          <React.Fragment key={group.label}>
                            <tr className={`board-section-header board-section-${group.label.toLowerCase()}`}>
                              <td colSpan={9}>
                                <span className="board-section-label">{group.label}</span>
                                <span className="board-section-count">{group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}</span>
                              </td>
                            </tr>
                            {group.tasks.map(task => renderTaskRow(task))}
                          </React.Fragment>
                        ))
                      : tasks.map(task => renderTaskRow(task))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <RejectTaskModal
        isOpen={rejectModalTask !== null}
        contextLine={rejectModalTask ? `${rejectModalTask.projectNumber ?? '—'} · ${taskTypeLabel(rejectModalTask)}` : undefined}
        onClose={() => setRejectModalTask(null)}
        onSubmit={async (payload) => {
          if (!rejectModalTask) return;
          await tasksAPI.reject(rejectModalTask.id, payload);
          loadData();
        }}
      />

      <UnapproveTaskModal
        isOpen={unapproveTask !== null}
        contextLine={unapproveTask ? `${unapproveTask.projectNumber ?? '—'} · ${taskTypeLabel(unapproveTask)}` : undefined}
        alreadySentToClient={unapproveAlreadySent}
        onClose={() => { setUnapproveTask(null); setUnapproveAlreadySent(false); }}
        onSubmit={async (payload) => {
          if (!unapproveTask) return;
          await tasksAPI.unapprove(unapproveTask.id, payload);
          setUnapproveTask(null);
          setUnapproveAlreadySent(false);
          setNotice({ variant: 'success', message: 'The report has been unapproved and is back in review.' });
          await loadData();
        }}
      />

      {approveConfirm && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-confirm-title"
          onClick={() => { if (!isBulkApproving && !approveModalBusy) setApproveConfirm(null); }}
        >
          <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
            <h2 id="approve-confirm-title" className="modal-title">Confirm approval</h2>
            <p className="modal-confirm-body">
              {approveConfirm.mode === 'single' ? (
                <>This will mark the report as <strong>approved</strong>. The assigned technician will be notified. Continue?</>
              ) : (
                <>You are about to approve <strong>{approveConfirm.count}</strong> report{approveConfirm.count === 1 ? '' : 's'} that are ready for review. Assigned technicians will be notified where applicable. Continue?</>
              )}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setApproveConfirm(null)}
                disabled={isBulkApproving || approveModalBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isBulkApproving || approveModalBusy}
                onClick={() => {
                  if (approveConfirm.mode === 'single') void runApproveSingle(approveConfirm.taskId);
                  else void runBulkApprove();
                }}
              >
                {approveConfirm.mode === 'bulk' && isBulkApproving
                  ? 'Approving...'
                  : approveConfirm.mode === 'single' && approveModalBusy
                    ? 'Approving...'
                    : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksDashboard;
