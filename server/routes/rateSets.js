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

// ---------------------------------------------------------------------------
// GET /api/rate-sets?projectId=X — all versions for a project
// ---------------------------------------------------------------------------
router.get('/', auth, [
  query('projectId').isInt().withMessage('projectId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { data, error } = await supabase
      .from('rate_sets')
      .select('*')
      .eq('project_id', req.query.projectId)
      .eq('tenant_id', req.tenantId)
      .order('version', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(cc));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/rate-sets/current?projectId=X — latest version
// ---------------------------------------------------------------------------
router.get('/current', auth, [
  query('projectId').isInt().withMessage('projectId is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { data, error } = await supabase
      .from('rate_sets')
      .select('*')
      .eq('project_id', req.query.projectId)
      .eq('tenant_id', req.tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
    res.json(data ? cc(data) : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/rate-sets — create new version (never overwrites)
// ---------------------------------------------------------------------------
const rateFields = [
  body('projectId').isInt().withMessage('projectId is required'),
  body('effectiveDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  body('technicianRate').isFloat({ min: 0 }),
  body('technicianOtRate').isFloat({ min: 0 }),
  body('tripFlat').isFloat({ min: 0 }),
  body('tripPerMile').isFloat({ min: 0 }),
  body('cylinderRate').isFloat({ min: 0 }),
  body('nuclearGaugeRate').isFloat({ min: 0 }),
  body('densityTestRate').isFloat({ min: 0 }),
  body('proctorRate').isFloat({ min: 0 }),
  body('atterbergRate').isFloat({ min: 0 }),
  body('sieve200Rate').isFloat({ min: 0 }),
];

router.post('/', adminAuth, rateFields, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const {
    projectId, effectiveDate,
    technicianRate, technicianOtRate,
    tripFlat, tripPerMile,
    cylinderRate, nuclearGaugeRate, densityTestRate,
    proctorRate, atterbergRate, sieve200Rate,
  } = req.body;

  // Validate: at most one of trip_flat / trip_per_mile
  if (Number(tripFlat) > 0 && Number(tripPerMile) > 0) {
    return res.status(400).json({ error: 'Set either trip_flat or trip_per_mile, not both.' });
  }
  // Validate: at most one of nuclear_gauge_rate / density_test_rate
  if (Number(nuclearGaugeRate) > 0 && Number(densityTestRate) > 0) {
    return res.status(400).json({ error: 'Set either nuclear_gauge_rate or density_test_rate, not both.' });
  }

  try {
    // Determine next version number
    const { data: latest } = await supabase
      .from('rate_sets')
      .select('version')
      .eq('project_id', projectId)
      .eq('tenant_id', req.tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = latest ? latest.version + 1 : 1;

    const { data, error } = await supabase
      .from('rate_sets')
      .insert({
        tenant_id:           req.tenantId,
        project_id:          projectId,
        version:             nextVersion,
        effective_date:      effectiveDate || new Date().toISOString().slice(0, 10),
        technician_rate:     technicianRate,
        technician_ot_rate:  technicianOtRate,
        trip_flat:           tripFlat,
        trip_per_mile:       tripPerMile,
        cylinder_rate:       cylinderRate,
        nuclear_gauge_rate:  nuclearGaugeRate,
        density_test_rate:   densityTestRate,
        proctor_rate:        proctorRate,
        atterberg_rate:      atterbergRate,
        sieve200_rate:       sieve200Rate,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(cc(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
