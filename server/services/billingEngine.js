'use strict';

/**
 * Billing engine — a WORKORDER is the dispatch.
 *
 * Labor + trip: grouped by workorder (one clock-in/out per workorder).
 *   - OT is cumulative per tech per day across ALL workorders (spec §3).
 *   - Trip charged once per workorder within the invoiced workorders.
 * Material charges: per task, by task_type.
 * Money: integer cents; only final line amounts round.
 *
 * Backward compat: tasks that have their own clock_in/clock_out (legacy)
 * are used as fallback when the workorder has no clock data.
 */

const { supabase } = require('../db/supabase');

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function toCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

function rateCents(rate) {
  return toCents(rate);
}

function billableMinutes(task) {
  if (!task.clock_in || !task.clock_out) return 0;
  const inMs  = new Date(task.clock_in).getTime();
  const outMs = new Date(task.clock_out).getTime();
  if (outMs <= inMs) return 0;
  return Math.max(0, (outMs - inMs) / 60000 - (task.break_minutes || 0));
}

function taskDate(task) {
  // Use clock_in date; fall back to scheduled_start_date / scheduled_date
  if (task.clock_in) return task.clock_in.slice(0, 10);
  return task.scheduled_start_date || task.scheduled_date || null;
}

// ---------------------------------------------------------------------------
// 1. Labor — interval-merge approach for correct OT on overlapping dispatches
// ---------------------------------------------------------------------------

/**
 * Merge an array of {start, end} millisecond intervals (union) and return
 * total duration in minutes. This prevents double-counting when a tech is
 * clocked into two dispatches simultaneously.
 */
function mergeIntervalsToMinutes(intervals) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged.reduce((sum, iv) => sum + (iv.end - iv.start) / 60000, 0);
}

/**
 * Compute actual calendar-hours labor per (technician_id, date) using interval
 * merging so overlapping dispatch clocks don't double-bill.
 *
 * Returns Map<`${techId}|${date}`, { regularMinutes, otMinutes }>
 *
 * Accepts any objects with clock_in, clock_out, break_minutes,
 * assigned_technician_id (works for both tasks and workorders).
 */
function computeDayLabor(records) {
  const OT_THRESHOLD = 8 * 60;
  const groups = new Map(); // key → { intervals: [{start,end}], totalBreakMinutes }

  for (const t of records) {
    if (!t.clock_in || !t.clock_out) continue;
    const date   = taskDate(t);
    const techId = t.assigned_technician_id ?? t.assignedTechnicianId;
    if (!date || !techId) continue;
    const start = new Date(t.clock_in).getTime();
    const end   = new Date(t.clock_out).getTime();
    if (end <= start) continue;
    const key = `${techId}|${date}`;
    if (!groups.has(key)) groups.set(key, { intervals: [], totalBreakMinutes: 0 });
    const g = groups.get(key);
    g.intervals.push({ start, end });
    g.totalBreakMinutes += (t.break_minutes || 0);
  }

  const result = new Map();
  for (const [key, { intervals, totalBreakMinutes }] of groups) {
    const rawMinutes = mergeIntervalsToMinutes(intervals);
    const billable   = Math.max(0, rawMinutes - totalBreakMinutes);
    const regular    = Math.min(billable, OT_THRESHOLD);
    const ot         = Math.max(0, billable - OT_THRESHOLD);
    result.set(key, { regularMinutes: regular, otMinutes: ot });
  }
  return result;
}

/**
 * Legacy per-task split — kept for backward compatibility / unit tests.
 * generateInvoiceLines now uses computeDayLabor instead.
 */
function computeLaborSplit(tasks, rateSet) {
  const OT_THRESHOLD = 8 * 60;
  const groups = new Map();
  for (const t of tasks) {
    const date = taskDate(t);
    if (!date) continue;
    const techId = t.assigned_technician_id ?? t.assignedTechnicianId;
    if (!techId) continue;
    const key = `${techId}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const result = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const aT = a.clock_in ? new Date(a.clock_in).getTime() : 0;
      const bT = b.clock_in ? new Date(b.clock_in).getTime() : 0;
      return aT - bT;
    });
    let cumulative = 0;
    for (const t of group) {
      const minutes = billableMinutes(t);
      const regular = Math.max(0, Math.min(minutes, OT_THRESHOLD - cumulative));
      const ot      = minutes - regular;
      cumulative   += minutes;
      const laborCents = toCents((regular / 60) * Number(rateSet.technician_rate))
                       + toCents((ot      / 60) * Number(rateSet.technician_ot_rate));
      result.set(t.id, { regularMinutes: regular, otMinutes: ot, laborCents });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. Trip — once per workorder (one trip per site visit)
// ---------------------------------------------------------------------------

function computeTripCents(record, rateSet) {
  if (Number(rateSet.trip_flat) > 0) return rateCents(rateSet.trip_flat);
  if (Number(rateSet.trip_per_mile) > 0) {
    return toCents(Number(record.miles || 0) * Number(rateSet.trip_per_mile));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 3. Material charges per task type
// ---------------------------------------------------------------------------

async function computeCylinderCharge(taskId, rateSet) {
  if (Number(rateSet.cylinder_rate) === 0) return { qty: 0, cents: 0 };
  const { data } = await supabase.from('wp1_data').select('cylinders').eq('task_id', taskId).single();
  if (!data?.cylinders) return { qty: 0, cents: 0 };
  const sets = Array.isArray(data.cylinders) ? data.cylinders : [];
  const total = sets.reduce((s, set) => s + Number(set.qty ?? set.specimen_qty ?? set.count ?? 0), 0);
  return { qty: total, cents: toCents(total * Number(rateSet.cylinder_rate)) };
}

async function computeProctorCharges(taskId, rateSet) {
  const result = {
    proctors:  { qty: 0, cents: 0 },
    atterberg: { qty: 0, cents: 0 },
    sieve200:  { qty: 0, cents: 0 },
  };
  const { data } = await supabase
    .from('proctor_data')
    .select('opt_moisture_pct, max_dry_density_pcf, plasticity_index, passing200')
    .eq('task_id', taskId)
    .single();
  if (!data) return result;

  if (data.opt_moisture_pct != null && data.max_dry_density_pcf != null) {
    result.proctors = { qty: 1, cents: rateCents(rateSet.proctor_rate) };
  }
  if (data.plasticity_index != null && data.plasticity_index !== '') {
    result.atterberg = { qty: 1, cents: rateCents(rateSet.atterberg_rate) };
  }
  const p200 = data.passing200;
  if (p200 && typeof p200 === 'object' && p200.result != null && p200.result !== '') {
    result.sieve200 = { qty: 1, cents: rateCents(rateSet.sieve200_rate) };
  }
  return result;
}

async function computeDensityCharge(taskId, rateSet) {
  const nucRate  = Number(rateSet.nuclear_gauge_rate);
  const testRate = Number(rateSet.density_test_rate);

  if (nucRate > 0 && testRate > 0) {
    throw new Error('Both nuclear_gauge_rate and density_test_rate are set — fix project rates before generating invoice.');
  }
  if (nucRate === 0 && testRate === 0) {
    return { qty: 0, cents: 0, warning: 'No density rate configured.' };
  }
  if (nucRate > 0) {
    return { qty: 1, cents: rateCents(nucRate) };
  }
  const { data } = await supabase.from('density_reports').select('test_rows').eq('task_id', taskId).single();
  if (!data?.test_rows) return { qty: 0, cents: 0 };
  const rows = Array.isArray(data.test_rows) ? data.test_rows : [];
  const billable = rows.filter(r => {
    const loc = r.testLocation || r.test_location;
    return typeof loc === 'string' && loc.trim() !== '';
  });
  return { qty: billable.length, cents: toCents(billable.length * testRate) };
}

// ---------------------------------------------------------------------------
// 4. Full invoice generation for one or more workorders
// ---------------------------------------------------------------------------

/**
 * Generate invoice line items for a list of workorder IDs.
 * Returns { lines, subtotalCents, warnings } — caller persists to DB.
 *
 * Clock data source priority:
 *   1. workorder.clock_in/clock_out (new dispatch model)
 *   2. task.clock_in/clock_out (legacy backward compat)
 */
// Material types that are per-unit and should be consolidated across tasks in one invoice
const CONSOLIDATE_TYPES = new Set(['cylinder', 'proctor', 'atterberg', 'sieve200', 'density_test']);

const CONSOLIDATED_DESC = {
  cylinder:     qty => `Cylinder breaks (${qty})`,
  proctor:      qty => qty > 1 ? `Proctor compaction tests (${qty})` : 'Proctor compaction test (1)',
  atterberg:    qty => qty > 1 ? `Atterberg limits / PI (${qty})` : 'Atterberg limits / PI (1)',
  sieve200:     qty => qty > 1 ? `#200 sieve wash (${qty})` : '#200 sieve wash (1)',
  density_test: qty => `Density tests (${qty})`,
};

async function generateInvoiceLines(workorderIds, rateSet) {
  const warnings = [];

  // Load workorders to get dispatch (clock) data
  const { data: invoiceWorkorders, error: woErr } = await supabase
    .from('workorders')
    .select('id, assigned_technician_id, clock_in, clock_out, break_minutes, miles, scheduled_date')
    .in('id', workorderIds);

  if (woErr) throw new Error('Failed to load workorders: ' + woErr.message);

  // Tasks belonging to these workorders
  const { data: invoiceTasks, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .in('workorder_id', workorderIds);

  if (tErr) throw new Error('Failed to load tasks: ' + tErr.message);
  if (!invoiceTasks?.length) {
    warnings.push(`No tasks are linked to workorder(s) [${workorderIds.join(', ')}]. Open the task, edit it, and select this workorder from the Workorder dropdown.`);
    return { lines: [], subtotalCents: 0, warnings };
  }

  const woMap = new Map((invoiceWorkorders || []).map(w => [w.id, w]));

  // Build dispatch records: one per clocked workorder, or fall back to task-level clock (legacy)
  const dispatchRecords = [];
  const woDispatchSeen  = new Set();

  for (const task of invoiceTasks) {
    const wo = woMap.get(task.workorder_id);
    if (wo && wo.clock_in) {
      // Workorder-level clock (new model) — one dispatch per workorder
      if (!woDispatchSeen.has(wo.id)) {
        woDispatchSeen.add(wo.id);
        dispatchRecords.push({
          _woId:                  wo.id,
          _taskId:                null,
          assigned_technician_id: wo.assigned_technician_id || task.assigned_technician_id,
          clock_in:               wo.clock_in,
          clock_out:              wo.clock_out,
          break_minutes:          wo.break_minutes || 0,
          miles:                  wo.miles,
          scheduled_date:         wo.scheduled_date,
        });
      }
    } else if (task.clock_in) {
      // Legacy: task has its own clock data
      dispatchRecords.push({
        _woId:                  null,
        _taskId:                task.id,
        assigned_technician_id: task.assigned_technician_id,
        clock_in:               task.clock_in,
        clock_out:              task.clock_out,
        break_minutes:          task.break_minutes || 0,
        miles:                  task.miles,
        scheduled_date:         task.scheduled_start_date,
      });
    }
  }

  if (!dispatchRecords.length) {
    const noClockWos = (invoiceWorkorders || []).filter(w => !w.clock_in).length;
    warnings.push(`Found ${invoiceTasks.length} task(s) on these workorders but ${noClockWos} workorder(s) have no clock-in time. Technician must clock in via the Workorder Details screen before billing can be calculated.`);
    return { lines: [], subtotalCents: 0, warnings };
  }

  // Collect (technician_id, date) pairs for OT accuracy
  function dispatchDate(d) {
    if (d.clock_in) return d.clock_in.slice(0, 10);
    return d.scheduled_date || null;
  }

  const techDateKeys = new Set(
    dispatchRecords.map(d => `${d.assigned_technician_id}|${dispatchDate(d)}`)
  );

  const techIds = [...new Set(dispatchRecords.map(d => d.assigned_technician_id).filter(Boolean))];

  // Load ALL workorders for those tech+date combos for correct OT split
  const { data: allWoForTechs } = await supabase
    .from('workorders')
    .select('id, assigned_technician_id, clock_in, clock_out, break_minutes, scheduled_date')
    .in('assigned_technician_id', techIds)
    .not('clock_in', 'is', null);

  // Also load tasks with their own clocks for legacy backward compat
  const { data: allTasksForTechs } = await supabase
    .from('tasks')
    .select('id, workorder_id, assigned_technician_id, clock_in, clock_out, break_minutes, scheduled_start_date')
    .in('assigned_technician_id', techIds)
    .not('clock_in', 'is', null);

  // Build relevantDayDispatches for OT computation
  const relevantDayDispatches = [];
  const seenWoForOT = new Set();
  const woIdsWithClock = new Set((allWoForTechs || []).filter(w => w.clock_in).map(w => w.id));

  for (const w of (allWoForTechs || [])) {
    const date = w.clock_in ? w.clock_in.slice(0, 10) : w.scheduled_date;
    const key  = `${w.assigned_technician_id}|${date}`;
    if (techDateKeys.has(key) && !seenWoForOT.has(w.id)) {
      seenWoForOT.add(w.id);
      relevantDayDispatches.push({
        assigned_technician_id: w.assigned_technician_id,
        clock_in:      w.clock_in,
        clock_out:     w.clock_out,
        break_minutes: w.break_minutes || 0,
        scheduled_date: w.scheduled_date,
      });
    }
  }

  // Task-level clocks — only for tasks whose workorders have no clock (legacy)
  for (const t of (allTasksForTechs || [])) {
    if (t.workorder_id && woIdsWithClock.has(t.workorder_id)) continue;
    const date = t.clock_in ? t.clock_in.slice(0, 10) : t.scheduled_start_date;
    const key  = `${t.assigned_technician_id}|${date}`;
    if (techDateKeys.has(key)) {
      relevantDayDispatches.push({
        assigned_technician_id: t.assigned_technician_id,
        clock_in:      t.clock_in,
        clock_out:     t.clock_out,
        break_minutes: t.break_minutes || 0,
        scheduled_date: t.scheduled_start_date,
      });
    }
  }

  // Interval-merge labor per (tech, date) — correct OT even when dispatches overlap
  const dayLaborMap = computeDayLabor(relevantDayDispatches);

  // Build laborByDay for line emission
  const laborByDay = new Map();
  for (const d of dispatchRecords) {
    const date = dispatchDate(d);
    const key  = `${d.assigned_technician_id}|${date}`;
    if (!laborByDay.has(key) && dayLaborMap.has(key)) {
      const { regularMinutes, otMinutes } = dayLaborMap.get(key);
      const firstTask = invoiceTasks.find(t =>
        d._woId ? t.workorder_id === d._woId : t.id === d._taskId
      );
      laborByDay.set(key, { regularMinutes, otMinutes, firstTaskId: firstTask?.id, date });
    }
  }

  const perDayLines     = []; // trip, nuclear_day — one per occurrence
  const materialBuckets = new Map();
  const tripBilled      = new Set();

  // Trip: one per workorder dispatch (deduped by workorder id or tech+date for legacy)
  for (const d of dispatchRecords) {
    const date    = dispatchDate(d);
    const tripKey = d._woId ? `wo:${d._woId}` : `${d.assigned_technician_id}|${date}`;

    if (!tripBilled.has(tripKey)) {
      const tripCents = computeTripCents(d, rateSet);
      if (tripCents > 0) {
        const miles = d.miles;
        const desc = Number(rateSet.trip_flat) > 0
          ? `Trip charge — ${date}`
          : `Trip charge (${miles} mi) — ${date}`;
        const firstTask = invoiceTasks.find(t =>
          d._woId ? t.workorder_id === d._woId : t.id === d._taskId
        );
        perDayLines.push({
          sourceType:    'trip',
          sourceRefId:   firstTask?.id,
          description:   desc,
          qty:           Number(rateSet.trip_flat) > 0 ? 1 : Number(miles || 0),
          unitRateCents: Number(rateSet.trip_flat) > 0
            ? rateCents(rateSet.trip_flat)
            : rateCents(rateSet.trip_per_mile),
          amountCents:   tripCents,
        });
      }
      tripBilled.add(tripKey);
    }
  }

  // Material charges — still per task
  for (const task of invoiceTasks) {
    const date = taskDate(task);
    const type = task.task_type;

    if (type === 'COMPRESSIVE_STRENGTH' || type === 'CYLINDER_PICKUP') {
      try {
        const { qty, cents } = await computeCylinderCharge(task.id, rateSet);
        if (qty > 0) accumulateMaterial(materialBuckets, 'cylinder', task.id, qty, rateCents(rateSet.cylinder_rate), cents);
      } catch (e) { warnings.push(`Task ${task.id}: ${e.message}`); }
    }

    if (type === 'PROCTOR') {
      try {
        const charges = await computeProctorCharges(task.id, rateSet);
        if (charges.proctors.qty  > 0) accumulateMaterial(materialBuckets, 'proctor',  task.id, charges.proctors.qty,  rateCents(rateSet.proctor_rate),   charges.proctors.cents);
        if (charges.atterberg.qty > 0) accumulateMaterial(materialBuckets, 'atterberg', task.id, charges.atterberg.qty, rateCents(rateSet.atterberg_rate), charges.atterberg.cents);
        if (charges.sieve200.qty  > 0) accumulateMaterial(materialBuckets, 'sieve200',  task.id, charges.sieve200.qty,  rateCents(rateSet.sieve200_rate),   charges.sieve200.cents);
      } catch (e) { warnings.push(`Task ${task.id}: ${e.message}`); }
    }

    if (type === 'DENSITY_MEASUREMENT') {
      try {
        const charge = await computeDensityCharge(task.id, rateSet);
        if (charge.warning) warnings.push(`Task ${task.id}: ${charge.warning}`);
        if (charge.qty > 0) {
          const isNuclear = Number(rateSet.nuclear_gauge_rate) > 0;
          if (isNuclear) {
            perDayLines.push({
              sourceType:    'nuclear_day',
              sourceRefId:   task.id,
              description:   `Nuclear gauge — ${date}`,
              qty:           charge.qty,
              unitRateCents: rateCents(rateSet.nuclear_gauge_rate),
              amountCents:   charge.cents,
            });
          } else {
            accumulateMaterial(materialBuckets, 'density_test', task.id, charge.qty, rateCents(rateSet.density_test_rate), charge.cents);
          }
        }
      } catch (e) {
        if (e.message.includes('Both nuclear_gauge_rate')) throw e;
        warnings.push(`Task ${task.id}: ${e.message}`);
      }
    }
    // REBAR: no material charge
  }

  // ---------------------------------------------------------------------------
  // Build output lines: labor first, then trip/day, then consolidated materials
  // ---------------------------------------------------------------------------
  const lines = [];

  // Consolidated labor — one regular + one OT line per tech per day
  for (const ld of laborByDay.values()) {
    if (ld.regularMinutes > 0) {
      lines.push({
        sourceType:    'tech_time',
        sourceRefId:   ld.firstTaskId,
        description:   `Technician — ${ld.date}`,
        qty:           +(ld.regularMinutes / 60).toFixed(4),
        unitRateCents: rateCents(rateSet.technician_rate),
        amountCents:   toCents((ld.regularMinutes / 60) * Number(rateSet.technician_rate)),
      });
    }
    if (ld.otMinutes > 0) {
      lines.push({
        sourceType:    'tech_ot',
        sourceRefId:   ld.firstTaskId,
        description:   `Technician OT — ${ld.date}`,
        qty:           +(ld.otMinutes / 60).toFixed(4),
        unitRateCents: rateCents(rateSet.technician_ot_rate),
        amountCents:   toCents((ld.otMinutes / 60) * Number(rateSet.technician_ot_rate)),
      });
    }
  }

  // Trip + nuclear day (per-occurrence)
  lines.push(...perDayLines);

  // Consolidated per-unit materials
  for (const [type, bucket] of materialBuckets) {
    if (bucket.qty > 0) {
      bucket.description = CONSOLIDATED_DESC[type]?.(bucket.qty) ?? bucket.description;
      lines.push(bucket);
    }
  }

  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  return { lines, subtotalCents, warnings };
}

function accumulateMaterial(buckets, sourceType, taskId, qty, unitRateCents, amountCents) {
  if (!buckets.has(sourceType)) {
    buckets.set(sourceType, { sourceType, sourceRefId: taskId, description: '', qty: 0, unitRateCents, amountCents: 0 });
  }
  const b = buckets.get(sourceType);
  b.qty         += qty;
  b.amountCents += amountCents;
}

// ---------------------------------------------------------------------------
// 5. Live financial summary (no DB write)
// ---------------------------------------------------------------------------

async function projectFinancialSummary(projectId, tenantId) {
  const { data: workorders } = await supabase
    .from('workorders')
    .select('id, workorder_number, description, billing_status, status')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId);

  const rateSet = await currentRateSet(projectId, tenantId);
  const warnings = [];

  if (!rateSet) {
    warnings.push('No rate set configured for this project. Go to the Rates tab to create one.');
  }

  if (!workorders || !rateSet) {
    return { billedCents: 0, wipCents: 0, unbilledWorkorders: workorders || [], wipLines: [], warnings };
  }

  const unbilledIds = workorders
    .filter(w => w.billing_status === 'unbilled')
    .map(w => w.id);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_cents')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .in('status', ['approved', 'pushed']);

  const billedCents = (invoices || []).reduce((s, i) => s + (i.total_cents || 0), 0);

  let wipCents = 0;
  let wipLines = [];
  if (unbilledIds.length > 0) {
    try {
      const result = await generateInvoiceLines(unbilledIds, rateSet);
      wipCents = result.subtotalCents;
      wipLines = result.lines;
      if (result.warnings.length) warnings.push(...result.warnings);
    } catch (e) {
      warnings.push('Error computing WIP: ' + e.message);
    }
  } else {
    warnings.push('No unbilled workorders found.');
  }

  return {
    billedCents,
    wipCents,
    rateSetVersion: rateSet.version,
    unbilledWorkorders: workorders.filter(w => w.billing_status === 'unbilled'),
    wipLines,
    warnings,
  };
}

async function currentRateSet(projectId, tenantId) {
  const { data } = await supabase
    .from('rate_sets')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

module.exports = {
  generateInvoiceLines,
  projectFinancialSummary,
  currentRateSet,
  computeDayLabor,
  mergeIntervalsToMinutes,
  computeLaborSplit,
  billableMinutes,
  toCents,
};
