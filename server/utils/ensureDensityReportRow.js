/**
 * Ensures a density_reports row exists for a DENSITY_MEASUREMENT task.
 * Mirrors the default payload returned by GET /api/density/task/:id when no row exists,
 * so server-side PDF (approve / auto-send) can run even if the client never persisted
 * (e.g. auto-save failed or only task status was updated).
 */

const db = require('../db');
const { supabase } = require('../db/supabase');

function defaultTestRows() {
  return Array.from({ length: 19 }, (_, i) => ({
    testNo: i + 1,
    testLocation: '',
    depthLiftType: 'DEPTH',
    depthLiftValue: '',
    wetDensity: '',
    fieldMoisture: '',
    dryDensity: '',
    proctorNo: '',
    percentProctorDensity: ''
  }));
}

function defaultProctors() {
  return Array.from({ length: 6 }, (_, i) => ({
    proctorNo: i + 1,
    description: '',
    optMoisture: '',
    maxDensity: ''
  }));
}

/**
 * @param {number} taskId
 * @returns {Promise<object|null>} CamelCase density_reports row, or null if task missing / wrong type
 */
async function ensureDensityReportRow(taskId) {
  const id = Number(taskId);
  if (!Number.isFinite(id) || id < 1) return null;

  const existing = await db.get('density_reports', { taskId: id });
  if (existing) return existing;

  let task;
  let projectClientName = '';
  let defaultTechName = '';

  if (db.isSupabase()) {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        projects:project_id(project_name, project_number, client_name),
        users:assigned_technician_id(name)
      `)
      .eq('id', id)
      .eq('task_type', 'DENSITY_MEASUREMENT')
      .single();

    if (error || !data) return null;

    projectClientName = data.projects?.client_name ?? '';
    defaultTechName = data.users?.name || '';
    task = {
      tenantId: data.tenant_id,
      assignedTechnicianId: data.assigned_technician_id
    };
  } else {
    const sqliteDb = require('../database');
    task = await new Promise((resolve, reject) => {
      sqliteDb.get(
        `SELECT t.*, p.clientName AS projectClientName, u.name AS techName
         FROM tasks t
         INNER JOIN projects p ON t.projectId = p.id
         LEFT JOIN users u ON t.assignedTechnicianId = u.id
         WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
        [id],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });
    if (!task) return null;
    projectClientName = task.projectClientName || '';
    defaultTechName = task.techName || '';
  }

  const defaultTechId = task.assignedTechnicianId ?? task.assigned_technician_id ?? null;
  const nowIso = new Date().toISOString();

  const testRows = defaultTestRows();
  const proctors = defaultProctors();

  const densityData = {
    taskId: id,
    clientName: projectClientName || null,
    datePerformed: nowIso.split('T')[0],
    structure: '',
    structureType: '',
    testRows,
    proctors,
    densSpecPercent: null,
    moistSpecMin: null,
    moistSpecMax: null,
    densSpecs: [],
    moistSpecs: [],
    gaugeNo: null,
    stdDensityCount: null,
    stdMoistCount: null,
    transDepthIn: null,
    methodD2922: 1,
    methodD3017: 1,
    methodD698: 1,
    remarks: null,
    techName: defaultTechName || null,
    technicianId: defaultTechId,
    timeStr: null,
    specDensityPct: null,
    proctorTaskId: null,
    proctorOptMoisture: null,
    proctorMaxDensity: null,
    proctorSoilClassification: null,
    proctorSoilClassificationText: null,
    proctorDescriptionLabel: null,
    updatedAt: nowIso
  };

  if (db.isSupabase()) {
    const tid = task.tenantId ?? task.tenant_id;
    if (tid == null) {
      console.error('[ensureDensityReportRow] Task missing tenant_id; cannot insert density_reports');
      return null;
    }
    densityData.tenantId = tid;
  } else {
    densityData.testRows = JSON.stringify(testRows);
    densityData.proctors = JSON.stringify(proctors);
    delete densityData.densSpecs;
    delete densityData.moistSpecs;
  }

  try {
    await db.insert('density_reports', densityData);
  } catch (err) {
    const afterRace = await db.get('density_reports', { taskId: id });
    if (afterRace) return afterRace;
    console.error('[ensureDensityReportRow] Insert failed', id, err);
    return null;
  }

  return db.get('density_reports', { taskId: id });
}

module.exports = { ensureDensityReportRow };
