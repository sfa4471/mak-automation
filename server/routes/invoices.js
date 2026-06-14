'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { supabase, keysToCamelCase } = require('../db/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { generateInvoiceLines, currentRateSet, projectFinancialSummary } = require('../services/billingEngine');

const router = express.Router();
const auth      = [authenticate, requireTenant];
const adminAuth = [authenticate, requireTenant, requireAdmin];

function cc(obj) { return obj ? keysToCamelCase(obj) : obj; }

// ---------------------------------------------------------------------------
// GET /api/invoices?projectId=X
// ---------------------------------------------------------------------------
router.get('/', auth, [
  query('projectId').isInt().withMessage('projectId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_lines(*)')
      .eq('project_id', req.query.projectId)
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(cc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices/:id
// ---------------------------------------------------------------------------
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_lines(*), workorders(workorder_number, description)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Invoice not found' });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/invoices/financials/:projectId — live financial summary
// ---------------------------------------------------------------------------
router.get('/financials/:projectId', auth, async (req, res) => {
  try {
    const summary = await projectFinancialSummary(
      Number(req.params.projectId),
      req.tenantId,
    );
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/preview — compute line items without saving
// Body: { projectId, workorderIds: [id, ...] }
// ---------------------------------------------------------------------------
router.post('/preview', adminAuth, [
  body('projectId').isInt().withMessage('projectId is required'),
  body('workorderIds').isArray({ min: 1 }).withMessage('workorderIds must be a non-empty array'),
  body('workorderIds.*').isInt(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { projectId, workorderIds } = req.body;

  try {
    const rateSet = await currentRateSet(Number(projectId), req.tenantId);
    if (!rateSet) {
      return res.status(400).json({ error: 'No rate set configured for this project. Create a rate set first.' });
    }

    const { lines, subtotalCents, warnings } = await generateInvoiceLines(workorderIds, rateSet);

    res.json({
      lines: lines.map(l => ({
        sourceType:    l.sourceType,
        sourceRefId:   l.sourceRefId,
        description:   l.description,
        qty:           l.qty,
        unitRateCents: l.unitRateCents,
        amountCents:   l.amountCents,
      })),
      subtotalCents,
      rateSetVersion: rateSet.version,
      warnings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/generate — generate a draft invoice
// Body: { projectId, workorderIds: [id, ...], notes? }
// ---------------------------------------------------------------------------
router.post('/generate', adminAuth, [
  body('projectId').isInt().withMessage('projectId is required'),
  body('workorderIds').isArray({ min: 1 }).withMessage('workorderIds must be a non-empty array'),
  body('workorderIds.*').isInt(),
  body('notes').optional().trim(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { projectId, workorderIds, notes } = req.body;

  // Verify all workorders belong to this tenant + project and are unbilled
  const { data: wos } = await supabase
    .from('workorders')
    .select('id, billing_status, status, tenant_id, project_id')
    .in('id', workorderIds)
    .eq('tenant_id', req.tenantId)
    .eq('project_id', projectId);

  if (!wos || wos.length !== workorderIds.length) {
    return res.status(400).json({ error: 'One or more workorders not found or do not belong to this project.' });
  }

  const claimed = wos.filter(w => w.billing_status !== 'unbilled');
  if (claimed.length > 0) {
    return res.status(409).json({
      error: `Workorders already claimed: ${claimed.map(w => w.id).join(', ')}. A workorder can only appear on one active invoice.`,
    });
  }

  // Load current rate set
  const rateSet = await currentRateSet(projectId, req.tenantId);
  if (!rateSet) {
    return res.status(400).json({ error: 'No rate set found for this project. Create one before generating an invoice.' });
  }

  try {
    const { lines, subtotalCents, warnings } = await generateInvoiceLines(workorderIds, rateSet);

    const idempotencyKey = `${req.tenantId}:${projectId}:${workorderIds.sort().join('-')}:v${rateSet.version}`;

    // Check for existing draft with same key
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'draft')
      .single();

    if (existing) {
      return res.status(409).json({ error: 'A draft invoice already exists for these workorders.', invoiceId: existing.id });
    }

    const totalCents = subtotalCents; // Tax support can be added later

    // Create invoice header
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id:        req.tenantId,
        project_id:       projectId,
        workorder_id:     workorderIds.length === 1 ? workorderIds[0] : null,
        status:           'draft',
        rate_set_version: rateSet.version,
        generated_at:     new Date().toISOString(),
        subtotal_cents:   subtotalCents,
        tax_cents:        0,
        total_cents:      totalCents,
        idempotency_key:  idempotencyKey,
        notes:            notes || null,
      })
      .select()
      .single();

    if (invErr) return res.status(500).json({ error: invErr.message });

    // Insert line items
    if (lines.length > 0) {
      const lineRows = lines.map(l => ({
        invoice_id:      invoice.id,
        source_type:     l.sourceType,
        source_ref_id:   l.sourceRefId || null,
        description:     l.description || null,
        qty:             l.qty,
        unit_rate_cents: l.unitRateCents,
        amount_cents:    l.amountCents,
      }));

      const { error: linesErr } = await supabase.from('invoice_lines').insert(lineRows);
      if (linesErr) {
        // Roll back invoice
        await supabase.from('invoices').delete().eq('id', invoice.id);
        return res.status(500).json({ error: 'Failed to save invoice lines: ' + linesErr.message });
      }
    }

    // Mark workorders as claimed
    await supabase
      .from('workorders')
      .update({ billing_status: 'claimed', invoiced_on_invoice_id: invoice.id, updated_at: new Date().toISOString() })
      .in('id', workorderIds);

    const { data: full } = await supabase
      .from('invoices')
      .select('*, invoice_lines(*)')
      .eq('id', invoice.id)
      .single();

    res.status(201).json({ invoice: cc(full), warnings });
  } catch (err) {
    if (err.message.includes('Both nuclear_gauge_rate')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/approve — draft → approved
// ---------------------------------------------------------------------------
router.post('/:id/approve', adminAuth, async (req, res) => {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', req.params.id)
    .single();

  if (!invoice || Number(invoice.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (invoice.status !== 'draft') {
    return res.status(409).json({ error: `Cannot approve — invoice is already ${invoice.status}.` });
  }

  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/void — return workorders to unbilled pool
// ---------------------------------------------------------------------------
router.post('/:id/void', adminAuth, async (req, res) => {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', req.params.id)
    .single();

  if (!invoice || Number(invoice.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (invoice.status === 'void') {
    return res.status(409).json({ error: 'Invoice is already voided.' });
  }
  if (invoice.status === 'pushed') {
    return res.status(409).json({ error: 'Pushed invoices cannot be voided here — use a QuickBooks credit memo.' });
  }

  try {
    // Return workorders to unbilled pool
    await supabase
      .from('workorders')
      .update({ billing_status: 'unbilled', invoiced_on_invoice_id: null, updated_at: new Date().toISOString() })
      .eq('invoiced_on_invoice_id', invoice.id);

    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'void', updated_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/regenerate — re-generate a draft invoice's lines
//   (allowed on draft only; re-snapshots against current rate set)
// ---------------------------------------------------------------------------
router.post('/:id/regenerate', adminAuth, async (req, res) => {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, tenant_id, status, project_id')
    .eq('id', req.params.id)
    .single();

  if (!invoice || Number(invoice.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (invoice.status !== 'draft') {
    return res.status(409).json({ error: 'Only draft invoices can be regenerated.' });
  }

  const rateSet = await currentRateSet(invoice.project_id, req.tenantId);
  if (!rateSet) return res.status(400).json({ error: 'No rate set found.' });

  // Find claimed workorders
  const { data: wos } = await supabase
    .from('workorders')
    .select('id')
    .eq('invoiced_on_invoice_id', invoice.id);

  const workorderIds = (wos || []).map(w => w.id);
  if (!workorderIds.length) return res.status(400).json({ error: 'No workorders on this invoice.' });

  try {
    const { lines, subtotalCents, warnings } = await generateInvoiceLines(workorderIds, rateSet);

    // Delete old lines, insert new
    await supabase.from('invoice_lines').delete().eq('invoice_id', invoice.id);

    if (lines.length > 0) {
      await supabase.from('invoice_lines').insert(
        lines.map(l => ({
          invoice_id:      invoice.id,
          source_type:     l.sourceType,
          source_ref_id:   l.sourceRefId || null,
          description:     l.description || null,
          qty:             l.qty,
          unit_rate_cents: l.unitRateCents,
          amount_cents:    l.amountCents,
        }))
      );
    }

    await supabase
      .from('invoices')
      .update({
        subtotal_cents:   subtotalCents,
        total_cents:      subtotalCents,
        rate_set_version: rateSet.version,
        generated_at:     new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('id', invoice.id);

    const { data: full } = await supabase
      .from('invoices')
      .select('*, invoice_lines(*)')
      .eq('id', invoice.id)
      .single();

    res.json({ invoice: cc(full), warnings });
  } catch (err) {
    if (err.message.includes('Both nuclear_gauge_rate')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/invoices/:id/lines/:lineId — edit description on a draft invoice line
// ---------------------------------------------------------------------------
router.patch('/:id/lines/:lineId', adminAuth, [
  body('description').isString().trim(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', req.params.id)
    .single();

  if (!invoice || Number(invoice.tenant_id) !== req.tenantId) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  if (invoice.status !== 'draft') {
    return res.status(409).json({ error: 'Only draft invoice lines can be edited.' });
  }

  const { data: line } = await supabase
    .from('invoice_lines')
    .select('id')
    .eq('id', req.params.lineId)
    .eq('invoice_id', invoice.id)
    .single();

  if (!line) return res.status(404).json({ error: 'Line not found on this invoice' });

  const { data, error } = await supabase
    .from('invoice_lines')
    .update({ description: req.body.description || null })
    .eq('id', req.params.lineId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(cc(data));
});

module.exports = router;
