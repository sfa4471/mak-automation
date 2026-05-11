import React from 'react';
import { Project, normalizeSoilSpecRow, structureTypeDisplayLabel } from '../api/projects';
import './ProjectSpecsReadOnly.css';

function renderConcreteSpecs(project: Project | null) {
  if (!project?.concreteSpecs || Object.keys(project.concreteSpecs).length === 0) {
    return <p className="specs-empty">No concrete specifications available.</p>;
  }

  return (
    <div className="specs-table-container">
      <table className="specs-table">
        <thead>
          <tr>
            <th>Structure Type</th>
            <th>Strength (PSI)</th>
            <th>Ambient Temp (°F)</th>
            <th>Concrete Temp (°F)</th>
            <th>Slump</th>
            <th>Air Content</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(project.concreteSpecs).map(([structureType, spec]: [string, any]) => {
            const ambientTemp =
              spec.ambientTempF && spec.ambientTempF.trim() !== '' ? spec.ambientTempF : '35-95';
            const concreteTemp =
              spec.concreteTempF && spec.concreteTempF.trim() !== '' ? spec.concreteTempF : '45-95';

            return (
              <tr key={structureType}>
                <td className="spec-structure-type">
                  {structureTypeDisplayLabel(structureType, spec.otherDetails)}
                </td>
                <td>{spec.specStrengthPsi || 'N/A'}</td>
                <td>{ambientTemp}</td>
                <td>{concreteTemp}</td>
                <td>{spec.slump || 'N/A'}</td>
                <td>{spec.airContent || 'N/A'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderSoilSpecs(project: Project | null) {
  if (!project?.soilSpecs || Object.keys(project.soilSpecs).length === 0) {
    return <p className="specs-empty">No soil specifications available.</p>;
  }

  return (
    <div className="specs-table-container">
      <table className="specs-table">
        <thead>
          <tr>
            <th>Structure Type</th>
            <th>Density (%)</th>
            <th>Moisture Range</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(project.soilSpecs).map(([structureType, spec]) => {
            const normalized = normalizeSoilSpecRow(spec);
            const densityPcts = (normalized.densityPcts || []).filter(
              (p) => p != null && String(p).trim() !== ''
            );
            const moistureRanges = (normalized.moistureRanges || []).filter(
              (r) => r && (String(r.min || '').trim() !== '' || String(r.max || '').trim() !== '')
            );
            const densityDisplay = densityPcts.length > 0 ? densityPcts.join(', ') : 'N/A';
            const moistureParts = moistureRanges.map((r) => {
              if (r.min && r.max) return `${r.min}% - ${r.max}%`;
              if (r.min) return `≥ ${r.min}%`;
              if (r.max) return `≤ ${r.max}%`;
              return '';
            });
            const moistureDisplay =
              moistureParts.length > 0 ? moistureParts.filter(Boolean).join('; ') : 'N/A';
            return (
              <tr key={structureType}>
                <td className="spec-structure-type">
                  {structureTypeDisplayLabel(structureType, spec.otherDetails)}
                </td>
                <td>{densityDisplay}</td>
                <td>{moistureDisplay}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderProctorSpecs(project: Project | null) {
  const rows = project?.presetProctorRows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="specs-empty">No proctor specifications available.</p>;
  }
  const displayRows = rows.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const no = r.proctorNo != null && String(r.proctorNo).trim() !== '' && Number(r.proctorNo) > 0;
    const desc = String(r.description ?? '').trim() !== '';
    const opt = String(r.optMoisture ?? '').trim() !== '';
    const max = String(r.maxDensity ?? '').trim() !== '';
    return no || desc || opt || max;
  });
  if (displayRows.length === 0) {
    return <p className="specs-empty">No proctor specifications available.</p>;
  }

  return (
    <div className="specs-table-container">
      <table className="specs-table">
        <thead>
          <tr>
            <th>Proctor no.</th>
            <th>Description</th>
            <th>Opt. moisture (%)</th>
            <th>Max. dry density (pcf)</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => (
            <tr key={`${row.proctorNo ?? 'row'}-${index}`}>
              <td>{row.proctorNo != null && Number(row.proctorNo) > 0 ? row.proctorNo : '—'}</td>
              <td>{row.description?.trim() ? row.description : 'N/A'}</td>
              <td>{row.optMoisture?.trim() ? row.optMoisture : 'N/A'}</td>
              <td>{row.maxDensity?.trim() ? row.maxDensity : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ProjectSpecsReadOnlyProps {
  project: Project | null;
  loadingProject: boolean;
}

/**
 * Read-only concrete, soil, and preset proctor rows for a project (technician task detail, modal, etc.).
 */
const ProjectSpecsReadOnly: React.FC<ProjectSpecsReadOnlyProps> = ({ project, loadingProject }) => {
  if (loadingProject) {
    return <div className="specs-loading">Loading specifications...</div>;
  }

  return (
    <>
      <div className="specs-subsection">
        <h4>Concrete Specifications</h4>
        {renderConcreteSpecs(project)}
      </div>
      <div className="specs-subsection">
        <h4>Soil Specifications</h4>
        {renderSoilSpecs(project)}
      </div>
      <div className="specs-subsection">
        <h4>Proctor specifications</h4>
        {renderProctorSpecs(project)}
      </div>
    </>
  );
};

export default ProjectSpecsReadOnly;
