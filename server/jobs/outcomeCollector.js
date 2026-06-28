'use strict';

/**
 * Phase 9 — Outcome Collector
 *
 * Polls every 30 minutes for auto-accepted drafts whose workorders are now
 * complete/approved. Compares AI predictions vs actual workorder values and
 * stores outcome_signals. Once a tenant crosses OUTCOME_MIN_SAMPLES signals,
 * mismatches are fed back into intake_correction_examples so the next
 * extraction prompt benefits from real-world ground truth.
 *
 * Disable with: ENABLE_OUTCOME_COLLECTOR=false
 */

const { supabase } = require('../db/supabase');
const { captureCorrections } = require('../services/correctionService');

const POLL_INTERVAL_MS  = 30 * 60 * 1000; // 30 min
const OUTCOME_MIN_SAMPLES = 50;

async function collectOutcomes() {
  try {
    // All auto-accepted drafts that have a completed/approved workorder
    const { data: drafts } = await supabase
      .from('draft_workorders')
      .select(`
        id, tenant_id,
        parsed_project_id, parsed_scheduled_date, parsed_test_types,
        created_workorder_id,
        extraction_json, spec_extraction_json,
        raw_source, parsed_soil_specs, parsed_concrete_specs
      `)
      .eq('auto_accepted', true)
      .eq('status', 'accepted')
      .not('created_workorder_id', 'is', null);

    if (!drafts || drafts.length === 0) return;

    // Which drafts already have scheduling outcome signals?
    const draftIds = drafts.map(d => d.id);
    const { data: existingSignals } = await supabase
      .from('outcome_signals')
      .select('draft_workorder_id')
      .in('draft_workorder_id', draftIds)
      .eq('signal_type', 'project_match'); // one of the two we write per draft

    const alreadyProcessed = new Set((existingSignals || []).map(s => s.draft_workorder_id));
    const pending = drafts.filter(d => !alreadyProcessed.has(d.id));
    if (pending.length === 0) return;

    // Load workorders that are in a terminal state
    const woIds = pending.map(d => d.created_workorder_id);
    const { data: workorders } = await supabase
      .from('workorders')
      .select('id, project_id, scheduled_date, status')
      .in('id', woIds)
      .in('status', ['complete', 'approved']);

    if (!workorders || workorders.length === 0) return;
    const woMap = new Map(workorders.map(w => [w.id, w]));

    // Cache tenant sample counts to avoid repeated queries
    const tenantSampleCounts = new Map();

    for (const draft of pending) {
      const wo = woMap.get(draft.created_workorder_id);
      if (!wo) continue;

      const projectMatched = draft.parsed_project_id === wo.project_id;
      const dateMatched    = draft.parsed_scheduled_date === wo.scheduled_date;

      const signals = [
        {
          tenant_id:          draft.tenant_id,
          draft_workorder_id: draft.id,
          workorder_id:       wo.id,
          signal_type:        'project_match',
          predicted_value:    String(draft.parsed_project_id ?? ''),
          actual_value:       String(wo.project_id ?? ''),
          matched:            projectMatched,
        },
        {
          tenant_id:          draft.tenant_id,
          draft_workorder_id: draft.id,
          workorder_id:       wo.id,
          signal_type:        'date_match',
          predicted_value:    draft.parsed_scheduled_date ?? '',
          actual_value:       wo.scheduled_date ?? '',
          matched:            dateMatched,
        },
      ];

      await supabase.from('outcome_signals').insert(signals);

      // Phase 9 intervention: feed mismatches back into correction bank once enough data
      if (!tenantSampleCounts.has(draft.tenant_id)) {
        const { count } = await supabase
          .from('outcome_signals')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', draft.tenant_id);
        tenantSampleCounts.set(draft.tenant_id, count || 0);
      }

      const sampleCount = tenantSampleCounts.get(draft.tenant_id) || 0;
      if (sampleCount >= OUTCOME_MIN_SAMPLES && (!projectMatched || !dateMatched)) {
        // Build a synthetic "corrected" draft using actual workorder values as ground truth
        await captureCorrections(draft.id, draft.tenant_id, {
          ...draft,
          parsed_project_id:    wo.project_id,
          parsed_scheduled_date: wo.scheduled_date,
          // Keep spec fields as-is (no outcome signal for specs yet)
        }).catch(err => console.error('[outcomeCollector] captureCorrections error:', err));
      }

      tenantSampleCounts.set(draft.tenant_id, sampleCount + signals.length);
    }
  } catch (err) {
    console.error('[outcomeCollector] Poll error:', err.message);
  }
}

function startOutcomeCollector() {
  console.log('[outcomeCollector] Started — polling every 30 min (Phase 9, dormant until 50 signals/tenant)');
  collectOutcomes();
  setInterval(collectOutcomes, POLL_INTERVAL_MS);
}

module.exports = { startOutcomeCollector };
