const express = require('express');
const db = require('../db');
const { supabase, isAvailable, keysToCamelCase } = require('../db/supabase');
const { authenticate, isStaffReviewer } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');

const router = express.Router();

function parsePresetProctorRows(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw || '[]');
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Supabase nested embeds use snake_case keys inside JSONB row objects; normalize for merge + API response. */
function presetRowsWithCamelKeys(rows) {
  return parsePresetProctorRows(rows)
    .filter((r) => r && typeof r === 'object')
    .map((r) => keysToCamelCase(r));
}

/** Fill empty density proctor cells from project-level preset rows (fill-if-empty only). */
function mergeProjectPresetIntoProctors(proctors, presetDeclared, presetRows) {
  if (!presetDeclared || !Array.isArray(proctors) || proctors.length === 0) return proctors;
  const rows = presetRowsWithCamelKeys(presetRows).filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const desc = String(r.description ?? '').trim();
    const opt = String(r.optMoisture ?? '').trim();
    const maxd = String(r.maxDensity ?? '').trim();
    const pNo = r.proctorNo != null && String(r.proctorNo).trim() !== '' ? parseInt(String(r.proctorNo), 10) : NaN;
    return (!isNaN(pNo) && pNo > 0) || desc !== '' || opt !== '' || maxd !== '';
  });
  if (rows.length === 0) return proctors;
  const out = proctors.map((r) => ({ ...r }));
  for (const pr of rows) {
    const pNoRaw = pr.proctorNo;
    const pNo = pNoRaw != null && String(pNoRaw).trim() !== '' ? parseInt(String(pNoRaw), 10) : NaN;
    let idx = -1;
    if (!isNaN(pNo) && pNo > 0) {
      idx = out.findIndex((r) => Number(r.proctorNo) === pNo);
    }
    if (idx < 0) {
      idx = out.findIndex((r) => {
        const d = String(r.description || '').trim();
        const o = String(r.optMoisture || '').trim();
        const m = String(r.maxDensity || '').trim();
        return d === '' && o === '' && m === '';
      });
    }
    if (idx < 0) continue;
    const cur = out[idx];
    const desc = String(pr.description ?? '').trim();
    const opt = pr.optMoisture != null ? String(pr.optMoisture).trim() : '';
    const maxd = pr.maxDensity != null ? String(pr.maxDensity).trim() : '';
    const nextNo = !isNaN(pNo) && pNo > 0 ? pNo : Number(cur.proctorNo) || idx + 1;
    out[idx] = {
      ...cur,
      proctorNo: nextNo,
      description: String(cur.description || '').trim() === '' ? desc : cur.description,
      optMoisture: String(cur.optMoisture || '').trim() === '' ? opt : cur.optMoisture,
      maxDensity: String(cur.maxDensity || '').trim() === '' ? maxd : cur.maxDensity,
    };
  }
  return out;
}

function projectPresetFlagsFromTask(task) {
  const declared = !!(task.preset_proctors_declared ?? task.presetProctorsDeclared);
  const rows = presetRowsWithCamelKeys(task.preset_proctor_rows ?? task.presetProctorRows);
  return { declared, rows };
}

// Get density report by taskId (tenant-scoped)
router.get('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number, concrete_specs, soil_specs, client_name, preset_proctors_declared, preset_proctor_rows)
        `)
        .eq('id', taskId)
        .eq('task_type', 'DENSITY_MEASUREMENT')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        concreteSpecs: keysToCamelCase(data.projects?.concrete_specs || {}),
        soilSpecs: keysToCamelCase(data.projects?.soil_specs || {}),
        projectClientName: data.projects?.client_name ?? null,
        presetProctorsDeclared: data.projects?.preset_proctors_declared ?? false,
        presetProctorRows: data.projects?.preset_proctor_rows ?? [],
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber, p.concreteSpecs, p.soilSpecs, p.clientName,
                  p.presetProctorsDeclared, p.presetProctorRows
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else if (row) {
              row.projectClientName = row.clientName ?? null;
              resolve(row);
            } else resolve(null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse project concreteSpecs for structure dropdown
    let projectConcreteSpecs = {};
    if (task.concreteSpecs) {
      if (typeof task.concreteSpecs === 'string') {
        try {
          projectConcreteSpecs = JSON.parse(task.concreteSpecs);
        } catch (e) {
          projectConcreteSpecs = {};
        }
      } else {
        projectConcreteSpecs = task.concreteSpecs;
      }
    }

    // Parse project soilSpecs for structure dropdown (structure types are keys in soilSpecs)
    let projectSoilSpecs = {};
    if (task.soilSpecs) {
      if (typeof task.soilSpecs === 'string') {
        try {
          projectSoilSpecs = JSON.parse(task.soilSpecs);
        } catch (e) {
          console.error('Error parsing soilSpecs JSON:', e);
          projectSoilSpecs = {};
        }
      } else {
        projectSoilSpecs = task.soilSpecs;
      }
    }
    
    // Debug: Log soil specs for density reports
    console.log('Density report GET - Soil Specs Debug:', {
      hasSoilSpecs: !!task.soilSpecs,
      soilSpecsType: typeof task.soilSpecs,
      soilSpecsRaw: task.soilSpecs,
      parsedSoilSpecs: projectSoilSpecs,
      soilSpecKeys: Object.keys(projectSoilSpecs),
      soilSpecKeysCount: Object.keys(projectSoilSpecs).length
    });

    const data = await db.get('density_reports', { taskId });

    if (data) {
      // Debug: Log what's being returned
      console.log('Density report GET - Header fields from DB:', {
        clientName: data.clientName,
        datePerformed: data.datePerformed,
        structure: data.structure,
        structureType: data.structureType
      });
      
      // Parse JSON fields
      if (typeof data.testRows === 'string') {
        try {
          data.testRows = JSON.parse(data.testRows || '[]');
        } catch (e) {
          data.testRows = [];
        }
      } else {
        data.testRows = data.testRows || [];
      }
      
      if (typeof data.proctors === 'string') {
        try {
          data.proctors = JSON.parse(data.proctors || '[]');
        } catch (e) {
          data.proctors = [];
        }
      } else {
        data.proctors = data.proctors || [];
      }

      if (typeof data.densSpecs === 'string') {
        try {
          data.densSpecs = JSON.parse(data.densSpecs || '[]');
        } catch (e) {
          data.densSpecs = [];
        }
      }
      if (typeof data.moistSpecs === 'string') {
        try {
          data.moistSpecs = JSON.parse(data.moistSpecs || '[]');
        } catch (e) {
          data.moistSpecs = [];
        }
      }
      
      // Add project info, concreteSpecs, and soilSpecs
      data.projectName = task.projectName;
      data.projectNumber = task.projectNumber;
      data.projectConcreteSpecs = projectConcreteSpecs;
      data.projectSoilSpecs = projectSoilSpecs;
      {
        const saved = data.clientName != null ? String(data.clientName).trim() : '';
        data.clientName = saved || (task.projectClientName || '');
      }
      
      // Debug: Verify what's being sent to frontend
      console.log('Density report GET - Sending to frontend:', {
        projectSoilSpecs: data.projectSoilSpecs,
        projectSoilSpecsKeys: Object.keys(data.projectSoilSpecs || {}),
        projectConcreteSpecs: data.projectConcreteSpecs,
        projectConcreteSpecsKeys: Object.keys(data.projectConcreteSpecs || {})
      });
      
      // If technicianId is missing but task has assigned technician, use that
      if (!data.technicianId && task.assignedTechnicianId) {
        data.technicianId = task.assignedTechnicianId;
      }
      
      // If techName is missing but technicianId exists, fetch technician name
      if (!data.techName && data.technicianId) {
        const tech = await db.get('users', { id: data.technicianId });
        if (tech) {
          data.techName = tech.name || tech.email || '';
        }
      }

      // Normalize array specs for client (dynamic columns): densSpecPercents, moistSpecRanges
      data.densSpecPercents = (Array.isArray(data.densSpecs) && data.densSpecs.length > 0)
        ? data.densSpecs
        : (data.densSpecPercent != null && String(data.densSpecPercent).trim() !== '' ? [String(data.densSpecPercent)] : []);
      data.moistSpecRanges = (Array.isArray(data.moistSpecs) && data.moistSpecs.length > 0)
        ? data.moistSpecs
        : (data.moistSpecMin != null || data.moistSpecMax != null
          ? [{ min: data.moistSpecMin || '', max: data.moistSpecMax || '' }]
          : []);

      const { declared: presetDeclared, rows: presetRows } = projectPresetFlagsFromTask(task);
      data.projectPresetProctorsDeclared = presetDeclared;
      data.projectPresetProctorRows = presetRows;
      data.proctors = mergeProjectPresetIntoProctors(data.proctors, presetDeclared, presetRows);
      
      res.json(data);
    } else {
      // Return empty structure with default technician from task assignment
      const defaultTechId = task.assignedTechnicianId || null;
      const defaultTechName = req.user.name || req.user.email || '';
      
      // Debug: Verify what's being sent for new reports
      console.log('Density report GET - New report, sending:', {
        projectSoilSpecs: projectSoilSpecs,
        projectSoilSpecsKeys: Object.keys(projectSoilSpecs),
        projectConcreteSpecs: projectConcreteSpecs,
        projectConcreteSpecsKeys: Object.keys(projectConcreteSpecs)
      });

      const { declared: presetDeclaredNew, rows: presetRowsNew } = projectPresetFlagsFromTask(task);

      // Determine initial row structure from proctor tasks so rows match real data
      let proctorTaskNos = [];
      try {
        const projectIdForProctors = task.project_id ?? task.projectId;
        if (projectIdForProctors && db.isSupabase()) {
          const { data: ptData } = await supabase
            .from('tasks')
            .select('proctor_no')
            .eq('project_id', projectIdForProctors)
            .eq('task_type', 'PROCTOR')
            .not('proctor_no', 'is', null)
            .order('proctor_no', { ascending: true });
          proctorTaskNos = (ptData || []).map(t => t.proctor_no).filter(n => n != null && n > 0);
        }
      } catch (_) { /* non-fatal — fall back to preset/default */ }

      const validPresetCount = presetRowsNew.filter(r => {
        const opt = String(r.optMoisture ?? r.opt_moisture ?? '').trim();
        const maxd = String(r.maxDensity ?? r.max_density ?? '').trim();
        return opt !== '' || maxd !== '';
      }).length;
      const rowNos = proctorTaskNos.length > 0
        ? proctorTaskNos
        : Array.from({ length: Math.max(validPresetCount, 1) }, (_, i) => i + 1);

      let defaultProctors = rowNos.map(no => ({
        proctorNo: no,
        description: '',
        optMoisture: '',
        maxDensity: ''
      }));
      defaultProctors = mergeProjectPresetIntoProctors(defaultProctors, presetDeclaredNew, presetRowsNew);
      
      res.json({
        taskId: parseInt(taskId),
        projectName: task.projectName,
        projectNumber: task.projectNumber,
        projectConcreteSpecs: projectConcreteSpecs,
        projectSoilSpecs: projectSoilSpecs,
        clientName: task.projectClientName || '',
        datePerformed: new Date().toISOString().split('T')[0],
        structure: '',
        structureType: '',
        testRows: Array(18).fill(null).map((_, i) => ({
          testNo: i + 1,
          testLocation: '',
          depthLiftType: 'DEPTH',
          depthLiftValue: '',
          wetDensity: '',
          fieldMoisture: '',
          dryDensity: '',
          proctorNo: '',
          percentProctorDensity: ''
        })),
        proctors: defaultProctors,
        projectPresetProctorsDeclared: presetDeclaredNew,
        projectPresetProctorRows: presetRowsNew,
        densSpecPercent: '',
        moistSpecMin: '',
        moistSpecMax: '',
        densSpecPercents: [],
        moistSpecRanges: [],
        gaugeNo: '',
        stdDensityCount: '',
        stdMoistCount: '',
        transDepthIn: '',
        methodD2922: 1,
        methodD3017: 1,
        methodD698: 1,
        remarks: '',
        technicianId: defaultTechId,
        techName: defaultTechName,
        timeStr: '',
        specDensityPct: '',
        proctorTaskId: null,
        proctorOptMoisture: '',
        proctorMaxDensity: '',
        proctorSoilClassification: '',
        proctorSoilClassificationText: '',
        proctorDescriptionLabel: ''
      });
    }
  } catch (err) {
    console.error('Error fetching density report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save density report by taskId
router.post('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    
    // Debug: Log received header fields
    console.log('Density save request - Header fields:', {
      clientName: req.body.clientName,
      datePerformed: req.body.datePerformed,
      structure: req.body.structure,
      structureType: req.body.structureType
    });
    
    const {
      clientName,
      datePerformed,
      structure,
      structureType,
      structureDescription,
      testRows,
      proctors,
      densSpecPercent,
      moistSpecMin,
      moistSpecMax,
      densSpecPercents,
      moistSpecRanges,
      gaugeNo,
      stdDensityCount,
      stdMoistCount,
      transDepthIn,
      methodD2922,
      methodD3017,
      methodD698,
      remarks,
      techName,
      technicianId,
      timeStr,
      updateStatus,
      assignedTechnicianId,
      specDensityPct,
      proctorTaskId,
      proctorOptMoisture,
      proctorMaxDensity,
      proctorSoilClassification,
      proctorSoilClassificationText,
      proctorDescriptionLabel
    } = req.body;

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number)
        `)
        .eq('id', taskId)
        .eq('task_type', 'DENSITY_MEASUREMENT')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!req.legacyDb && req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantId = task.tenant_id ?? task.tenantId ?? req.tenantId;

    // Check if record exists
    const existing = await db.get('density_reports', { taskId });

    // Auto-populate technician info from task if not provided
    // This ensures the technician name is always set correctly, even if admin updates the report
    let finalTechName = techName;
    let finalTechnicianId = technicianId || task.assignedTechnicianId;
    
    // If techName is not provided, get it from the assigned technician
    if (!finalTechName && finalTechnicianId) {
      const tech = await db.get('users', { id: finalTechnicianId });
      if (tech) {
        finalTechName = tech.name || tech.email || '';
      }
    }
    
    // If still no techName but we have an existing record, preserve the existing techName
    // (Don't overwrite with null if admin is updating other fields)
    if (!finalTechName && existing && existing.techName) {
      finalTechName = existing.techName;
      // Also preserve technicianId if it exists
      if (!finalTechnicianId && existing.technicianId) {
        finalTechnicianId = existing.technicianId;
      }
    }

    // Use array specs when provided; otherwise fall back to single values for backward compat
    const densSpecsArray = Array.isArray(densSpecPercents) && densSpecPercents.length > 0
      ? densSpecPercents
      : (densSpecPercent != null && String(densSpecPercent).trim() !== '' ? [String(densSpecPercent)] : []);
    const moistSpecsArray = Array.isArray(moistSpecRanges) && moistSpecRanges.length > 0
      ? moistSpecRanges
      : (moistSpecMin != null || moistSpecMax != null ? [{ min: moistSpecMin || '', max: moistSpecMax || '' }] : []);

    // Prepare data for insertion/update (omit tenantId when legacy DB has no tenant_id column)
    // For Supabase, JSONB fields accept arrays directly; for SQLite, we stringify
    const densityData = {
      taskId,
      clientName: clientName || null,
      datePerformed: datePerformed || null,
      structure: structure || null,
      structureType: structureType || null,
      structureDescription: structureDescription || null,
      testRows: testRows || [],
      proctors: proctors || [],
      densSpecPercent: densSpecsArray.length > 0 ? String(densSpecsArray[0]) : (densSpecPercent || null),
      moistSpecMin: moistSpecsArray.length > 0 ? (moistSpecsArray[0].min ?? null) : (moistSpecMin || null),
      moistSpecMax: moistSpecsArray.length > 0 ? (moistSpecsArray[0].max ?? null) : (moistSpecMax || null),
      densSpecs: densSpecsArray,
      moistSpecs: moistSpecsArray,
      gaugeNo: gaugeNo || null,
      stdDensityCount: stdDensityCount || null,
      stdMoistCount: stdMoistCount || null,
      transDepthIn: transDepthIn || null,
      methodD2922: methodD2922 ? 1 : 0,
      methodD3017: methodD3017 ? 1 : 0,
      methodD698: methodD698 ? 1 : 0,
      remarks: remarks || null,
      techName: finalTechName || null,
      technicianId: finalTechnicianId || null,
      timeStr: timeStr || null,
      specDensityPct: specDensityPct || null,
      proctorTaskId: proctorTaskId || null,
      proctorOptMoisture: proctorOptMoisture || null,
      proctorMaxDensity: proctorMaxDensity || null,
      proctorSoilClassification: proctorSoilClassification || null,
      proctorSoilClassificationText: proctorSoilClassificationText || null,
      proctorDescriptionLabel: proctorDescriptionLabel || null,
      lastEditedByRole: req.user.role,
      lastEditedByUserId: req.user.id,
      updatedAt: new Date().toISOString()
    };
    // Supabase rows require tenant_id; legacy JWT (legacyDb) still needs it when DB is Supabase.
    if (tenantId != null && (!req.legacyDb || db.isSupabase())) densityData.tenantId = tenantId;

    const isTenantIdError = (err) => (err && err.message && /tenant_id/.test(err.message));

    let result;
    try {
      if (existing) {
        await db.update('density_reports', densityData, { taskId });
        console.log('Density report updated - Header fields saved:', {
          clientName: clientName || null,
          datePerformed: datePerformed || null,
          structure: structure || null,
          structureType: structureType || null
        });
      } else {
        result = await db.insert('density_reports', densityData);
      }
    } catch (err) {
      if (isTenantIdError(err) && densityData.tenantId != null) {
        delete densityData.tenantId;
        if (existing) {
          await db.update('density_reports', densityData, { taskId });
        } else {
          result = await db.insert('density_reports', densityData);
        }
      } else {
        throw err;
      }
    }

    // Update task status if provided (never downgrade an approved report via save)
    if (updateStatus) {
      const currentStatus = task.status ?? task.task_status;
      if (currentStatus === 'APPROVED' && updateStatus !== 'APPROVED') {
        console.warn(
          `[density] Ignoring status change APPROVED → ${updateStatus} for task ${taskId} on save`
        );
      } else {
        const taskUpdate = {
          status: updateStatus,
          updatedAt: new Date().toISOString()
        };

        if (updateStatus === 'READY_FOR_REVIEW') {
          taskUpdate.reportSubmitted = 1;
        }

        await db.update('tasks', taskUpdate, { id: taskId });
      }
    }

    // Update task assignment if technician changed (admin only)
    if (isStaffReviewer(req.user.role) && assignedTechnicianId && assignedTechnicianId !== task.assignedTechnicianId) {
      await db.update('tasks', {
        assignedTechnicianId: assignedTechnicianId,
        updatedAt: new Date().toISOString()
      }, { id: taskId });
    }

    // Return updated/created data
    if (!result) {
      result = await db.get('density_reports', { taskId });
    }
    
    // Get project concreteSpecs and soilSpecs
    let projectConcreteSpecs = {};
    let projectSoilSpecs = {};
    if (db.isSupabase()) {
      const taskData = await db.get('tasks', { id: taskId });
      if (taskData) {
        const project = await db.get('projects', { id: taskData.projectId });
        if (project) {
          if (project.concreteSpecs) {
            if (typeof project.concreteSpecs === 'string') {
              try {
                projectConcreteSpecs = JSON.parse(project.concreteSpecs);
              } catch (e) {
                projectConcreteSpecs = {};
              }
            } else {
              projectConcreteSpecs = project.concreteSpecs;
            }
          }
          if (project.soilSpecs) {
            if (typeof project.soilSpecs === 'string') {
              try {
                projectSoilSpecs = JSON.parse(project.soilSpecs);
              } catch (e) {
                projectSoilSpecs = {};
              }
            } else {
              projectSoilSpecs = project.soilSpecs;
            }
          }
        }
      }
    } else {
      const sqliteDb = require('../database');
      const projectData = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT p.concreteSpecs, p.soilSpecs
           FROM projects p
           INNER JOIN tasks t ON p.id = t.projectId
           WHERE t.id = ?`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
      
      if (projectData) {
        if (projectData.concreteSpecs) {
          try {
            projectConcreteSpecs = JSON.parse(projectData.concreteSpecs);
          } catch (e) {
            projectConcreteSpecs = {};
          }
        }
        if (projectData.soilSpecs) {
          try {
            projectSoilSpecs = JSON.parse(projectData.soilSpecs);
          } catch (e) {
            projectSoilSpecs = {};
          }
        }
      }
    }

    // Parse JSON fields
    if (typeof result.testRows === 'string') {
      try {
        result.testRows = JSON.parse(result.testRows || '[]');
      } catch (e) {
        result.testRows = [];
      }
    } else {
      result.testRows = result.testRows || [];
    }
    
    if (typeof result.proctors === 'string') {
      try {
        result.proctors = JSON.parse(result.proctors || '[]');
      } catch (e) {
        result.proctors = [];
      }
    } else {
      result.proctors = result.proctors || [];
    }
    
    result.projectConcreteSpecs = projectConcreteSpecs;
    result.projectSoilSpecs = projectSoilSpecs;
    result.projectName = task.projectName;
    result.projectNumber = task.projectNumber;
    
    res.json(result);
  } catch (err) {
    console.error('Error saving density report:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

