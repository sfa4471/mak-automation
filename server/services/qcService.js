'use strict';

const { supabase } = require('../db/supabase');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/** Minimum numeric spec from a dens_specs array or legacy dens_spec_percent string. */
function minDensitySpec(report) {
  const arr = Array.isArray(report.dens_specs) ? report.dens_specs : null;
  if (arr && arr.length > 0) {
    const nums = arr.map(parseNum).filter(n => n != null);
    return nums.length > 0 ? Math.min(...nums) : null;
  }
  return parseNum(report.dens_spec_percent);
}

// ---------------------------------------------------------------------------
// Per-type QC functions
// ---------------------------------------------------------------------------

async function checkDensity(taskId) {
  const { data: report } = await supabase
    .from('density_reports')
    .select('dens_spec_percent, dens_specs, test_rows')
    .eq('task_id', taskId)
    .single();

  if (!report) return { status: 'SKIPPED', flags: [], note: 'No density report found for task' };

  const specMin = minDensitySpec(report);
  if (specMin == null) return { status: 'SKIPPED', flags: [], note: 'No density spec configured on report' };

  const rows = Array.isArray(report.test_rows) ? report.test_rows : [];
  const dataRows = rows.filter(r => r.type !== 'section');
  if (dataRows.length === 0) return { status: 'SKIPPED', flags: [], note: 'No test rows found' };

  const flags = [];
  for (const row of dataRows) {
    const pct = parseNum(row.percent_proctor_density ?? row.percentProctorDensity);
    if (pct == null) continue;
    const testNo = row.test_no ?? row.testNo;
    const location = row.test_location ?? row.testLocation ?? null;
    if (pct < specMin) {
      flags.push({
        testNo,
        location,
        measured: pct,
        spec: specMin,
        message: `Test #${testNo}: ${pct}% < ${specMin}% spec`,
      });
    }
  }

  if (flags.length > 0) return { status: 'FAIL', flags };
  return { status: 'PASS', flags: [] };
}

async function checkCompressiveStrength(taskId) {
  const { data: wp1 } = await supabase
    .from('wp1_data')
    .select('spec_strength, spec_strength_days, cylinders')
    .eq('task_id', taskId)
    .single();

  if (!wp1) return { status: 'SKIPPED', flags: [], note: 'No cylinder data found for task' };

  const specStrength = parseNum(wp1.spec_strength);
  if (specStrength == null) return { status: 'SKIPPED', flags: [], note: 'No spec strength configured on report' };

  const complianceDays = wp1.spec_strength_days ?? 28;
  const cylinders = Array.isArray(wp1.cylinders) ? wp1.cylinders : [];

  // Only evaluate cylinders at the compliance break age
  const complianceCyls = cylinders.filter(c => {
    const age = parseNum(c.ageDays);
    return age != null && age === complianceDays;
  });

  if (complianceCyls.length === 0) {
    // Breaks haven't happened yet — not a failure, just pending
    return {
      status: 'ATTENTION',
      flags: [],
      note: `No ${complianceDays}-day break results recorded yet`,
    };
  }

  const flags = [];
  for (const cyl of complianceCyls) {
    const strength = parseNum(cyl.compressiveStrength);
    if (strength == null) continue;
    if (strength < specStrength) {
      flags.push({
        cylNo: cyl.cylNo || cyl.cyl_no || null,
        measured: strength,
        spec: specStrength,
        ageDays: complianceDays,
        message: `Cylinder ${cyl.cylNo || cyl.cyl_no || '?'}: ${strength} psi < ${specStrength} psi at ${complianceDays} days`,
      });
    }
  }

  if (flags.length > 0) return { status: 'FAIL', flags };
  return { status: 'PASS', flags: [] };
}

async function checkProctor(taskId) {
  const { data: pd } = await supabase
    .from('proctor_data')
    .select('opt_moisture_pct, max_dry_density_pcf')
    .eq('task_id', taskId)
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (!pd) return { status: 'SKIPPED', flags: [], note: 'No proctor data found for task' };

  const flags = [];
  if (pd.opt_moisture_pct == null) {
    flags.push({ field: 'opt_moisture_pct', message: 'Optimum moisture % is missing' });
  }
  if (pd.max_dry_density_pcf == null) {
    flags.push({ field: 'max_dry_density_pcf', message: 'Max dry density (pcf) is missing' });
  }

  if (flags.length > 0) return { status: 'ATTENTION', flags };
  return { status: 'PASS', flags: [] };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run a QC spec check for a task that has just reached READY_FOR_REVIEW.
 * Returns { status, flags, note? } — never throws (caller fire-and-forgets).
 *
 * status: 'PASS' | 'FAIL' | 'ATTENTION' | 'SKIPPED'
 *   PASS      — all measurements meet spec
 *   FAIL      — at least one measurement is below spec
 *   ATTENTION — incomplete data or pending breaks (not a hard failure)
 *   SKIPPED   — no spec configured; cannot evaluate
 */
async function runQcCheck(taskId, taskType, tenantId) {
  try {
    switch (taskType) {
      case 'DENSITY_MEASUREMENT':
        return await checkDensity(taskId);

      case 'COMPRESSIVE_STRENGTH':
      case 'CYLINDER_PICKUP':
        return await checkCompressiveStrength(taskId);

      case 'PROCTOR':
        return await checkProctor(taskId);

      case 'REBAR':
        return { status: 'PASS', flags: [], note: 'No numeric spec for rebar' };

      default:
        return { status: 'SKIPPED', flags: [], note: `Unknown task type: ${taskType}` };
    }
  } catch (err) {
    console.error(`[qcService] Error checking task ${taskId}:`, err.message);
    return { status: 'SKIPPED', flags: [], note: `QC check error: ${err.message}` };
  }
}

module.exports = { runQcCheck };
