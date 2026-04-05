/**
 * Ensures a rebar_reports row exists for a REBAR task.
 * Mirrors ensureDensityReportRow: server-side PDF (bulk approve, auto-send) can run
 * when the client never persisted a row (auto-save failed, or only task status was updated).
 */

const db = require('../db');
const { supabase } = require('../db/supabase');

const DEFAULT_METHOD_OF_TEST = 'Applicable ACI Recommendations and ASTM Standards';

/**
 * First matching row only — avoids PostgREST .single() errors when duplicate task_id rows exist.
 * @param {number} taskId
 * @returns {Promise<object|null>}
 */
async function getFirstRebarReportRow(taskId) {
  const id = Number(taskId);
  if (!Number.isFinite(id) || id < 1) return null;
  const rows = await db.all('rebar_reports', { taskId: id }, { limit: 1 });
  return rows[0] || null;
}

/**
 * @param {number} taskId
 * @param {number|null} [fallbackTenantId] Used when task row has null tenant_id but caller knows tenant (e.g. bulk-approve JWT).
 * @returns {Promise<object|null>} CamelCase rebar_reports row, or null if task missing / wrong type
 */
async function ensureRebarReportRow(taskId, fallbackTenantId = null) {
  const id = Number(taskId);
  if (!Number.isFinite(id) || id < 1) return null;

  const existing = await getFirstRebarReportRow(id);
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
      .eq('task_type', 'REBAR')
      .single();

    if (error || !data) return null;

    projectClientName = data.projects?.client_name ?? '';
    defaultTechName = data.users?.name || '';
    task = {
      tenantId: data.tenant_id ?? data.tenantId,
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
         WHERE t.id = ? AND t.taskType = 'REBAR'`,
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
  const today = nowIso.split('T')[0];

  const rebarData = {
    taskId: id,
    clientName: projectClientName || null,
    reportDate: today,
    inspectionDate: today,
    generalContractor: null,
    methodOfTest: DEFAULT_METHOD_OF_TEST,
    resultRemarks: null,
    locationDetail: null,
    wireMeshSpec: null,
    drawings: null,
    technicianId: defaultTechId,
    techName: defaultTechName || null,
    updatedAt: nowIso
  };

  if (db.isSupabase()) {
    const fallback =
      fallbackTenantId != null && Number.isFinite(Number(fallbackTenantId))
        ? Number(fallbackTenantId)
        : null;
    const tid = task.tenantId ?? task.tenant_id ?? fallback;
    if (tid == null) {
      console.error('[ensureRebarReportRow] Task missing tenant_id; cannot insert rebar_reports');
      return null;
    }
    rebarData.tenantId = tid;
  }

  try {
    await db.insert('rebar_reports', rebarData);
  } catch (err) {
    const afterRace = await getFirstRebarReportRow(id);
    if (afterRace) return afterRace;
    console.error('[ensureRebarReportRow] Insert failed', id, err);
    return null;
  }

  return getFirstRebarReportRow(id);
}

module.exports = { ensureRebarReportRow, getFirstRebarReportRow };
