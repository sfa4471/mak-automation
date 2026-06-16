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

module.exports = router;
