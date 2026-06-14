'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { supabase, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');

const router = express.Router();
const auth      = [authenticate, requireTenant];
const adminAuth = [authenticate, requireTenant, requireAdmin];

function cc(obj) { return obj ? keysToCamelCase(obj) : obj; }

/**
 * Check for overlapping dispatches for the same tech on the same date.
 * Returns the overlapping dispatch, or null.
 */
async function findOverlap(technicianId, dispatchDate, clockIn, clockOut, excludeId = null) {
  if (!clockIn || !clockOut) return null;

  const { data: existing } = await supabase
    .from('dispatches')
    .select('id, clock_in, clock_out')
    .eq('technician_id', technicianId)
    .eq('dispatch_date', dispatchDate)
    .not('clock_in', 'is', null)
    .not('clock_out', 'is', null);

  if (!existing) return null;

  const inMs  = new Date(clockIn).getTime();
  const outMs = new Date(clockOut).getTime();

  for (const d of existing) {
    if (excludeId && d.id === excludeId) continue;
    const dIn  = new Date(d.clock_in).getTime();
    const dOut = new Date(d.clock_out).getTime();
    // Overlap: intervals [A,B) and [C,D) overlap when A < D && C < B
    if (inMs < dOut && dIn < outMs) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/dispatches?workorderId=X
// ---------------------------------------------------------------------------
router.get('/', auth, [
  query('workorderId').isInt().withMessage('workorderId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { data, error } = await supabase
      .from('dispatches')
      .select('*, users(name, email), tasks(id, task_type, status)')
      .eq('workorder_id', req.query.workorderId)
      .eq('tenant_id', req.tenantId)
      .order('dispatch_date')
      .order('clock_in');

    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(cc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dispatches/project/:projectId — all dispatches for a project
// ---------------------------------------------------------------------------
router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dispatches')
      .select('*, users(name), workorders(workorder_number), tasks(id, task_type, status)')
      .eq('project_id', req.params.projectId)
      .eq('tenant_id', req.tenantId)
      .order('dispatch_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(cc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/dispatches/:id
// ---------------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dispatches')
      .select('*, users(name, email), tasks(id, task_type, status)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Dispatch not found' });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/dispatches
// ---------------------------------------------------------------------------
router.post('/', adminAuth, [
  body('workorderId').isInt().withMessage('workorderId is required'),
  body('technicianId').isInt().withMessage('technicianId is required'),
  body('dispatchDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dispatchDate required (YYYY-MM-DD)'),
  body('siteLocation').optional().trim(),
  body('clockIn').optional({ nullable: true }).isISO8601(),
  body('clockOut').optional({ nullable: true }).isISO8601(),
  body('breakMinutes').optional().isInt({ min: 0 }),
  body('miles').optional().isFloat({ min: 0 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { workorderId, technicianId, dispatchDate, siteLocation, clockIn, clockOut, breakMinutes, miles } = req.body;

  // Validate workorder belongs to this tenant
  const { data: wo } = await supabase
    .from('workorders')
    .select('id, tenant_id, project_id, billing_status')
    .eq('id', workorderId)
    .single();

  if (!wo || Number(wo.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Workorder not found' });
  }
  if (wo.billing_status !== 'unbilled') {
    return res.status(409).json({ error: 'Cannot add dispatches to a claimed/billed workorder.' });
  }

  // Overlap check
  if (clockIn && clockOut) {
    const overlap = await findOverlap(technicianId, dispatchDate, clockIn, clockOut);
    if (overlap) {
      return res.status(409).json({
        error: `This technician already has an overlapping dispatch on ${dispatchDate}. Overlapping entries corrupt billing — fix the times before saving.`,
        conflictDispatchId: overlap.id,
      });
    }
  }

  try {
    const { data, error } = await supabase
      .from('dispatches')
      .insert({
        tenant_id:     req.tenantId,
        project_id:    wo.project_id,
        workorder_id:  workorderId,
        technician_id: technicianId,
        dispatch_date: dispatchDate,
        site_location: siteLocation || null,
        clock_in:      clockIn || null,
        clock_out:     clockOut || null,
        break_minutes: breakMinutes ?? 0,
        miles:         miles ?? 0,
        status:        'scheduled',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/dispatches/:id
// ---------------------------------------------------------------------------
router.put('/:id', adminAuth, [
  body('siteLocation').optional().trim(),
  body('clockIn').optional({ nullable: true }).isISO8601(),
  body('clockOut').optional({ nullable: true }).isISO8601(),
  body('breakMinutes').optional().isInt({ min: 0 }),
  body('miles').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['scheduled', 'in_progress', 'complete']),
  body('technicianId').optional().isInt(),
  body('dispatchDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { data: dispatch } = await supabase
    .from('dispatches')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!dispatch || Number(dispatch.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Dispatch not found' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.siteLocation  !== undefined) updates.site_location  = req.body.siteLocation  || null;
  if (req.body.clockIn       !== undefined) updates.clock_in       = req.body.clockIn       || null;
  if (req.body.clockOut      !== undefined) updates.clock_out      = req.body.clockOut      || null;
  if (req.body.breakMinutes  !== undefined) updates.break_minutes  = req.body.breakMinutes;
  if (req.body.miles         !== undefined) updates.miles          = req.body.miles;
  if (req.body.status        !== undefined) updates.status         = req.body.status;
  if (req.body.technicianId  !== undefined) updates.technician_id  = req.body.technicianId;
  if (req.body.dispatchDate  !== undefined) updates.dispatch_date  = req.body.dispatchDate;

  // Overlap check if clock times are being changed
  const checkIn  = updates.clock_in  ?? dispatch.clock_in;
  const checkOut = updates.clock_out ?? dispatch.clock_out;
  const techId   = updates.technician_id ?? dispatch.technician_id;
  const date     = updates.dispatch_date ?? dispatch.dispatch_date;

  if (checkIn && checkOut) {
    const overlap = await findOverlap(techId, date, checkIn, checkOut, dispatch.id);
    if (overlap) {
      return res.status(409).json({
        error: `Overlapping dispatch detected on ${date} for this technician. Fix times before saving.`,
        conflictDispatchId: overlap.id,
      });
    }
  }

  try {
    const { data, error } = await supabase
      .from('dispatches')
      .update(updates)
      .eq('id', dispatch.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/dispatches/:id — only if no tasks are linked
// ---------------------------------------------------------------------------
router.delete('/:id', adminAuth, async (req, res) => {
  const { data: dispatch } = await supabase
    .from('dispatches')
    .select('id, tenant_id')
    .eq('id', req.params.id)
    .single();

  if (!dispatch || Number(dispatch.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Dispatch not found' });
  }

  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('dispatch_id', dispatch.id);

  if (count > 0) {
    return res.status(409).json({ error: `Cannot delete — ${count} task(s) are linked to this dispatch. Unlink them first.` });
  }

  const { error } = await supabase.from('dispatches').delete().eq('id', dispatch.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/dispatches/:id/link-task — attach an existing task to a dispatch
// ---------------------------------------------------------------------------
router.post('/:id/link-task', adminAuth, [
  body('taskId').isInt().withMessage('taskId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { data: dispatch } = await supabase
    .from('dispatches')
    .select('id, tenant_id, project_id')
    .eq('id', req.params.id)
    .single();

  if (!dispatch || Number(dispatch.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Dispatch not found' });
  }

  const { data: task } = await supabase
    .from('tasks')
    .select('id, project_id, tenant_id')
    .eq('id', req.body.taskId)
    .single();

  if (!task || Number(task.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (Number(task.project_id) !== Number(dispatch.project_id)) {
    return res.status(400).json({ error: 'Task and dispatch must belong to the same project.' });
  }

  const { error } = await supabase
    .from('tasks')
    .update({ dispatch_id: dispatch.id })
    .eq('id', task.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
