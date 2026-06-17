import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { summaryAPI, ProjectSummaryData, DensityLogRow, CylinderScheduleRow } from '../../api/summary';
import { projectsAPI, Project } from '../../api/projects';
import LoadingSpinner from '../LoadingSpinner';
import './ProjectSummary.css';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return d;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort() as T[];
}

// ── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';
interface SortState { field: string; dir: SortDir; }

function sortedRows<T>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => {
    const av = String((a as Record<string, unknown>)[sort.field] ?? '');
    const bv = String((b as Record<string, unknown>)[sort.field] ?? '');
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function SortTh({ label, field, sort, onSort, className = '' }: {
  label: string; field: string; sort: SortState; onSort: (f: string) => void; className?: string;
}) {
  const active = sort.field === field;
  return (
    <th
      className={`sortable${active ? ' sort-active' : ''}${className ? ' ' + className : ''}`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ps-sort-icon">{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  );
}

// ── Cylinder pour-set grouping ────────────────────────────────────────────────

interface PourSet {
  taskId: number;
  workorderNumber: string | null;
  pourDate: string | null;
  structure: string | null;
  sampleLocation: string | null;
  specStrength: number | null;
  specStrengthDays: number;
  sevenDayBreaks: CylinderScheduleRow[];
  complianceBreaks: CylinderScheduleRow[];
}

function buildPourSets(rows: CylinderScheduleRow[]): PourSet[] {
  const map = new Map<number, PourSet>();
  for (const row of rows) {
    if (!map.has(row.taskId)) {
      map.set(row.taskId, {
        taskId: row.taskId,
        workorderNumber: row.workorderNumber,
        pourDate: row.pourDate,
        structure: row.structure,
        sampleLocation: row.sampleLocation,
        specStrength: row.specStrength,
        specStrengthDays: row.specStrengthDays,
        sevenDayBreaks: [],
        complianceBreaks: []
      });
    }
    const set = map.get(row.taskId)!;
    if (row.isComplianceBreak) {
      set.complianceBreaks.push(row);
    } else if (row.ageDays === 7) {
      set.sevenDayBreaks.push(row);
    }
  }
  return Array.from(map.values());
}

// ── Density filter types ──────────────────────────────────────────────────────

interface DensityFilter {
  dateFrom: string;
  dateTo: string;
  structure: string;
  result: 'all' | 'pass' | 'fail' | 'ungraded';
  proctorNo: string;
  workorder: string;
}

const defaultDensityFilter: DensityFilter = {
  dateFrom: '', dateTo: '', structure: '', result: 'all', proctorNo: '', workorder: ''
};

function filterDensity(rows: DensityLogRow[], f: DensityFilter): DensityLogRow[] {
  return rows.filter(r => {
    if (f.dateFrom && (r.reportDate || '') < f.dateFrom) return false;
    if (f.dateTo && (r.reportDate || '') > f.dateTo) return false;
    if (f.structure && r.structure !== f.structure) return false;
    if (f.workorder && r.workorderNumber !== f.workorder) return false;
    if (f.proctorNo && String(r.proctorNo ?? '') !== f.proctorNo) return false;
    if (f.result === 'pass' && r.pass !== true) return false;
    if (f.result === 'fail' && r.pass !== false) return false;
    if (f.result === 'ungraded' && r.pass !== null) return false;
    return true;
  });
}

// ── Cylinder filter types ─────────────────────────────────────────────────────

interface CylFilter {
  dateFrom: string;
  dateTo: string;
  structure: string;
  result: 'all' | 'pending' | 'below' | 'meets';
  workorder: string;
}

const defaultCylFilter: CylFilter = {
  dateFrom: '', dateTo: '', structure: '', result: 'all', workorder: ''
};

function pourSetResult(set: PourSet): 'pending' | 'below' | 'meets' {
  if (set.complianceBreaks.length === 0) return 'pending';
  if (set.complianceBreaks.some(r => r.belowSpec === true)) return 'below';
  if (set.complianceBreaks.every(r => r.belowSpec === false)) return 'meets';
  return 'pending';
}

function filterCylinders(sets: PourSet[], f: CylFilter): PourSet[] {
  return sets.filter(s => {
    if (f.dateFrom && (s.pourDate || '') < f.dateFrom) return false;
    if (f.dateTo && (s.pourDate || '') > f.dateTo) return false;
    if (f.structure && s.structure !== f.structure) return false;
    if (f.workorder && s.workorderNumber !== f.workorder) return false;
    if (f.result !== 'all' && pourSetResult(s) !== f.result) return false;
    return true;
  });
}

function sortPourSets(sets: PourSet[], sort: SortState): PourSet[] {
  return [...sets].sort((a, b) => {
    const av = String((a as unknown as Record<string, unknown>)[sort.field] ?? '');
    const bv = String((b as unknown as Record<string, unknown>)[sort.field] ?? '');
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

// ── Main component ────────────────────────────────────────────────────────────

const ProjectSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [densityFilter, setDensityFilter] = useState<DensityFilter>(defaultDensityFilter);
  const [densitySort, setDensitySort] = useState<SortState>({ field: 'reportDate', dir: 'asc' });

  const [cylFilter, setCylFilter] = useState<CylFilter>(defaultCylFilter);
  const [cylSort, setCylSort] = useState<SortState>({ field: 'pourDate', dir: 'asc' });

  useEffect(() => {
    const projectId = parseInt(id || '', 10);
    if (isNaN(projectId)) { setError('Invalid project ID'); setLoading(false); return; }
    Promise.all([projectsAPI.get(projectId), summaryAPI.getProjectSummary(projectId)])
      .then(([proj, summ]) => { setProject(proj); setSummary(summ); })
      .catch(err => setError(err.response?.data?.error || err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Computed data ─────────────────────────────────────────────────────────

  const allDensity = summary?.densityLog ?? [];
  const allProctors = summary?.proctorIndex ?? [];
  const allCylRows = summary?.cylinderSchedule ?? [];
  const allPourSets = useMemo(() => buildPourSets(allCylRows), [allCylRows]);

  const filteredDensity = useMemo(() => filterDensity(allDensity, densityFilter), [allDensity, densityFilter]);
  const displayDensity = useMemo(() => sortedRows(filteredDensity, densitySort), [filteredDensity, densitySort]);

  const filteredPourSets = useMemo(() => filterCylinders(allPourSets, cylFilter), [allPourSets, cylFilter]);
  const displayPourSets = useMemo(() => sortPourSets(filteredPourSets, cylSort), [filteredPourSets, cylSort]);

  // ── Dropdown options ──────────────────────────────────────────────────────

  const densityStructures = useMemo(() => unique(allDensity.map(r => r.structure).filter(Boolean) as string[]), [allDensity]);
  const densityWorkorders = useMemo(() => unique(allDensity.map(r => r.workorderNumber).filter(Boolean) as string[]), [allDensity]);
  const densityProctorNos = useMemo(() => unique(allDensity.map(r => String(r.proctorNo ?? '')).filter(Boolean)), [allDensity]);
  const cylStructures = useMemo(() => unique(allPourSets.map(s => s.structure).filter(Boolean) as string[]), [allPourSets]);
  const cylWorkorders = useMemo(() => unique(allPourSets.map(s => s.workorderNumber).filter(Boolean) as string[]), [allPourSets]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const dPass = allDensity.filter(r => r.pass === true).length;
  const dFail = allDensity.filter(r => r.pass === false).length;
  const cylBelow = allPourSets.filter(s => pourSetResult(s) === 'below').length;
  const cylPending = allPourSets.filter(s => pourSetResult(s) === 'pending').length;

  // ── Sort toggle ───────────────────────────────────────────────────────────

  function toggleDensitySort(field: string) {
    setDensitySort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });
  }

  function toggleCylSort(field: string) {
    setCylSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) return <LoadingSpinner fullScreen message="Loading project summary..." />;

  if (error) return (
    <div className="ps-container">
      <div className="ps-header">
        <div className="ps-header-info"><h1>Project Summary</h1></div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-back" onClick={() => navigate(-1)}>← Back</button>
        </div>
      </div>
      <div style={{ padding: 32, color: '#dc2626' }}>Error: {error}</div>
    </div>
  );

  if (!summary) return null;

  const generatedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="ps-container">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="ps-header">
        <div className="ps-header-info">
          <h1>Project Summary</h1>
          {project && <p>{project.projectNumber} — {project.projectName}{project.clientName ? ` · ${project.clientName}` : ''}</p>}
        </div>
        <div className="ps-header-actions">
          <button className="ps-btn ps-btn-print" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="ps-btn ps-btn-back" onClick={() => navigate(`/admin/projects/${id}/details`)}>← Back</button>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <div className="ps-stats-bar">
        <div className="ps-stat-card">
          <span className="ps-stat-label">Density Tests</span>
          <span className="ps-stat-value">{allDensity.length}</span>
          <span className="ps-stat-sub">approved reports</span>
        </div>
        <div className={`ps-stat-card${dPass > 0 ? ' ps-stat-pass' : ''}`}>
          <span className="ps-stat-label">Passing</span>
          <span className="ps-stat-value">{dPass}</span>
          <span className="ps-stat-sub">{allDensity.length > 0 ? `${((dPass / allDensity.length) * 100).toFixed(0)}%` : '—'}</span>
        </div>
        <div className={`ps-stat-card${dFail > 0 ? ' ps-stat-fail' : ''}`}>
          <span className="ps-stat-label">Failing</span>
          <span className="ps-stat-value">{dFail}</span>
          <span className="ps-stat-sub">{allDensity.length > 0 ? `${((dFail / allDensity.length) * 100).toFixed(0)}%` : '—'}</span>
        </div>
        <div style={{ width: 1, background: '#e0e0e0', margin: '4px 4px' }} />
        <div className="ps-stat-card">
          <span className="ps-stat-label">Cylinder Sets</span>
          <span className="ps-stat-value">{allPourSets.length}</span>
          <span className="ps-stat-sub">pour sets</span>
        </div>
        {cylBelow > 0 && (
          <div className="ps-stat-card ps-stat-below">
            <span className="ps-stat-label">Below Spec</span>
            <span className="ps-stat-value">{cylBelow}</span>
            <span className="ps-stat-sub">sets flagged</span>
          </div>
        )}
        {cylPending > 0 && (
          <div className="ps-stat-card">
            <span className="ps-stat-label">Pending Break</span>
            <span className="ps-stat-value">{cylPending}</span>
            <span className="ps-stat-sub">awaiting results</span>
          </div>
        )}
        <div style={{ width: 1, background: '#e0e0e0', margin: '4px 4px' }} />
        <div className="ps-stat-card">
          <span className="ps-stat-label">Proctors</span>
          <span className="ps-stat-value">{allProctors.length}</span>
          <span className="ps-stat-sub">reference standards</span>
        </div>
      </div>

      <div className="ps-content">

        {/* ── Compaction Log ─────────────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Compaction Log <span>({filteredDensity.length} of {allDensity.length} tests)</span></h2>
          </div>

          {/* Filter bar */}
          <div className="ps-filter-bar">
            <label>From</label>
            <input type="date" value={densityFilter.dateFrom}
              onChange={e => setDensityFilter(f => ({ ...f, dateFrom: e.target.value }))} />
            <label>To</label>
            <input type="date" value={densityFilter.dateTo}
              onChange={e => setDensityFilter(f => ({ ...f, dateTo: e.target.value }))} />
            <div className="ps-filter-sep" />
            {densityStructures.length > 0 && <>
              <label>Structure</label>
              <select value={densityFilter.structure}
                onChange={e => setDensityFilter(f => ({ ...f, structure: e.target.value }))}>
                <option value="">All</option>
                {densityStructures.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>}
            {densityProctorNos.length > 0 && <>
              <label>Proctor #</label>
              <select value={densityFilter.proctorNo}
                onChange={e => setDensityFilter(f => ({ ...f, proctorNo: e.target.value }))}>
                <option value="">All</option>
                {densityProctorNos.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </>}
            {densityWorkorders.length > 0 && <>
              <label>Workorder</label>
              <select value={densityFilter.workorder}
                onChange={e => setDensityFilter(f => ({ ...f, workorder: e.target.value }))}>
                <option value="">All</option>
                {densityWorkorders.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </>}
            <div className="ps-filter-sep" />
            <label>Result</label>
            <select value={densityFilter.result}
              onChange={e => setDensityFilter(f => ({ ...f, result: e.target.value as DensityFilter['result'] }))}>
              <option value="all">All</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="ungraded">Ungraded</option>
            </select>
            {JSON.stringify(densityFilter) !== JSON.stringify(defaultDensityFilter) && (
              <button className="ps-filter-clear" onClick={() => setDensityFilter(defaultDensityFilter)}>
                Clear filters
              </button>
            )}
          </div>

          <div className="ps-table-wrap">
            {allDensity.length === 0 ? (
              <div className="ps-empty">No approved density tests found for this project.</div>
            ) : filteredDensity.length === 0 ? (
              <div className="ps-no-results">No tests match the current filters.</div>
            ) : (
              <table className="ps-table">
                <thead>
                  <tr>
                    <SortTh label="Date" field="reportDate" sort={densitySort} onSort={toggleDensitySort} />
                    {densityWorkorders.length > 0 && (
                      <SortTh label="Workorder" field="workorderNumber" sort={densitySort} onSort={toggleDensitySort} />
                    )}
                    <SortTh label="Structure" field="structure" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="Location" field="testLocation" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="Depth/Lift" field="depthLiftValue" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="Dry Density (pcf)" field="dryDensity" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="Moisture (%)" field="fieldMoisture" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="Proctor #" field="proctorNo" sort={densitySort} onSort={toggleDensitySort} />
                    <SortTh label="% Compaction" field="pctCompaction" sort={densitySort} onSort={toggleDensitySort} />
                    <th>Spec %</th>
                    <SortTh label="Result" field="pass" sort={densitySort} onSort={toggleDensitySort} />
                  </tr>
                </thead>
                <tbody>
                  {displayDensity.map((row, i) => (
                    <tr key={i} className={row.pass === false ? 'row-fail' : ''}>
                      <td>{fmtDate(row.reportDate)}</td>
                      {densityWorkorders.length > 0 && <td>{row.workorderNumber || '—'}</td>}
                      <td>{row.structure || '—'}</td>
                      <td>{row.testLocation || '—'}</td>
                      <td>{row.depthLiftValue || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{fmt(row.dryDensity)}</td>
                      <td>
                        {fmt(row.fieldMoisture)}
                        {(row.moistSpecMin != null || row.moistSpecMax != null) && (
                          <span className="ps-moisture-spec">
                            ({row.moistSpecMin ?? '?'}–{row.moistSpecMax ?? '?'})
                          </span>
                        )}
                      </td>
                      <td>{row.proctorNo ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>
                        {row.pctCompaction != null ? `${row.pctCompaction.toFixed(1)}%` : '—'}
                      </td>
                      <td>{row.specDensityPct != null ? `${row.specDensityPct}%` : '—'}</td>
                      <td>
                        {row.pass === true && <span className="ps-chip ps-chip-pass">Pass</span>}
                        {row.pass === false && <span className="ps-chip ps-chip-fail">Fail</span>}
                        {row.pass === null && <span className="ps-chip ps-chip-pending">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Proctor Index ───────────────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Proctor Index <span>({allProctors.length} proctor{allProctors.length !== 1 ? 's' : ''})</span></h2>
          </div>
          <div className="ps-table-wrap">
            {allProctors.length === 0 ? (
              <div className="ps-empty">No approved proctor tests found for this project.</div>
            ) : (
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Proctor #</th>
                    <th>Soil Classification</th>
                    <th>Max Dry Density (pcf)</th>
                    <th>Optimum Moisture (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {allProctors.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{row.proctorNo ?? '—'}</td>
                      <td>{row.soilClassification || '—'}</td>
                      <td>{fmt(row.maxDryDensityPcf)}</td>
                      <td>{fmt(row.optMoisturePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Cylinder Break Schedule ─────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Cylinder Break Schedule <span>({filteredPourSets.length} of {allPourSets.length} set{allPourSets.length !== 1 ? 's' : ''})</span></h2>
          </div>

          {/* Filter bar */}
          <div className="ps-filter-bar">
            <label>From</label>
            <input type="date" value={cylFilter.dateFrom}
              onChange={e => setCylFilter(f => ({ ...f, dateFrom: e.target.value }))} />
            <label>To</label>
            <input type="date" value={cylFilter.dateTo}
              onChange={e => setCylFilter(f => ({ ...f, dateTo: e.target.value }))} />
            <div className="ps-filter-sep" />
            {cylStructures.length > 0 && <>
              <label>Structure</label>
              <select value={cylFilter.structure}
                onChange={e => setCylFilter(f => ({ ...f, structure: e.target.value }))}>
                <option value="">All</option>
                {cylStructures.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>}
            {cylWorkorders.length > 0 && <>
              <label>Workorder</label>
              <select value={cylFilter.workorder}
                onChange={e => setCylFilter(f => ({ ...f, workorder: e.target.value }))}>
                <option value="">All</option>
                {cylWorkorders.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </>}
            <div className="ps-filter-sep" />
            <label>Result</label>
            <select value={cylFilter.result}
              onChange={e => setCylFilter(f => ({ ...f, result: e.target.value as CylFilter['result'] }))}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="below">Below Spec</option>
              <option value="meets">Meets Spec</option>
            </select>
            {JSON.stringify(cylFilter) !== JSON.stringify(defaultCylFilter) && (
              <button className="ps-filter-clear" onClick={() => setCylFilter(defaultCylFilter)}>
                Clear filters
              </button>
            )}
          </div>

          <div className="ps-table-wrap">
            {allPourSets.length === 0 ? (
              <div className="ps-empty">No approved compressive strength tests found for this project.</div>
            ) : filteredPourSets.length === 0 ? (
              <div className="ps-no-results">No sets match the current filters.</div>
            ) : (
              <table className="ps-table">
                <thead>
                  <tr>
                    <SortTh label="Pour Date" field="pourDate" sort={cylSort} onSort={toggleCylSort} />
                    {cylWorkorders.length > 0 && (
                      <SortTh label="Workorder" field="workorderNumber" sort={cylSort} onSort={toggleCylSort} />
                    )}
                    <SortTh label="Structure" field="structure" sort={cylSort} onSort={toggleCylSort} />
                    <SortTh label="Location" field="sampleLocation" sort={cylSort} onSort={toggleCylSort} />
                    <th>Spec (psi)</th>
                    <th>7-Day Break (psi)</th>
                    <th>Compliance Break (psi)</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPourSets.map((set, i) => {
                    const sevenStrengths = set.sevenDayBreaks.map(r => r.breakStrength).filter((v): v is number => v != null);
                    const compStrengths = set.complianceBreaks.map(r => r.breakStrength).filter((v): v is number => v != null);
                    const result = pourSetResult(set);

                    const sevenStr = sevenStrengths.length > 0
                      ? sevenStrengths.map(v => v.toFixed(0)).join(' / ')
                      : (set.sevenDayBreaks.length > 0 ? 'Pending' : '—');

                    const compStr = compStrengths.length > 0
                      ? `${compStrengths.map(v => v.toFixed(0)).join(' / ')} (${set.specStrengthDays}-day)`
                      : (set.complianceBreaks.length > 0 ? 'Pending' : '—');

                    return (
                      <tr key={i}>
                        <td>{fmtDate(set.pourDate)}</td>
                        {cylWorkorders.length > 0 && <td>{set.workorderNumber || '—'}</td>}
                        <td>{set.structure || '—'}</td>
                        <td>{set.sampleLocation || '—'}</td>
                        <td>{set.specStrength != null ? set.specStrength.toFixed(0) : '—'}</td>
                        <td style={{ color: '#6b7280' }}>{sevenStr}</td>
                        <td style={{ fontWeight: 500 }}>{compStr}</td>
                        <td>
                          {result === 'pending' && <span className="ps-chip ps-chip-pending">Pending</span>}
                          {result === 'below' && <span className="ps-chip ps-chip-below">Below Spec</span>}
                          {result === 'meets' && <span className="ps-chip ps-chip-meets">Meets Spec</span>}
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

      {/* Print-only footer */}
      <div className="ps-print-footer">
        Generated {generatedAt} · {project?.projectNumber} {project?.projectName}
      </div>

    </div>
  );
};

export default ProjectSummary;
