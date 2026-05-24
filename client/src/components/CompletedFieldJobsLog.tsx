import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task } from '../api/tasks';
import './CompletedFieldJobsLog.css';

interface MonthGroup {
  monthKey: string;
  label: string;
  tasks: Task[];
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
}

function bucketTask(task: Task): { year: number; monthKey: string; monthLabel: string } | null {
  const raw = task.fieldCompletedAt ?? task.updatedAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { year, monthKey, monthLabel };
}

function groupTasksByYearMonth(tasks: Task[]): YearGroup[] {
  const withBucket = tasks
    .map((t) => ({ task: t, bucket: bucketTask(t) }))
    .filter((x): x is { task: Task; bucket: NonNullable<ReturnType<typeof bucketTask>> } => x.bucket != null);

  withBucket.sort((a, b) => {
    const ta = new Date((a.task.fieldCompletedAt ?? a.task.updatedAt)!).getTime();
    const tb = new Date((b.task.fieldCompletedAt ?? b.task.updatedAt)!).getTime();
    return tb - ta;
  });

  const yearMap = new Map<number, Map<string, Task[]>>();
  for (const { task, bucket } of withBucket) {
    if (!yearMap.has(bucket.year)) yearMap.set(bucket.year, new Map());
    const mMap = yearMap.get(bucket.year)!;
    if (!mMap.has(bucket.monthKey)) mMap.set(bucket.monthKey, []);
    mMap.get(bucket.monthKey)!.push(task);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => b - a);
  return years.map((year) => {
    const mMap = yearMap.get(year)!;
    const monthKeys = Array.from(mMap.keys()).sort((a, b) => b.localeCompare(a));
    const months: MonthGroup[] = monthKeys.map((monthKey) => {
      const first = mMap.get(monthKey)![0];
      const d = new Date(first.fieldCompletedAt!);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { monthKey, label, tasks: mMap.get(monthKey)! };
    });
    return { year, months };
  });
}

export interface CompletedFieldJobsLogProps {
  tasks: Task[];
  variant: 'admin' | 'technician';
  taskTypeLabel: (task: Task) => string;
  formatDate: (dateString?: string) => string;
  formatFieldDates: (task: Task) => string;
  getStatusLabel: (status: string) => string;
  /** Admin/PM row actions (approve, edit, etc.) */
  renderAdminActions?: (task: Task) => React.ReactNode;
  /** Technician: open task detail modal */
  onTechnicianTaskDetail?: (task: Task) => void;
  /** Technician: navigate to report / workflow */
  onTechnicianOpenTask?: (task: Task) => void;
}

function formatCompletedAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

const CompletedFieldJobsLog: React.FC<CompletedFieldJobsLogProps> = ({
  tasks,
  variant,
  taskTypeLabel,
  formatDate,
  formatFieldDates,
  getStatusLabel,
  renderAdminActions,
  onTechnicianTaskDetail,
  onTechnicianOpenTask
}) => {
  const grouped = useMemo(() => groupTasksByYearMonth(tasks), [tasks]);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const defaultsApplied = useRef(false);

  useEffect(() => {
    if (defaultsApplied.current || grouped.length === 0) return;
    defaultsApplied.current = true;
    const firstYear = grouped[0].year;
    const firstMonth = grouped[0].months[0]?.monthKey;
    setExpandedYears(new Set([String(firstYear)]));
    if (firstMonth) setExpandedMonths(new Set([firstMonth]));
  }, [grouped]);

  const toggleYear = (year: number) => {
    const key = String(year);
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  if (grouped.length === 0) {
    return (
      <div className="empty-state">
        <p>No completed field jobs on record yet.</p>
        <p style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
          When technicians mark field work complete, those jobs appear here, grouped by when they were completed.
        </p>
      </div>
    );
  }

  const totalJobs = tasks.filter((t) => t.fieldCompletedAt ?? t.updatedAt).length;

  return (
    <div className="completed-jobs-log">
      <p className="completed-jobs-intro">
        Completed jobs ({totalJobs} {totalJobs === 1 ? 'entry' : 'entries'}) — field work marked complete or report approved. Expand a year, then a month, to see details.
      </p>
      {grouped.map(({ year, months }) => {
        const yearOpen = expandedYears.has(String(year));
        const yearCount = months.reduce((n, m) => n + m.tasks.length, 0);
        return (
          <div key={year} className="completed-jobs-year">
            <button
              type="button"
              className="completed-jobs-year-toggle"
              onClick={() => toggleYear(year)}
              aria-expanded={yearOpen}
            >
              <span>
                <span className={`completed-jobs-chevron${yearOpen ? ' is-open' : ''}`} aria-hidden>
                  ▶
                </span>
                {year}
              </span>
              <span className="completed-jobs-count">{yearCount} completed</span>
            </button>
            {yearOpen && (
              <div className="completed-jobs-year-body">
                {months.map(({ monthKey, label, tasks: monthTasks }) => {
                  const monthOpen = expandedMonths.has(monthKey);
                  return (
                    <div key={monthKey} className="completed-jobs-month">
                      <button
                        type="button"
                        className="completed-jobs-month-toggle"
                        onClick={() => toggleMonth(monthKey)}
                        aria-expanded={monthOpen}
                      >
                        <span>
                          <span className={`completed-jobs-chevron${monthOpen ? ' is-open' : ''}`} aria-hidden>
                            ▶
                          </span>
                          {label}
                        </span>
                        <span className="completed-jobs-count">
                          {monthTasks.length} {monthTasks.length === 1 ? 'job' : 'jobs'}
                        </span>
                      </button>
                      {monthOpen && (
                        <div className="completed-jobs-month-body">
                          <div className="completed-jobs-table-wrap">
                            <table className="completed-jobs-table">
                              <thead>
                                <tr>
                                  <th>Project</th>
                                  {variant === 'admin' && <th>Technician</th>}
                                  <th>Task</th>
                                  <th>Completed</th>
                                  <th>Field dates</th>
                                  <th>Report due</th>
                                  <th>Report status</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {monthTasks.map((task) => (
                                  <tr key={task.id}>
                                    <td>
                                      <strong>{task.projectNumber || '—'}</strong>
                                      {task.projectName ? (
                                        <div style={{ fontSize: 12, color: '#666' }}>{task.projectName}</div>
                                      ) : null}
                                    </td>
                                    {variant === 'admin' && (
                                      <td>{task.assignedTechnicianName || task.assignedTechnicianEmail || '—'}</td>
                                    )}
                                    <td>{taskTypeLabel(task)}</td>
                                    <td>{formatCompletedAt(task.fieldCompletedAt ?? task.updatedAt)}</td>
                                    <td>{formatFieldDates(task)}</td>
                                    <td>{formatDate(task.dueDate)}</td>
                                    <td>
                                      {getStatusLabel(
                                        String(
                                          task.status ??
                                            (task as Task & { task_status?: string }).task_status ??
                                            ''
                                        )
                                      )}
                                    </td>
                                    <td>
                                      {variant === 'admin' && renderAdminActions ? (
                                        <div className="completed-jobs-actions">{renderAdminActions(task)}</div>
                                      ) : variant === 'technician' ? (
                                        <div className="completed-jobs-actions">
                                          {onTechnicianTaskDetail && (
                                            <button
                                              type="button"
                                              className="task-detail-button"
                                              onClick={() => onTechnicianTaskDetail(task)}
                                            >
                                              Task Detail
                                            </button>
                                          )}
                                          {onTechnicianOpenTask && (
                                            <button
                                              type="button"
                                              className="details-button"
                                              onClick={() => onTechnicianOpenTask(task)}
                                            >
                                              View
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CompletedFieldJobsLog;
