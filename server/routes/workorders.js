'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { supabase, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin, requireAdminOrPm } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');

const router = express.Router();
const auth      = [authenticate, requireTenant];
const adminAuth = [authenticate, requireTenant, requireAdmin];

function cc(obj) { return obj ? keysToCamelCase(obj) : obj; }

// ---------------------------------------------------------------------------
// GET /api/workorders/my-schedule — tech's upcoming workorders with tasks
// Must be registered BEFORE /:id to avoid being shadowed
// ---------------------------------------------------------------------------
router.get('/my-schedule', auth, async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

    // Workorders assigned to this tech: scheduled within last 7 days OR actively clocked in
    const { data: wos, error: woErr } = await supabase
      .from('workorders')
      .select('*, users!workorders_assigned_technician_id_fkey(name)')
      .eq('tenant_id', req.tenantId)
      .eq('assigned_technician_id', req.user.id)
      .or(`scheduled_date.gte.${cutoff},and(clock_in.not.is.null,clock_out.is.null)`)
      .order('scheduled_date', { ascending: true });

    if (woErr) return res.status(500).json({ error: woErr.message });

    const workorderList = wos || [];

    if (workorderList.length === 0) {
      return res.json({ workorders: [] });
    }

    const woIds = workorderList.map(w => w.id);

    // Load tasks for these workorders
    const { data: tasks, error: tErr } = await supabase
      .from('tasks')
      .select('id, task_type, status, project_id, workorder_id, location_name, engagement_notes')
      .in('workorder_id', woIds)
      .eq('tenant_id', req.tenantId);

    if (tErr) return res.status(500).json({ error: tErr.message });

    // Load project info for the project numbers/names
    const projectIds = [...new Set((tasks || []).map(t => t.project_id))];
    let projectMap = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, project_number, project_name')
        .in('id', projectIds)
        .eq('tenant_id', req.tenantId);
      (projects || []).forEach(p => {
        projectMap[p.id] = { projectNumber: p.project_number, projectName: p.project_name };
      });
    }

    // Group tasks by workorder
    const tasksByWo = {};
    for (const t of (tasks || [])) {
      if (!tasksByWo[t.workorder_id]) tasksByWo[t.workorder_id] = [];
      const proj = projectMap[t.project_id] || {};
      tasksByWo[t.workorder_id].push({
        id: t.id,
        taskType: t.task_type,
        status: t.status,
        projectId: t.project_id,
        projectNumber: proj.projectNumber || '',
        projectName: proj.projectName || '',
        locationName: t.location_name || undefined,
        engagementNotes: t.engagement_notes || undefined,
      });
    }

    const result = workorderList.map(wo => {
      const base = cc(wo);
      // Flatten joined user name
      if (wo.users) {
        base.assignedTechnicianName = wo.users.name;
        delete base.users;
      }
      base.tasks = tasksByWo[wo.id] || [];
      return base;
    });

    res.json({ workorders: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/workorders?projectId=X
// ---------------------------------------------------------------------------
router.get('/', auth, [
  query('projectId').isInt().withMessage('projectId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { data, error } = await supabase
      .from('workorders')
      .select('*, users!workorders_assigned_technician_id_fkey(name)')
      .eq('tenant_id', req.tenantId)
      .eq('project_id', req.query.projectId)
      .order('created_at');

    if (error) return res.status(500).json({ error: error.message });

    const result = (data || []).map(wo => {
      const base = cc(wo);
      if (wo.users) {
        base.assignedTechnicianName = wo.users.name;
        delete base.users;
      }
      return base;
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/workorders/suggest-assignment?date=YYYY-MM-DD&projectId=N[&excludeWorkorderId=N]
// Returns ranked technician suggestions for a given date.
// Must be registered BEFORE /:id to avoid being shadowed.
// ---------------------------------------------------------------------------
router.get('/suggest-assignment', [authenticate, requireTenant, requireAdminOrPm], async (req, res) => {
  const { date, projectId, excludeWorkorderId } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
  }

  try {
    // 1. Fetch all technicians for this tenant
    const { data: techRows, error: techErr } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('tenant_id', req.tenantId)
      .eq('role', 'TECHNICIAN')
      .order('name');
    if (techErr) throw techErr;
    const techs = techRows || [];

    // 2. Fetch workorders on the requested date (excluding the workorder being edited)
    let wosQ = supabase
      .from('workorders')
      .select('id, assigned_technician_id, scheduled_date, project_id')
      .eq('tenant_id', req.tenantId)
      .eq('scheduled_date', date)
      .not('assigned_technician_id', 'is', null);
    if (excludeWorkorderId) {
      wosQ = wosQ.neq('id', Number(excludeWorkorderId));
    }
    const { data: wosOnDate } = await wosQ;
    const busyTechIds = new Set((wosOnDate || []).map(w => w.assigned_technician_id));

    // 3. Check which techs have worked this project recently (same week) for ranking
    const projectIdNum = projectId ? Number(projectId) : null;
    let projectTechIds = new Set();
    if (projectIdNum) {
      const weekAgo = new Date(date);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: recentWos } = await supabase
        .from('workorders')
        .select('assigned_technician_id')
        .eq('tenant_id', req.tenantId)
        .eq('project_id', projectIdNum)
        .gte('scheduled_date', weekAgo.toISOString().slice(0, 10))
        .lte('scheduled_date', date)
        .not('assigned_technician_id', 'is', null);
      projectTechIds = new Set((recentWos || []).map(w => w.assigned_technician_id));
    }

    // 4. Build result: rank by (no conflict, worked project recently, then name)
    const suggestions = techs
      .map(t => ({
        technicianId: t.id,
        name: t.name || t.email,
        hasConflict: busyTechIds.has(t.id),
        workedProjectRecently: projectTechIds.has(t.id),
        recommended: false,
      }))
      .sort((a, b) => {
        if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
        if (a.workedProjectRecently !== b.workedProjectRecently) return a.workedProjectRecently ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // Mark the top non-conflicting tech as recommended
    const firstFree = suggestions.find(s => !s.hasConflict);
    if (firstFree) firstFree.recommended = true;

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/workorders/hold-window — workorders with a pending auto-assigned notification
// Must be before /:id
// ---------------------------------------------------------------------------
router.get('/hold-window', [authenticate, requireTenant, requireAdminOrPm], async (req, res) => {
  const now = new Date().toISOString();
  try {
    const { data: pnRows } = await supabase
      .from('pending_notifications')
      .select('workorder_id, hold_until, technician_id, technician_email')
      .eq('tenant_id', req.tenantId)
      .eq('sent', false)
      .not('hold_until', 'is', null)
      .gt('hold_until', now);

    if (!pnRows || pnRows.length === 0) return res.json([]);

    const woIdMap = new Map();
    for (const row of pnRows) {
      if (row.workorder_id && !woIdMap.has(row.workorder_id)) woIdMap.set(row.workorder_id, row);
    }
    const woIds = [...woIdMap.keys()];

    const { data: wos } = await supabase
      .from('workorders')
      .select('id, workorder_number, scheduled_date, assigned_technician_id, project_id')
      .in('id', woIds)
      .eq('tenant_id', req.tenantId);

    const projectIds = [...new Set((wos || []).map(w => w.project_id).filter(Boolean))];
    const { data: projects } = projectIds.length
      ? await supabase.from('projects').select('id, project_name').in('id', projectIds)
      : { data: [] };
    const projectMap = new Map((projects || []).map(p => [p.id, p.project_name]));

    const techIds = [...new Set((wos || []).map(w => w.assigned_technician_id).filter(Boolean))];
    const { data: techs } = techIds.length
      ? await supabase.from('users').select('id, name').in('id', techIds)
      : { data: [] };
    const techMap = new Map((techs || []).map(t => [t.id, t.name]));

    res.json((wos || []).map(wo => {
      const pn = woIdMap.get(wo.id);
      return {
        workorderId: wo.id,
        workorderNumber: wo.workorder_number,
        scheduledDate: wo.scheduled_date,
        projectName: projectMap.get(wo.project_id) || null,
        technicianName: techMap.get(wo.assigned_technician_id) || pn?.technician_email || null,
        technicianId: wo.assigned_technician_id,
        holdUntil: pn?.hold_until,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/workorders/availability — list availability blocks for the tenant
// POST /api/workorders/availability — create a block
// Must be before /:id
// ---------------------------------------------------------------------------
router.get('/availability', [authenticate, requireTenant, requireAdminOrPm], async (req, res) => {
  const { technicianId, startDate, endDate } = req.query;
  let q = supabase
    .from('technician_availability')
    .select('*, users!technician_availability_technician_id_fkey(name, email)')
    .eq('tenant_id', req.tenantId)
    .order('date');

  if (technicianId) q = q.eq('technician_id', Number(technicianId));
  if (startDate)    q = q.gte('date', startDate);
  if (endDate)      q = q.lte('date', endDate);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(row => ({
    id: row.id,
    technicianId: row.technician_id,
    technicianName: row.users?.name || row.users?.email || null,
    date: row.date,
    reason: row.reason,
    createdAt: row.created_at,
  })));
});

router.post('/availability', [authenticate, requireTenant, requireAdminOrPm], async (req, res) => {
  const { technicianId, date, reason } = req.body;
  if (!technicianId || !date) return res.status(400).json({ error: 'technicianId and date are required' });
  const { data, error } = await supabase
    .from('technician_availability')
    .insert({ tenant_id: req.tenantId, technician_id: Number(technicianId), date, reason: reason || null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Availability block already exists for this date' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ id: data.id, technicianId: data.technician_id, date: data.date, reason: data.reason });
});

router.delete('/availability/:blockId', [authenticate, requireTenant, requireAdminOrPm], async (req, res) => {
  const { error } = await supabase
    .from('technician_availability')
    .delete()
    .eq('id', req.params.blockId)
    .eq('tenant_id', req.tenantId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/workorders/:id
// ---------------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workorders')
      .select('*, users!workorders_assigned_technician_id_fkey(name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Workorder not found' });

    const base = cc(data);
    if (data.users) {
      base.assignedTechnicianName = data.users.name;
      delete base.users;
    }
    res.json(base);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/workorders
// ---------------------------------------------------------------------------
router.post('/', adminAuth, [
  body('projectId').isInt().withMessage('projectId is required'),
  body('workorderNumber').notEmpty().trim().withMessage('workorderNumber is required'),
  body('description').optional().trim(),
  body('assignedTechnicianId').optional().isInt(),
  body('scheduledDate').optional().isDate(),
  body('scheduledTime').optional().trim(),
  body('siteLocation').optional().trim(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { projectId, workorderNumber, description, assignedTechnicianId, scheduledDate, scheduledTime, siteLocation } = req.body;

  try {
    const { data, error } = await supabase
      .from('workorders')
      .insert({
        tenant_id:               req.tenantId,
        project_id:              projectId,
        workorder_number:        workorderNumber,
        description:             description || null,
        status:                  'open',
        billing_status:          'unbilled',
        assigned_technician_id:  assignedTechnicianId || null,
        scheduled_date:          scheduledDate || null,
        scheduled_time:          scheduledTime || null,
        site_location:           siteLocation || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `Workorder number "${workorderNumber}" already exists on this project.` });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/workorders/:id
// ---------------------------------------------------------------------------
router.put('/:id', adminAuth, [
  body('workorderNumber').optional().notEmpty().trim(),
  body('description').optional().trim(),
  body('status').optional().isIn(['open', 'complete', 'approved', 'could_not_access']),
  body('assignedTechnicianId').optional().isInt(),
  body('scheduledDate').optional().isDate(),
  body('scheduledTime').optional().trim(),
  body('siteLocation').optional().trim(),
  body('clockIn').optional(),
  body('clockOut').optional(),
  body('breakMinutes').optional().isInt({ min: 0 }),
  body('miles').optional().isFloat({ min: 0 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { data: existing, error: fetchErr } = await supabase
    .from('workorders')
    .select('id, tenant_id, billing_status, assigned_technician_id, workorder_number, scheduled_date, scheduled_time, site_location, project_id, description')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !existing) return res.status(404).json({ error: 'Workorder not found' });
  if (Number(existing.tenant_id) !== req.tenantId) return res.status(403).json({ error: 'Access denied' });

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.workorderNumber       !== undefined) updates.workorder_number       = req.body.workorderNumber;
  if (req.body.description           !== undefined) updates.description            = req.body.description || null;
  if (req.body.status                !== undefined) updates.status                 = req.body.status;
  if (req.body.assignedTechnicianId  !== undefined) updates.assigned_technician_id = req.body.assignedTechnicianId || null;
  if (req.body.scheduledDate         !== undefined) updates.scheduled_date         = req.body.scheduledDate || null;
  if (req.body.scheduledTime         !== undefined) updates.scheduled_time         = req.body.scheduledTime || null;
  if (req.body.siteLocation          !== undefined) updates.site_location          = req.body.siteLocation || null;
  if (req.body.clockIn               !== undefined) updates.clock_in               = req.body.clockIn || null;
  if (req.body.clockOut              !== undefined) updates.clock_out              = req.body.clockOut || null;
  if (req.body.breakMinutes          !== undefined) updates.break_minutes          = req.body.breakMinutes;
  if (req.body.miles                 !== undefined) updates.miles                  = req.body.miles || null;

  try {
    const { data, error } = await supabase
      .from('workorders')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // ── Post-update email notifications ────────────────────────────────────
    try {
      const TASK_LABEL_MAP = {
        DENSITY_MEASUREMENT: 'Density Measurement',
        PROCTOR: 'Proctor',
        REBAR: 'Rebar',
        COMPRESSIVE_STRENGTH: 'Compressive Strength',
        CYLINDER_PICKUP: 'Cylinder Pickup',
      };

      const newTechId = req.body.assignedTechnicianId !== undefined
        ? (req.body.assignedTechnicianId || null)
        : undefined;
      const techChanged = req.body.assignedTechnicianId !== undefined &&
        (newTechId || null) !== (existing.assigned_technician_id || null);

      const detailsChanged = !techChanged && (
        (req.body.scheduledDate  !== undefined && req.body.scheduledDate  !== existing.scheduled_date) ||
        (req.body.scheduledTime  !== undefined && req.body.scheduledTime  !== existing.scheduled_time) ||
        (req.body.siteLocation   !== undefined && req.body.siteLocation   !== existing.site_location)  ||
        (req.body.description    !== undefined && req.body.description    !== existing.description)
      );

      const adminName = req.user.name || req.user.email || 'Admin';

      if (techChanged) {
        const { sendWorkorderRemovedFromEmail, sendWorkorderDispatchEmail } = require('../services/email');

        // Notify old tech they've been removed
        if (existing.assigned_technician_id) {
          const { data: oldTech } = await supabase.from('users').select('email, name').eq('id', existing.assigned_technician_id).single();
          if (oldTech?.email) {
            await sendWorkorderRemovedFromEmail(
              oldTech.email,
              existing,
              oldTech.name || 'Technician',
              adminName,
            );
          }
        }

        // Notify new tech they've been dispatched
        if (newTechId) {
          const [{ data: newTech }, { data: taskRows }, { data: project }] = await Promise.all([
            supabase.from('users').select('email, name').eq('id', newTechId).single(),
            supabase.from('tasks').select('task_type, location_name, engagement_notes').eq('workorder_id', existing.id).eq('tenant_id', req.tenantId),
            supabase.from('projects').select('project_number, project_name').eq('id', existing.project_id).single(),
          ]);
          if (newTech?.email) {
            const taskList = (taskRows || []).map(t => ({
              task_type:        t.task_type,
              task_label:       TASK_LABEL_MAP[t.task_type] || t.task_type,
              location_name:    t.location_name,
              engagement_notes: t.engagement_notes,
            }));
            const mergedWo = {
              ...existing,
              workorder_number: data.workorder_number,
              scheduled_date:   data.scheduled_date,
              scheduled_time:   data.scheduled_time,
              site_location:    data.site_location,
              project_number:   project?.project_number || '',
              project_name:     project?.project_name || '',
            };
            await sendWorkorderDispatchEmail(newTech.email, mergedWo, taskList, adminName);
          }
        }
      } else if (detailsChanged) {
        // Notify current assigned tech of updated details
        const currentTechId = existing.assigned_technician_id;
        if (currentTechId) {
          const { sendWorkorderUpdatedEmail } = require('../services/email');
          const [{ data: tech }, { data: taskRows }, { data: project }] = await Promise.all([
            supabase.from('users').select('email, name').eq('id', currentTechId).single(),
            supabase.from('tasks').select('task_type, location_name, engagement_notes').eq('workorder_id', existing.id).eq('tenant_id', req.tenantId),
            supabase.from('projects').select('project_number, project_name').eq('id', existing.project_id).single(),
          ]);
          if (tech?.email) {
            const taskList = (taskRows || []).map(t => ({
              task_type:        t.task_type,
              task_label:       TASK_LABEL_MAP[t.task_type] || t.task_type,
              location_name:    t.location_name,
              engagement_notes: t.engagement_notes,
            }));
            const mergedWo = {
              ...existing,
              workorder_number: data.workorder_number,
              scheduled_date:   data.scheduled_date,
              scheduled_time:   data.scheduled_time,
              site_location:    data.site_location,
              project_number:   project?.project_number || '',
              project_name:     project?.project_name || '',
            };
            await sendWorkorderUpdatedEmail(tech.email, mergedWo, taskList, adminName);
          }
        }
      }
    } catch (emailErr) {
      console.error('[workorders PUT] Email failed (non-fatal):', emailErr.message);
    }

    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/workorders/:id/clock-in — tech accessible
// ---------------------------------------------------------------------------
router.post('/:id/clock-in', auth, async (req, res) => {
  try {
    const { data: wo, error: fetchErr } = await supabase
      .from('workorders')
      .select('id, tenant_id, assigned_technician_id, clock_in')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr || !wo) return res.status(404).json({ error: 'Workorder not found' });
    if (Number(wo.assigned_technician_id) !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'This workorder is not assigned to you' });
    }
    if (wo.clock_in) return res.status(409).json({ error: 'Already clocked in' });

    const { data, error } = await supabase
      .from('workorders')
      .update({ clock_in: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', wo.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/workorders/:id/clock-out — tech accessible
// ---------------------------------------------------------------------------
router.post('/:id/clock-out', auth, [
  body('breakMinutes').optional().isInt({ min: 0 }),
  body('miles').optional().isFloat({ min: 0 }),
], async (req, res) => {
  try {
    const { data: wo, error: fetchErr } = await supabase
      .from('workorders')
      .select('id, tenant_id, assigned_technician_id, clock_in, clock_out')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr || !wo) return res.status(404).json({ error: 'Workorder not found' });
    if (Number(wo.assigned_technician_id) !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'This workorder is not assigned to you' });
    }
    if (!wo.clock_in) return res.status(409).json({ error: 'Not clocked in yet' });
    if (wo.clock_out) return res.status(409).json({ error: 'Already clocked out' });

    const updates = {
      clock_out:     new Date().toISOString(),
      status:        'complete',
      updated_at:    new Date().toISOString(),
    };
    if (req.body.breakMinutes !== undefined) updates.break_minutes = parseInt(req.body.breakMinutes, 10) || 0;
    if (req.body.miles !== undefined) updates.miles = parseFloat(req.body.miles) || null;

    const { data, error } = await supabase
      .from('workorders')
      .update(updates)
      .eq('id', wo.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/workorders/:id/could-not-access — tech accessible
// ---------------------------------------------------------------------------
router.post('/:id/could-not-access', auth, async (req, res) => {
  try {
    const { data: wo, error: fetchErr } = await supabase
      .from('workorders')
      .select('id, tenant_id, assigned_technician_id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr || !wo) return res.status(404).json({ error: 'Workorder not found' });
    if (Number(wo.assigned_technician_id) !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'This workorder is not assigned to you' });
    }

    const { data, error } = await supabase
      .from('workorders')
      .update({ status: 'could_not_access', updated_at: new Date().toISOString() })
      .eq('id', wo.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/workorders/:id/reopen — admin only, resets CNA back to open
// ---------------------------------------------------------------------------
router.post('/:id/reopen', adminAuth, async (req, res) => {
  try {
    const { scheduledDate, scheduledTime, note } = req.body;

    const { data: wo, error: fetchErr } = await supabase
      .from('workorders')
      .select('id, tenant_id, status, assigned_technician_id, workorder_number, scheduled_date, scheduled_time, site_location, description')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (fetchErr || !wo) return res.status(404).json({ error: 'Workorder not found' });
    if (wo.status !== 'could_not_access') {
      return res.status(400).json({ error: 'Only "Could Not Access" workorders can be reopened.' });
    }

    const updates = { status: 'open', updated_at: new Date().toISOString() };
    if (scheduledDate) updates.scheduled_date = scheduledDate;
    if (scheduledTime !== undefined) updates.scheduled_time = scheduledTime || null;

    const { data, error } = await supabase
      .from('workorders')
      .update(updates)
      .eq('id', wo.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Reset any COULD_NOT_ACCESS tasks on this workorder back to ASSIGNED
    await supabase
      .from('tasks')
      .update({ status: 'ASSIGNED', updated_at: new Date().toISOString() })
      .eq('workorder_id', wo.id)
      .eq('tenant_id', req.tenantId)
      .eq('status', 'COULD_NOT_ACCESS');

    // Email the assigned technician
    if (wo.assigned_technician_id) {
      try {
        const { sendWorkorderReopenEmail } = require('../services/email');
        const { data: tech } = await supabase
          .from('users')
          .select('email, name')
          .eq('id', wo.assigned_technician_id)
          .single();

        if (tech?.email) {
          const techName  = tech.name || 'Technician';
          const adminName = req.user.name || 'Admin';
          await sendWorkorderReopenEmail(
            tech.email,
            { ...wo, scheduled_date: updates.scheduled_date || wo.scheduled_date, scheduled_time: updates.scheduled_time || wo.scheduled_time },
            techName,
            note || null,
            adminName,
          );
        }
      } catch (emailErr) {
        console.error('[reopen] Email failed (non-fatal):', emailErr.message);
      }
    }

    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/workorders/:id — deletes tasks cascade then workorder (unbilled only)
// ---------------------------------------------------------------------------
router.delete('/:id', adminAuth, async (req, res) => {
  const { data: wo } = await supabase
    .from('workorders')
    .select('id, tenant_id, billing_status, assigned_technician_id, workorder_number, scheduled_date, scheduled_time, site_location, project_id')
    .eq('id', req.params.id)
    .single();

  if (!wo) return res.status(404).json({ error: 'Workorder not found' });
  if (Number(wo.tenant_id) !== req.tenantId) return res.status(403).json({ error: 'Access denied' });
  if (wo.billing_status !== 'unbilled') {
    return res.status(409).json({ error: 'Cannot delete a claimed or billed workorder. Void the invoice first.' });
  }

  // Delete associated tasks first
  await supabase.from('tasks').delete().eq('workorder_id', wo.id).eq('tenant_id', req.tenantId);

  const { error } = await supabase.from('workorders').delete().eq('id', wo.id);
  if (error) return res.status(500).json({ error: error.message });

  // Notify assigned tech of cancellation (non-fatal)
  if (wo.assigned_technician_id) {
    try {
      const { sendWorkorderCancelledEmail } = require('../services/email');
      const [{ data: tech }, { data: project }] = await Promise.all([
        supabase.from('users').select('email, name').eq('id', wo.assigned_technician_id).single(),
        supabase.from('projects').select('project_number, project_name').eq('id', wo.project_id).single(),
      ]);
      if (tech?.email) {
        const adminName = req.user.name || req.user.email || 'Admin';
        await sendWorkorderCancelledEmail(
          tech.email,
          {
            ...wo,
            project_number: project?.project_number || '',
            project_name:   project?.project_name   || '',
          },
          tech.name || 'Technician',
          adminName,
        );
      }
    } catch (emailErr) {
      console.error('[workorders DELETE] Cancel email failed (non-fatal):', emailErr.message);
    }
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/workorders/:id/auto-assign
// Runs conflict + availability check; auto-assigns if exactly one clear winner.
// If ambiguous (0 or 2+ equal candidates), returns suggestion list (Tier 1 fallback).
// ---------------------------------------------------------------------------
router.post('/:id/auto-assign', adminAuth, async (req, res) => {
  const woId = Number(req.params.id);

  const { data: wo, error: woErr } = await supabase
    .from('workorders')
    .select('id, tenant_id, project_id, scheduled_date, workorder_number, scheduled_time, site_location, description')
    .eq('id', woId)
    .eq('tenant_id', req.tenantId)
    .single();

  if (woErr || !wo) return res.status(404).json({ error: 'Workorder not found' });
  if (!wo.scheduled_date) return res.status(422).json({ error: 'Workorder must have a scheduled date before auto-assigning' });

  // Read per-tenant hold_minutes from app_settings (default 30)
  let holdMinutes = 30;
  try {
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('tenant_id', req.tenantId)
      .eq('key', 'dispatch_hold_minutes')
      .maybeSingle();
    if (setting?.value) holdMinutes = parseInt(setting.value, 10) || 30;
  } catch { /* use default */ }

  const date = wo.scheduled_date;

  // 1. All technicians for this tenant
  const { data: techRows } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('tenant_id', req.tenantId)
    .eq('role', 'TECHNICIAN')
    .order('name');
  const techs = techRows || [];

  // 2. Workorders on the same date (excluding this one)
  const { data: busyWos } = await supabase
    .from('workorders')
    .select('assigned_technician_id')
    .eq('tenant_id', req.tenantId)
    .eq('scheduled_date', date)
    .not('assigned_technician_id', 'is', null)
    .neq('id', woId);
  const busyIds = new Set((busyWos || []).map(w => w.assigned_technician_id));

  // 3. Availability blocks on this date
  const { data: blockedRows } = await supabase
    .from('technician_availability')
    .select('technician_id')
    .eq('tenant_id', req.tenantId)
    .eq('date', date);
  const blockedIds = new Set((blockedRows || []).map(r => r.technician_id));

  // 4. Techs who worked this project recently (last 7 days)
  let projectTechIds = new Set();
  if (wo.project_id) {
    const weekAgo = new Date(date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: recentWos } = await supabase
      .from('workorders')
      .select('assigned_technician_id')
      .eq('tenant_id', req.tenantId)
      .eq('project_id', wo.project_id)
      .gte('scheduled_date', weekAgo.toISOString().slice(0, 10))
      .lte('scheduled_date', date)
      .not('assigned_technician_id', 'is', null);
    projectTechIds = new Set((recentWos || []).map(w => w.assigned_technician_id));
  }

  // 5. Rank candidates
  const candidates = techs
    .map(t => ({
      technicianId: t.id,
      name: t.name || t.email,
      email: t.email,
      hasConflict: busyIds.has(t.id),
      isBlocked: blockedIds.has(t.id),
      workedProjectRecently: projectTechIds.has(t.id),
      recommended: false,
    }))
    .filter(c => !c.isBlocked)  // blocked techs never shown
    .sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
      if (a.workedProjectRecently !== b.workedProjectRecently) return a.workedProjectRecently ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const freeCandidates = candidates.filter(c => !c.hasConflict);

  // 6. Ambiguous? Return suggestion list (Tier 1 fallback)
  if (freeCandidates.length !== 1) {
    if (freeCandidates.length > 0) freeCandidates[0].recommended = true;
    return res.json({ autoAssigned: false, candidates });
  }

  // 7. Unambiguous — auto-assign
  const winner = freeCandidates[0];
  const holdUntil = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  await supabase
    .from('workorders')
    .update({ assigned_technician_id: winner.technicianId, updated_at: new Date().toISOString() })
    .eq('id', woId);

  // Queue notification with hold window
  const { queueAssignmentNotification } = require('../utils/notificationQueue');
  const { data: project } = await supabase
    .from('projects')
    .select('project_number, project_name')
    .eq('id', wo.project_id)
    .single();

  await queueAssignmentNotification({
    tenantId: req.tenantId,
    technicianId: winner.technicianId,
    technicianEmail: winner.email,
    projectId: wo.project_id,
    projectNumber: project?.project_number || null,
    projectName: project?.project_name || null,
    assignedByName: req.user?.name || req.user?.email || 'Admin',
    workorderId: woId,
    workorderNumber: wo.workorder_number,
    scheduledTime: wo.scheduled_time,
    siteLocation: wo.site_location,
    holdUntil,
  });

  res.json({
    autoAssigned: true,
    technicianId: winner.technicianId,
    technicianName: winner.name,
    holdUntil,
    holdMinutes,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/workorders/:id/cancel-auto-assign
// Cancels the hold-window notification and clears the assigned technician.
// ---------------------------------------------------------------------------
router.delete('/:id/cancel-auto-assign', adminAuth, async (req, res) => {
  const woId = Number(req.params.id);

  const { data: wo } = await supabase
    .from('workorders')
    .select('id, tenant_id')
    .eq('id', woId)
    .eq('tenant_id', req.tenantId)
    .single();

  if (!wo) return res.status(404).json({ error: 'Workorder not found' });

  // Delete any unsent hold-window notifications for this workorder
  await supabase
    .from('pending_notifications')
    .delete()
    .eq('workorder_id', woId)
    .eq('tenant_id', req.tenantId)
    .eq('sent', false)
    .not('hold_until', 'is', null);

  // Clear assigned technician
  await supabase
    .from('workorders')
    .update({ assigned_technician_id: null, updated_at: new Date().toISOString() })
    .eq('id', woId);

  res.json({ ok: true });
});

module.exports = router;
