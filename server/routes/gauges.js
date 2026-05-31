const express = require('express');
const QRCode = require('qrcode');
const { supabase, keysToCamelCase } = require('../db/supabase');
const { authenticate, optionalAuthenticate, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Reusable middleware chains
const auth      = [authenticate, requireTenant];
const adminAuth = [authenticate, requireTenant, requireAdmin];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cc(obj) {
  return obj ? keysToCamelCase(obj) : obj;
}

function frontendUrl() {
  return process.env.FRONTEND_URL || 'https://app.crestfield.com';
}

// Tenant-scoped lookup (authenticated routes)
async function getGauge(gaugeId, tenantId) {
  const { data, error } = await supabase
    .from('nuclear_gauges')
    .select('*')
    .eq('id', gaugeId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !data) return null;
  return data;
}

// Public lookup — no tenant filter; gauge ID is globally unique
async function getGaugePublic(gaugeId) {
  const { data, error } = await supabase
    .from('nuclear_gauges')
    .select('*')
    .eq('id', gaugeId)
    .single();
  if (error || !data) return null;
  return data;
}

// Current open checkout for a gauge (time_in is null)
async function getOpenCheckout(gaugeId) {
  const { data } = await supabase
    .from('gauge_checkouts')
    .select('*, users(name, email)')
    .eq('gauge_id', gaugeId)
    .is('time_in', null)
    .order('time_out', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

// ---------------------------------------------------------------------------
// GET /api/gauges — list all gauges with live status
// ---------------------------------------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    const { data: gauges, error } = await supabase
      .from('nuclear_gauges')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('serial_number');

    if (error) return res.status(500).json({ error: error.message });

    // Attach current checkout status to each gauge
    const results = await Promise.all(
      gauges.map(async (g) => {
        const open = await getOpenCheckout(g.id);
        return {
          ...cc(g),
          status: open ? 'in_field' : 'in_lab',
          currentCheckout: open ? cc(open) : null,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gauges — create gauge (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  adminAuth,
  [
    body('serialNumber').notEmpty().trim().withMessage('Serial number is required'),
    body('model').notEmpty().trim().withMessage('Model is required'),
    body('nickname').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { serialNumber, model, nickname } = req.body;

    try {
      const { data, error } = await supabase
        .from('nuclear_gauges')
        .insert({
          tenant_id: req.tenantId,
          serial_number: serialNumber,
          model,
          nickname: nickname || null,
          active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: `Serial number ${serialNumber} already exists for this tenant.` });
        }
        return res.status(500).json({ error: error.message });
      }

      res.status(201).json(cc(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/gauges/:id — update gauge (admin only)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  adminAuth,
  [
    body('serialNumber').optional().notEmpty().trim(),
    body('model').optional().notEmpty().trim(),
    body('nickname').optional().trim(),
    body('active').optional().isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const gauge = await getGauge(req.params.id, req.tenantId);
    if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

    const updates = {};
    if (req.body.serialNumber !== undefined) updates.serial_number = req.body.serialNumber;
    if (req.body.model !== undefined) updates.model = req.body.model;
    if (req.body.nickname !== undefined) updates.nickname = req.body.nickname || null;
    if (req.body.active !== undefined) updates.active = req.body.active;

    try {
      const { data, error } = await supabase
        .from('nuclear_gauges')
        .update(updates)
        .eq('id', gauge.id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Serial number already exists for this tenant.' });
        return res.status(500).json({ error: error.message });
      }
      res.json(cc(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/gauges/:id — deactivate gauge (admin only, soft delete)
// ---------------------------------------------------------------------------
router.delete('/:id', adminAuth, async (req, res) => {
  const gauge = await getGauge(req.params.id, req.tenantId);
  if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

  try {
    await supabase
      .from('nuclear_gauges')
      .update({ active: false })
      .eq('id', gauge.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/gauges/:id/permanent — hard delete (admin only, only if no checkout history)
// ---------------------------------------------------------------------------
router.delete('/:id/permanent', adminAuth, async (req, res) => {
  const gauge = await getGauge(req.params.id, req.tenantId);
  if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

  try {
    const { count } = await supabase
      .from('gauge_checkouts')
      .select('id', { count: 'exact', head: true })
      .eq('gauge_id', gauge.id);

    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete — gauge has ${count} checkout record(s). Use Deactivate instead to preserve the audit trail.`,
      });
    }

    const { error } = await supabase.from('nuclear_gauges').delete().eq('id', gauge.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/gauges/:id/qr — print-ready QR code page (HTML, no Puppeteer)
// ---------------------------------------------------------------------------
router.get('/:id/qr', adminAuth, async (req, res) => {
  const gauge = await getGauge(req.params.id, req.tenantId);
  if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

  try {
    const url = `${frontendUrl()}/gauges/${gauge.id}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    const label = gauge.nickname || gauge.serial_number;
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>QR - ${label}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: white;
  }
  .card {
    border: 2px solid #1a1a2e;
    border-radius: 12px;
    padding: 24px 28px;
    text-align: center;
    width: 340px;
  }
  .company { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  img { width: 220px; height: 220px; margin: 8px auto; display: block; }
  .label { font-size: 22px; font-weight: 700; color: #1a1a2e; margin-top: 8px; }
  .model { font-size: 14px; color: #444; margin-top: 4px; }
  .serial { font-size: 12px; color: #888; margin-top: 2px; }
  .instruction { font-size: 11px; color: #999; margin-top: 14px; border-top: 1px solid #eee; padding-top: 10px; }
  .print-btn {
    margin-top: 20px;
    padding: 10px 28px;
    background: #1a1a2e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
<div class="card">
  <div class="company">Nuclear Gauge Log</div>
  <img src="${qrDataUrl}" alt="QR Code"/>
  <div class="label">${label}</div>
  <div class="model">${gauge.model}</div>
  <div class="serial">S/N: ${gauge.serial_number}</div>
  <div class="instruction">Scan to check out or check in</div>
  <button class="print-btn" onclick="window.print()">Print</button>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/gauges/:id/status — PUBLIC: current status of one gauge (QR scan)
// ---------------------------------------------------------------------------
router.get('/:id/status', optionalAuthenticate, async (req, res) => {
  const gauge = await getGaugePublic(req.params.id);
  if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

  const open = await getOpenCheckout(gauge.id);
  res.json({
    gauge: cc(gauge),
    status: open ? 'in_field' : 'in_lab',
    currentCheckout: open ? cc(open) : null,
  });
});

// ---------------------------------------------------------------------------
// POST /api/gauges/:id/checkout — PUBLIC: check out a gauge
// ---------------------------------------------------------------------------
router.post(
  '/:id/checkout',
  optionalAuthenticate,
  [
    body('destination').notEmpty().trim().withMessage('Destination is required'),
    body('blockClosed').isBoolean().withMessage('Block closed confirmation is required'),
    body('technicianName').optional().trim(),
    body('projectId').optional({ nullable: true }).isInt(),
    body('projectName').optional().trim(),
    body('chd').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const gauge = await getGaugePublic(req.params.id);
    if (!gauge) return res.status(404).json({ error: 'Gauge not found' });
    if (!gauge.active) return res.status(400).json({ error: 'Gauge is inactive' });

    const open = await getOpenCheckout(gauge.id);
    if (open) return res.status(409).json({ error: 'Gauge is already checked out', currentCheckout: open });

    // Identify technician: registered user (JWT) or guest (name only)
    const technicianId = req.user?.id || null;
    const technicianName = !technicianId ? (req.body.technicianName?.trim() || null) : null;
    if (!technicianId && !technicianName) {
      return res.status(400).json({ error: 'Your name is required to check out this gauge.' });
    }

    const { destination, blockClosed, projectId, projectName, chd, notes } = req.body;
    const now = new Date();

    try {
      const { data, error } = await supabase
        .from('gauge_checkouts')
        .insert({
          tenant_id: gauge.tenant_id,
          gauge_id: gauge.id,
          technician_id: technicianId,
          technician_name: technicianName,
          project_id: projectId || null,
          project_name: projectName || null,
          destination,
          time_out: now.toISOString(),
          time_in: null,
          block_closed: blockClosed,
          chd: chd || null,
          notes: notes || null,
          log_date: now.toISOString().slice(0, 10),
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json(cc(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/gauges/:id/checkin — PUBLIC: check in a gauge
// ---------------------------------------------------------------------------
router.post(
  '/:id/checkin',
  optionalAuthenticate,
  [
    body('notes').optional().trim(),
    body('chd').optional().trim(),
  ],
  async (req, res) => {
    const gauge = await getGaugePublic(req.params.id);
    if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

    const open = await getOpenCheckout(gauge.id);
    if (!open) return res.status(409).json({ error: 'Gauge is not currently checked out' });

    const updates = { time_in: new Date().toISOString() };
    if (req.body.notes) updates.notes = req.body.notes;
    if (req.body.chd) updates.chd = req.body.chd;

    try {
      const { data, error } = await supabase
        .from('gauge_checkouts')
        .update(updates)
        .eq('id', open.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(cc(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/gauges/log/manual — manually create a log entry (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/log/manual',
  adminAuth,
  [
    body('gaugeId').isInt().withMessage('Gauge is required'),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date is required (YYYY-MM-DD)'),
    body('timeOut').matches(/^\d{2}:\d{2}$/).withMessage('Time out is required (HH:MM)'),
    body('timeIn').optional({ nullable: true }).matches(/^\d{2}:\d{2}$/),
    body('blockClosed').isBoolean().withMessage('Block standardization confirmation is required'),
    body('destination').notEmpty().trim().withMessage('Destination is required'),
    body('technicianId').optional({ nullable: true }).isInt(),
    body('projectName').optional().trim(),
    body('chd').optional().trim(),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { gaugeId, date, timeOut, timeIn, blockClosed, destination, technicianId, projectName, chd, notes } = req.body;

    const gauge = await getGauge(gaugeId, req.tenantId);
    if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

    const timeOutIso = `${date}T${timeOut}:00`;
    const timeInIso = timeIn ? `${date}T${timeIn}:00` : null;

    try {
      const { data, error } = await supabase
        .from('gauge_checkouts')
        .insert({
          tenant_id: req.tenantId,
          gauge_id: gaugeId,
          technician_id: technicianId || req.user.id,
          project_name: projectName || null,
          destination,
          time_out: timeOutIso,
          time_in: timeInIso,
          block_closed: blockClosed,
          chd: chd || null,
          notes: notes || null,
          log_date: date,
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json(cc(data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/gauges/:id/log?month=5&year=2026 — monthly checkout log for one gauge
// ---------------------------------------------------------------------------
router.get('/:id/log', auth, async (req, res) => {
  const gauge = await getGauge(req.params.id, req.tenantId);
  if (!gauge) return res.status(404).json({ error: 'Gauge not found' });

  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  try {
    const { data, error } = await supabase
      .from('gauge_checkouts')
      .select('*, users(name)')
      .eq('gauge_id', gauge.id)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date')
      .order('time_out');

    if (error) return res.status(500).json({ error: error.message });
    res.json({ gauge: cc(gauge), month, year, entries: (data || []).map(cc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/gauges/log/all?month=5&year=2026 — monthly log across all gauges
// ---------------------------------------------------------------------------
router.get('/log/all', auth, async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  try {
    const { data, error } = await supabase
      .from('gauge_checkouts')
      .select('*, nuclear_gauges(serial_number, model, nickname), users(name)')
      .eq('tenant_id', req.tenantId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date')
      .order('time_out');

    if (error) return res.status(500).json({ error: error.message });
    res.json({ month, year, entries: (data || []).map(cc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
