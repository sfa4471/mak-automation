'use strict';

/**
 * Correction Service — Phase 8 + Phase 9 feedback loop.
 *
 * Phase 8: captureCorrections() stores human edits vs AI extraction.
 *          getRecentCorrections() + buildFewShot() inject them back into prompts.
 *          checkCircuitBreaker() suppresses Tier 2 if correction rate is too high.
 *
 * Phase 9: recordPeApprovalOutcome() stores PE approval signals.
 *          Outcome mismatches feed back into the same correction_examples table.
 */

const { supabase } = require('../db/supabase');

const CIRCUIT_BREAKER_THRESHOLD = 0.20; // 20% correction rate trips it
const CIRCUIT_BREAKER_WINDOW_DAYS = 7;
const MIN_SAMPLES_FOR_CIRCUIT = 5;       // need at least 5 corrections to matter
const OUTCOME_MIN_SAMPLES = 50;          // Phase 9 stays silent until this many outcomes

// ---------------------------------------------------------------------------
// Phase 8 — Correction Capture
// ---------------------------------------------------------------------------

/**
 * Compare AI extraction vs human-finalized draft values and store any deltas.
 * Called fire-and-forget when a human accepts a draft.
 *
 * @param {number} draftId
 * @param {number} tenantId
 * @param {object} draft  — full draft_workorders row (parsed_* fields already reflect human edits)
 */
async function captureCorrections(draftId, tenantId, draft) {
  const corrections = [];
  const ctx = (draft.raw_source || '').slice(0, 300);
  const aiExtraction = draft.extraction_json || {};
  const aiSpecs     = draft.spec_extraction_json || {};

  // Scheduling field comparisons: AI original (extraction_json) vs human final (parsed_*)
  const schedulingChecks = [
    { field: 'scheduledDate', aiValue: aiExtraction.scheduledDate ?? null,  humanValue: draft.parsed_scheduled_date ?? null },
    { field: 'siteLocation',  aiValue: aiExtraction.siteLocation  ?? null,  humanValue: draft.parsed_site_location  ?? null },
    { field: 'testTypes',     aiValue: JSON.stringify(aiExtraction.testTypes ?? []), humanValue: JSON.stringify(draft.parsed_test_types ?? []) },
  ];

  for (const check of schedulingChecks) {
    const aiStr    = String(check.aiValue    ?? '').trim();
    const humanStr = String(check.humanValue ?? '').trim();
    if (aiStr !== humanStr && humanStr !== '' && humanStr !== '[]') {
      corrections.push({
        tenant_id: tenantId,
        draft_id: draftId,
        correction_type: 'scheduling',
        field: check.field,
        ai_value:    check.aiValue    != null ? String(check.aiValue)    : null,
        human_value: check.humanValue != null ? String(check.humanValue) : null,
        context_snippet: ctx,
        source: 'human',
      });
    }
  }

  // Spec comparisons: AI spec extraction vs human-edited spec fields
  const aiSoilSpecs    = aiSpecs.soilSpecs     || {};
  const humanSoilSpecs = draft.parsed_soil_specs || {};
  for (const structType of new Set([...Object.keys(aiSoilSpecs), ...Object.keys(humanSoilSpecs)])) {
    const aiVal    = JSON.stringify(aiSoilSpecs[structType]    ?? null);
    const humanVal = JSON.stringify(humanSoilSpecs[structType] ?? null);
    if (aiVal !== humanVal) {
      corrections.push({
        tenant_id: tenantId, draft_id: draftId,
        correction_type: 'spec',
        field: `soil:${structType}`,
        ai_value: aiVal, human_value: humanVal,
        context_snippet: ctx, source: 'human',
      });
    }
  }

  const aiConcreteSpecs    = aiSpecs.concreteSpecs        || {};
  const humanConcreteSpecs = draft.parsed_concrete_specs   || {};
  for (const structType of new Set([...Object.keys(aiConcreteSpecs), ...Object.keys(humanConcreteSpecs)])) {
    const aiVal    = JSON.stringify(aiConcreteSpecs[structType]    ?? null);
    const humanVal = JSON.stringify(humanConcreteSpecs[structType] ?? null);
    if (aiVal !== humanVal) {
      corrections.push({
        tenant_id: tenantId, draft_id: draftId,
        correction_type: 'spec',
        field: `concrete:${structType}`,
        ai_value: aiVal, human_value: humanVal,
        context_snippet: ctx, source: 'human',
      });
    }
  }

  if (corrections.length === 0) return;
  await supabase.from('intake_correction_examples').insert(corrections);
}

// ---------------------------------------------------------------------------
// Phase 8 — Few-Shot Injection
// ---------------------------------------------------------------------------

async function getRecentSchedulingCorrections(tenantId, limit = 5) {
  const { data } = await supabase
    .from('intake_correction_examples')
    .select('field, ai_value, human_value, context_snippet')
    .eq('tenant_id', tenantId)
    .eq('correction_type', 'scheduling')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentSpecCorrections(tenantId, limit = 5) {
  const { data } = await supabase
    .from('intake_correction_examples')
    .select('field, ai_value, human_value')
    .eq('tenant_id', tenantId)
    .eq('correction_type', 'spec')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

/** Format scheduling corrections as a few-shot block for prompt injection. */
function buildSchedulingFewShot(corrections) {
  if (!corrections || corrections.length === 0) return '';
  const lines = corrections.map(c => {
    const ctx = c.context_snippet ? ` (context: "${c.context_snippet.slice(0, 80)}...")` : '';
    return `- Field "${c.field}": AI extracted ${JSON.stringify(c.ai_value)}, correct answer was ${JSON.stringify(c.human_value)}${ctx}`;
  });
  return `\nPAST CORRECTIONS FOR THIS TENANT — apply these learnings:\n${lines.join('\n')}\n`;
}

/** Format spec corrections as a few-shot block for prompt injection. */
function buildSpecFewShot(corrections) {
  if (!corrections || corrections.length === 0) return '';
  const lines = corrections.map(c =>
    `- "${c.field}": AI extracted ${c.ai_value}, correct value was ${c.human_value}`
  );
  return `\nPAST SPEC CORRECTIONS FOR THIS TENANT — apply these learnings:\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Phase 8 — Circuit Breaker
// ---------------------------------------------------------------------------

/**
 * Rolling correction rate for the past N days (0–1).
 * Returns 0 if not enough data.
 */
async function getCorrectionRate(tenantId, windowDays = CIRCUIT_BREAKER_WINDOW_DAYS) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [corrResult, acceptResult] = await Promise.all([
    supabase
      .from('intake_correction_examples')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source', 'human')
      .gte('created_at', since),
    supabase
      .from('draft_workorders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'accepted')
      .gte('reviewed_at', since),
  ]);

  const corrCount   = corrResult.count  || 0;
  const acceptCount = acceptResult.count || 0;

  if (acceptCount < MIN_SAMPLES_FOR_CIRCUIT) return 0;
  return corrCount / acceptCount;
}

/**
 * Returns true if auto-accept should be suppressed because too many recent corrections.
 */
async function checkCircuitBreaker(tenantId) {
  try {
    const rate = await getCorrectionRate(tenantId);
    if (rate > CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(`[correctionService] Circuit breaker tripped for tenant ${tenantId}: correction rate ${Math.round(rate * 100)}%`);
      return true;
    }
    return false;
  } catch {
    return false; // never block auto-accept on service failure
  }
}

// ---------------------------------------------------------------------------
// Phase 9 — Outcome Signals
// ---------------------------------------------------------------------------

/**
 * Record that a PE approved a task whose workorder came from an auto-accepted draft.
 * Fire-and-forget from tasks.js APPROVED transition.
 */
async function recordPeApprovalOutcome(taskId, tenantId) {
  const { data: task } = await supabase
    .from('tasks')
    .select('workorder_id')
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!task?.workorder_id) return;

  const { data: draft } = await supabase
    .from('draft_workorders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('created_workorder_id', task.workorder_id)
    .eq('auto_accepted', true)
    .maybeSingle();

  if (!draft) return;

  await supabase.from('outcome_signals').insert({
    tenant_id:          tenantId,
    draft_workorder_id: draft.id,
    workorder_id:       task.workorder_id,
    signal_type:        'pe_approved',
    matched:            true,
  });
}

/**
 * Outcome accuracy stats for calibration display.
 * Returns { total, matched, matchRate } or null if no data.
 */
async function getOutcomeStats(tenantId) {
  const { data } = await supabase
    .from('outcome_signals')
    .select('signal_type, matched')
    .eq('tenant_id', tenantId)
    .in('signal_type', ['project_match', 'date_match']);

  if (!data || data.length === 0) return null;

  const matched = data.filter(s => s.matched).length;
  return {
    total:     data.length,
    matched,
    matchRate: Math.round((matched / data.length) * 1000) / 10,
    dormant:   data.length < OUTCOME_MIN_SAMPLES,
    minSamples: OUTCOME_MIN_SAMPLES,
  };
}

module.exports = {
  captureCorrections,
  getRecentSchedulingCorrections,
  getRecentSpecCorrections,
  buildSchedulingFewShot,
  buildSpecFewShot,
  getCorrectionRate,
  checkCircuitBreaker,
  recordPeApprovalOutcome,
  getOutcomeStats,
};
