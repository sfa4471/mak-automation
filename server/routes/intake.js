'use strict';

/**
 * Intake routes — receives inbound job-request emails via SendGrid inbound parse
 * and provides admin CRUD for the resulting draft workorders.
 *
 * Webhook:   POST /api/intake/email   (unauthenticated; verified by token)
 * Admin API: GET/PUT/POST under /api/intake/drafts/:id  (authenticated)
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { supabase } = require('../db/supabase');
const { authenticate, requireAdminOrPm } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { extractJobFromEmail, fuzzyMatchProject, shouldAutoAccept } = require('../services/intakeParserService');
const { extractSpecsFromDocuments } = require('../services/specExtractionService');
const { captureCorrections, getCorrectionRate, getOutcomeStats } = require('../services/correctionService');

// Multer: memory storage for SendGrid multipart (attachments arrive as uploaded files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verifyWebhookToken(req) {
  const secret = process.env.SENDGRID_INBOUND_PARSE_SECRET;
  if (!secret) return true; // not configured — allow all (dev)
  return req.query.token === secret;
}

/** Parse the "to" field to extract the first email address. */
function extractToAddress(toField) {
  if (!toField) return null;
  const match = toField.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

/** Find tenant_id by looking up app_settings where key='intake_forward_address' */
async function findTenantByIntakeAddress(toEmail) {
  if (!toEmail) return null;
  const { data } = await supabase
    .from('app_settings')
    .select('tenant_id, value')
    .eq('key', 'intake_forward_address')
    .ilike('value', toEmail)
    .maybeSingle();
  return data ? data.tenant_id : null;
}

// ---------------------------------------------------------------------------
// POST /api/intake/email — SendGrid inbound parse webhook
// ---------------------------------------------------------------------------
router.post('/email', upload.any(), async (req, res) => {
  if (!verifyWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // SendGrid sends form fields in req.body and files in req.files
  const fromEmail = req.body.from || '';
  const toField = req.body.to || '';
  const subject = req.body.subject || '';
  const emailBody = req.body.text || req.body.html || '';

  const toEmail = extractToAddress(toField);
  const tenantId = await findTenantByIntakeAddress(toEmail);

  if (!tenantId) {
    // No matching tenant — silently accept (200) so SendGrid doesn't retry
    console.log('[intake] No tenant matched to-address:', toEmail);
    return res.json({ ok: true, skipped: true });
  }

  // Dedup key: from+subject+date (prevents re-processing forwarded chains)
  const dedupeKey = `${fromEmail}|${subject}`.slice(0, 255);

  // Collect PDF buffers from attachments
  const pdfBuffers = (req.files || [])
    .filter(f => f.mimetype === 'application/pdf')
    .map(f => f.buffer);

  const attachedDocTypes = pdfBuffers.length > 0 ? ['pdf'] : [];

  try {
    // Parse email + extract specs concurrently (pass tenantId for few-shot injection)
    const [parsed, specResult] = await Promise.all([
      extractJobFromEmail(emailBody || subject, tenantId).catch(err => {
        console.error('[intake] extractJobFromEmail error:', err.message);
        return null;
      }),
      pdfBuffers.length > 0
        ? extractSpecsFromDocuments(pdfBuffers, tenantId).catch(err => {
            console.error('[intake] extractSpecsFromDocuments error:', err.message);
            return null;
          })
        : Promise.resolve(null),
    ]);

    // Fuzzy-match project
    const matchResult = parsed?.projectNameRaw
      ? await fuzzyMatchProject(parsed.projectNameRaw, tenantId).catch(() => null)
      : null;

    // Requester email: prefer extracted value, fall back to the from field
    const rawFromEmail = fromEmail.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || null;
    const requesterEmail = parsed?.requesterEmail || rawFromEmail;

    const insertRow = {
      tenant_id: tenantId,
      status: 'pending_review',
      raw_source: (emailBody || subject).slice(0, 10000),
      source_type: 'email',
      parsed_project_id: matchResult?.projectId ?? null,
      parsed_project_name_raw: parsed?.projectNameRaw ?? null,
      parsed_scheduled_date: parsed?.scheduledDate ?? null,
      parsed_test_types: parsed?.testTypes ?? [],
      parsed_site_location: parsed?.siteLocation ?? null,
      parsed_requester_email: requesterEmail,
      extraction_json: parsed ?? null,
      project_match_score: matchResult?.score ?? null,
      parsed_soil_specs: specResult?.soilSpecs ?? null,
      parsed_concrete_specs: specResult?.concreteSpecs ?? null,
      spec_extraction_json: specResult ?? null,
      attached_doc_types: attachedDocTypes,
      spec_conflicts: specResult?.conflicts ?? null,
      dedup_key: dedupeKey,
    };

    const { data: inserted, error } = await supabase
      .from('draft_workorders')
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Dedup — already processed this email
        return res.json({ ok: true, skipped: 'dedup' });
      }
      console.error('[intake] Insert draft error:', error.message);
      return res.json({ ok: true });
    }

    // Phase 7: auto-accept if confidence thresholds are met
    const autoAccept = await shouldAutoAccept(inserted, tenantId).catch(() => false);
    if (autoAccept) {
      try {
        const { count } = await supabase
          .from('workorders')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);

        const workorderNumber = `WO-${String((count || 0) + 1).padStart(4, '0')}`;

        const { data: wo } = await supabase
          .from('workorders')
          .insert({
            tenant_id: tenantId,
            project_id: inserted.parsed_project_id,
            workorder_number: workorderNumber,
            status: 'open',
            billing_status: 'unbilled',
            scheduled_date: inserted.parsed_scheduled_date ?? null,
            site_location: inserted.parsed_site_location ?? null,
            description: inserted.parsed_test_types?.length
              ? `Auto-intake: ${inserted.parsed_test_types.join(', ')}`
              : 'From auto-intake',
          })
          .select()
          .single();

        if (wo) {
          await supabase
            .from('draft_workorders')
            .update({
              status: 'accepted',
              auto_accepted: true,
              created_workorder_id: wo.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', inserted.id);

          console.log(`[intake] Auto-accepted draft ${inserted.id} → WO ${workorderNumber}`);
        }
      } catch (autoErr) {
        console.error('[intake] Auto-accept failed (non-fatal):', autoErr.message);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[intake] Webhook error:', err.message);
    return res.json({ ok: true, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// All routes below require admin/PM auth
// ---------------------------------------------------------------------------

// GET /api/intake/drafts — list pending_review drafts for the tenant
router.get('/drafts', authenticate, requireTenant, requireAdminOrPm, async (req, res) => {
  const { data, error } = await supabase
    .from('draft_workorders')
    .select('*')
    .eq('tenant_id', req.tenantId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// PUT /api/intake/drafts/:id — admin edits scheduling or spec fields
router.put('/drafts/:id', authenticate, requireTenant, requireAdminOrPm, async (req, res) => {
  const { id } = req.params;
  const allowed = [
    'parsed_project_id',
    'parsed_project_name_raw',
    'parsed_scheduled_date',
    'parsed_test_types',
    'parsed_site_location',
    'parsed_requester_email',
    'parsed_soil_specs',
    'parsed_concrete_specs',
  ];

  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('draft_workorders')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', req.tenantId)
    .eq('status', 'pending_review')
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Draft not found' });
  return res.json(data);
});

// POST /api/intake/drafts/:id/accept — create workorder, optionally apply specs
router.post('/drafts/:id/accept', authenticate, requireTenant, requireAdminOrPm, async (req, res) => {
  const { id } = req.params;
  const { applySpecs = false } = req.body;

  // Load the draft
  const { data: draft, error: draftErr } = await supabase
    .from('draft_workorders')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.tenantId)
    .eq('status', 'pending_review')
    .single();

  if (draftErr || !draft) return res.status(404).json({ error: 'Draft not found' });

  const projectId = draft.parsed_project_id;
  if (!projectId) {
    return res.status(422).json({ error: 'Draft must have a matched project before accepting' });
  }

  // Generate workorder number
  const { count } = await supabase
    .from('workorders')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', req.tenantId);

  const workorderNumber = `WO-${String((count || 0) + 1).padStart(4, '0')}`;

  // Create the workorder
  const { data: workorder, error: woErr } = await supabase
    .from('workorders')
    .insert({
      tenant_id: req.tenantId,
      project_id: projectId,
      workorder_number: workorderNumber,
      status: 'open',
      billing_status: 'unbilled',
      scheduled_date: draft.parsed_scheduled_date ?? null,
      site_location: draft.parsed_site_location ?? null,
      description: draft.parsed_test_types?.length
        ? `Intake: ${draft.parsed_test_types.join(', ')}`
        : 'From intake',
    })
    .select()
    .single();

  if (woErr) return res.status(500).json({ error: woErr.message });

  // Optionally apply extracted specs to the project (merge, not overwrite)
  let specsApplied = false;
  if (applySpecs && (draft.parsed_soil_specs || draft.parsed_concrete_specs)) {
    const { data: project } = await supabase
      .from('projects')
      .select('soil_specs, concrete_specs')
      .eq('id', projectId)
      .eq('tenant_id', req.tenantId)
      .single();

    if (project) {
      const mergedSoil = { ...(project.soil_specs || {}), ...(draft.parsed_soil_specs || {}) };
      const mergedConcrete = { ...(project.concrete_specs || {}), ...(draft.parsed_concrete_specs || {}) };

      await supabase
        .from('projects')
        .update({ soil_specs: mergedSoil, concrete_specs: mergedConcrete })
        .eq('id', projectId)
        .eq('tenant_id', req.tenantId);

      specsApplied = true;
    }
  }

  // Mark draft accepted
  await supabase
    .from('draft_workorders')
    .update({
      status: 'accepted',
      reviewed_by_user_id: req.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      created_workorder_id: workorder.id,
      specs_applied: specsApplied,
    })
    .eq('id', id);

  // Phase 8: capture any corrections the human made before accepting (fire-and-forget)
  captureCorrections(Number(id), req.tenantId, draft)
    .catch(err => console.error('[correctionCapture] accept error:', err));

  return res.json({ ok: true, workorderId: workorder.id, workorderNumber, specsApplied });
});

// GET /api/intake/calibration — accuracy stats for deciding whether to enable Tier 2
router.get('/calibration', authenticate, requireTenant, requireAdminOrPm, async (req, res) => {
  const { data: drafts, error } = await supabase
    .from('draft_workorders')
    .select('status, auto_accepted, project_match_score, parsed_project_id, parsed_scheduled_date, created_workorder_id')
    .eq('tenant_id', req.tenantId);

  if (error) return res.status(500).json({ error: error.message });

  const all = drafts || [];
  const accepted = all.filter(d => d.status === 'accepted');
  const autoAccepted = accepted.filter(d => d.auto_accepted);

  // Compare parsed values with what was actually committed (via the linked workorder)
  let projectAccurate = 0;
  let dateAccurate    = 0;
  const woIds = accepted.map(d => d.created_workorder_id).filter(Boolean);

  if (woIds.length > 0) {
    const { data: wos } = await supabase
      .from('workorders')
      .select('id, project_id, scheduled_date')
      .in('id', woIds);
    const woMap = new Map((wos || []).map(w => [w.id, w]));

    for (const draft of accepted) {
      const wo = woMap.get(draft.created_workorder_id);
      if (!wo) continue;
      if (draft.parsed_project_id === wo.project_id) projectAccurate++;
      if (draft.parsed_scheduled_date === wo.scheduled_date) dateAccurate++;
    }
  }

  const scores = accepted
    .map(d => d.project_match_score)
    .filter(s => s != null)
    .map(Number);

  // Phase 8: rolling correction rate + Phase 9: outcome stats
  const [correctionRate, outcomeStats] = await Promise.all([
    getCorrectionRate(req.tenantId).catch(() => null),
    getOutcomeStats(req.tenantId).catch(() => null),
  ]);

  res.json({
    total: all.length,
    accepted: accepted.length,
    rejected: all.filter(d => d.status === 'rejected').length,
    pendingReview: all.filter(d => d.status === 'pending_review').length,
    autoAccepted: autoAccepted.length,
    humanReviewed: accepted.length - autoAccepted.length,
    projectMatchAccuracy: accepted.length > 0
      ? Math.round((projectAccurate / accepted.length) * 1000) / 10
      : null,
    dateMatchAccuracy: accepted.length > 0
      ? Math.round((dateAccurate / accepted.length) * 1000) / 10
      : null,
    avgMatchScore: scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
      : null,
    correctionRate: correctionRate != null ? Math.round(correctionRate * 1000) / 10 : null,
    circuitBreakerActive: correctionRate != null && correctionRate > 0.20,
    outcomeStats,
  });
});

// POST /api/intake/drafts/:id/reject — dismiss draft
router.post('/drafts/:id/reject', authenticate, requireTenant, requireAdminOrPm, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('draft_workorders')
    .update({
      status: 'rejected',
      reviewed_by_user_id: req.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', req.tenantId)
    .eq('status', 'pending_review');

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

module.exports = router;
