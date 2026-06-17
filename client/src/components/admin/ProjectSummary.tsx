import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { summaryAPI, ProjectSummaryData, CylinderScheduleRow } from '../../api/summary';
import { projectsAPI, Project } from '../../api/projects';
import LoadingSpinner from '../LoadingSpinner';
import './ProjectSummary.css';

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return d;
}

interface PourSet {
  taskId: number;
  pourDate: string | null;
  structure: string | null;
  sampleLocation: string | null;
  specStrength: number | null;
  specStrengthDays: number;
  sevenDayBreaks: CylinderScheduleRow[];
  complianceBreaks: CylinderScheduleRow[];
  otherBreaks: CylinderScheduleRow[];
}

function buildPourSets(rows: CylinderScheduleRow[]): PourSet[] {
  const map = new Map<number, PourSet>();
  for (const row of rows) {
    if (!map.has(row.taskId)) {
      map.set(row.taskId, {
        taskId: row.taskId,
        pourDate: row.pourDate,
        structure: row.structure,
        sampleLocation: row.sampleLocation,
        specStrength: row.specStrength,
        specStrengthDays: row.specStrengthDays,
        sevenDayBreaks: [],
        complianceBreaks: [],
        otherBreaks: []
      });
    }
    const set = map.get(row.taskId)!;
    if (row.ageDays === 7 && !row.isComplianceBreak) {
      set.sevenDayBreaks.push(row);
    } else if (row.isComplianceBreak) {
      set.complianceBreaks.push(row);
    } else {
      set.otherBreaks.push(row);
    }
  }
  return Array.from(map.values());
}

const ProjectSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [summary, setSummary] = useState<ProjectSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const projectId = parseInt(id || '', 10);
    if (isNaN(projectId)) {
      setError('Invalid project ID');
      setLoading(false);
      return;
    }
    Promise.all([
      projectsAPI.get(projectId),
      summaryAPI.getProjectSummary(projectId)
    ])
      .then(([proj, summ]) => {
        setProject(proj);
        setSummary(summ);
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message || 'Failed to load summary');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner fullScreen message="Loading project summary..." />;
  if (error) return (
    <div className="ps-container">
      <div className="ps-header">
        <div>
          <h1>Project Summary</h1>
        </div>
        <button className="ps-back-btn" onClick={() => navigate(-1)}>← Back</button>
      </div>
      <div style={{ padding: 32, color: '#dc2626' }}>Error: {error}</div>
    </div>
  );
  if (!summary) return null;

  const { densityLog, proctorIndex, cylinderSchedule } = summary;
  const pourSets = buildPourSets(cylinderSchedule);

  return (
    <div className="ps-container">
      <div className="ps-header">
        <div>
          <h1>Project Summary</h1>
          {project && (
            <p className="ps-header-sub">
              {project.projectNumber} — {project.projectName}
            </p>
          )}
        </div>
        <button className="ps-back-btn" onClick={() => navigate(`/admin/projects/${id}/details`)}>
          ← Back to Project
        </button>
      </div>

      <div className="ps-content">

        {/* ── Compaction Log ────────────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Compaction Log <span>({densityLog.length} tests)</span></h2>
          </div>
          <div className="ps-table-wrap">
            {densityLog.length === 0 ? (
              <div className="ps-empty">No approved density tests found for this project.</div>
            ) : (
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Structure</th>
                    <th>Location</th>
                    <th>Depth/Lift</th>
                    <th>Dry Density (pcf)</th>
                    <th>Moisture (%)</th>
                    <th>Proctor #</th>
                    <th>% Compaction</th>
                    <th>Spec %</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {densityLog.map((row, i) => (
                    <tr key={i}>
                      <td>{fmtDate(row.reportDate)}</td>
                      <td>{row.structure || '—'}</td>
                      <td>{row.testLocation || '—'}</td>
                      <td>{row.depthLiftValue || '—'}</td>
                      <td>{fmt(row.dryDensity)}</td>
                      <td>
                        {fmt(row.fieldMoisture)}
                        {(row.moistSpecMin != null || row.moistSpecMax != null) && (
                          <span className="ps-moisture-spec">
                            ({row.moistSpecMin ?? '—'}–{row.moistSpecMax ?? '—'})
                          </span>
                        )}
                      </td>
                      <td>{row.proctorNo ?? '—'}</td>
                      <td>{fmt(row.pctCompaction)}%</td>
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

        {/* ── Proctor Index ──────────────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Proctor Index <span>({proctorIndex.length} proctor{proctorIndex.length !== 1 ? 's' : ''})</span></h2>
          </div>
          <div className="ps-table-wrap">
            {proctorIndex.length === 0 ? (
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
                  {proctorIndex.map((row, i) => (
                    <tr key={i}>
                      <td>{row.proctorNo ?? '—'}</td>
                      <td>{row.soilClassification || '—'}</td>
                      <td>{fmt(row.maxDryDensityPcf)}</td>
                      <td>{fmt(row.optMoisturePct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Cylinder Break Schedule ────────────────────────────────────── */}
        <div className="ps-section">
          <div className="ps-section-header">
            <h2>Cylinder Break Schedule <span>({pourSets.length} set{pourSets.length !== 1 ? 's' : ''})</span></h2>
          </div>
          <div className="ps-table-wrap">
            {pourSets.length === 0 ? (
              <div className="ps-empty">No approved compressive strength tests found for this project.</div>
            ) : (
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Pour Date</th>
                    <th>Structure</th>
                    <th>Location</th>
                    <th>Spec Strength (psi)</th>
                    <th>7-Day Break (psi)</th>
                    <th>Compliance Break (psi)</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {pourSets.map((set, i) => {
                    const sevenDay = set.sevenDayBreaks.map(r => r.breakStrength).filter(v => v != null) as number[];
                    const compliance = set.complianceBreaks.map(r => r.breakStrength).filter(v => v != null) as number[];
                    const anyBelowSpec = set.complianceBreaks.some(r => r.belowSpec === true);
                    const allMeetSpec = set.complianceBreaks.length > 0 && set.complianceBreaks.every(r => r.belowSpec === false);
                    const compliancePending = set.complianceBreaks.length === 0;

                    const sevenDayStr = sevenDay.length > 0
                      ? sevenDay.map(v => v.toFixed(0)).join(' / ')
                      : (set.sevenDayBreaks.length > 0 ? 'Pending' : '—');

                    const complianceStr = compliance.length > 0
                      ? `${compliance.map(v => v.toFixed(0)).join(' / ')} (${set.specStrengthDays}-day)`
                      : (compliancePending ? 'Pending' : '—');

                    return (
                      <tr key={i}>
                        <td>{fmtDate(set.pourDate)}</td>
                        <td>{set.structure || '—'}</td>
                        <td>{set.sampleLocation || '—'}</td>
                        <td>{set.specStrength != null ? set.specStrength.toFixed(0) : '—'}</td>
                        <td>
                          <span style={{ color: '#6b7280', fontSize: 12 }}>
                            {sevenDayStr}
                          </span>
                          {sevenDay.length > 0 && (
                            <span className="ps-chip ps-chip-info" style={{ marginLeft: 6 }}>
                              7-day
                            </span>
                          )}
                        </td>
                        <td>{complianceStr}</td>
                        <td>
                          {compliancePending && (
                            <span className="ps-chip ps-chip-pending">Pending</span>
                          )}
                          {!compliancePending && anyBelowSpec && (
                            <span className="ps-chip ps-chip-below">Below Spec</span>
                          )}
                          {!compliancePending && !anyBelowSpec && allMeetSpec && (
                            <span className="ps-chip ps-chip-meets">Meets Spec</span>
                          )}
                          {!compliancePending && !anyBelowSpec && !allMeetSpec && (
                            <span className="ps-chip ps-chip-pending">—</span>
                          )}
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
    </div>
  );
};

export default ProjectSummary;
