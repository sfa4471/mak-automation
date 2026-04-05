const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { getPuppeteerLaunchOptions } = require('../utils/puppeteerLaunch');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { supabase, isAvailable } = require('../db/supabase');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { getPDFSavePath, savePDFToFile } = require('../utils/pdfFileManager');
const { getTenant, getTenantAddress, getLogoBase64, getPdfFooterData, buildPdfFooterHtml } = require('../utils/tenantBranding');
const { body, validationResult } = require('express-validator');

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Monotone interpolation function (matching Recharts "monotone" type)
// Recharts uses cubic basis spline with monotonic constraints
function monotoneInterpolation(points) {
  if (points.length < 2) return points;
  if (points.length === 2) {
    // For 2 points, just return them with a few interpolated points for smoothness
    const p0 = points[0];
    const p1 = points[1];
    const samples = 50;
    const result = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      result.push({
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t
      });
    }
    return result;
  }
  
  const n = points.length;
  
  // Calculate slopes with monotone constraints (Fritsch-Carlson method)
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    if (dx === 0) {
      slopes.push(0);
    } else {
      slopes.push(dy / dx);
    }
  }
  
  // Calculate tangents with monotone constraint
  const tangents = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tangents.push(slopes[0]);
    } else if (i === n - 1) {
      tangents.push(slopes[n - 2]);
    } else {
      const m1 = slopes[i - 1];
      const m2 = slopes[i];
      
      // Monotone constraint: avoid overshoot/undershoot
      if (m1 * m2 <= 0) {
        tangents.push(0);
      } else {
        const dx1 = points[i].x - points[i - 1].x;
        const dx2 = points[i + 1].x - points[i].x;
        const w1 = 2 * dx1 + dx2;
        const w2 = dx1 + 2 * dx2;
        tangents.push((w1 + w2) / (w1 / m1 + w2 / m2));
      }
    }
  }
  
  // Generate dense curve using cubic Hermite interpolation
  // Significantly increased resolution for smooth curves (300-500 points)
  const densePoints = [];
  const baseResolution = 400; // Increased from 200 for smoother curves
  
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const m0 = tangents[i];
    const m1 = tangents[i + 1];
    
    const dx = p1.x - p0.x;
    // Scale samples by segment length (more points for longer segments)
    // Minimum 50 points per segment for smoothness
    const samples = Math.max(50, Math.ceil((dx / 25) * baseResolution));
    
    for (let j = 0; j <= samples; j++) {
      const t = j / samples;
      
      // Cubic Hermite basis functions
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      
      const x = p0.x + dx * t;
      const y = h00 * p0.y + h10 * dx * m0 + h01 * p1.y + h11 * dx * m1;
      
      densePoints.push({ x, y });
    }
  }
  
  // Ensure last point is included
  const lastPoint = points[n - 1];
  if (densePoints.length === 0 || Math.abs(densePoints[densePoints.length - 1].x - lastPoint.x) > 0.001) {
    densePoints.push(lastPoint);
  }
  
  return densePoints;
}

// Helper: dedupe and sort (no Set for ES5)
function dedupeSort(arr) {
  const sorted = arr.slice().sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] > sorted[i - 1]) out.push(sorted[i]);
  }
  return out;
}
// Helper: minor ticks (3 lines between each major = 4 equal subdivisions)
function ticksWithMinor(majorTicks) {
  const round4 = (n) => Math.round(n * 10000) / 10000;
  const out = [];
  for (let i = 0; i < majorTicks.length; i++) {
    out.push(round4(majorTicks[i]));
    if (i < majorTicks.length - 1) {
      const a = majorTicks[i];
      const b = majorTicks[i + 1];
      const step = (b - a) / 4;
      out.push(round4(a + step), round4(a + 2 * step), round4(a + 3 * step));
    }
  }
  return dedupeSort(out);
}
// Helper: clip ZAV points to yMax with intersection points (match UI)
function clipZAVToYMax(points, yMax) {
  const sorted = points.slice().sort((a, b) => a.x - b.x);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;
    if (p.y <= yMax) {
      out.push({ x: p.x, y: p.y });
    } else {
      if (prev && prev.y < yMax) {
        const t = (yMax - prev.y) / (p.y - prev.y);
        out.push({ x: prev.x + t * (p.x - prev.x), y: yMax });
      }
      if (next && next.y <= yMax) {
        const t = (yMax - p.y) / (next.y - p.y);
        out.push({ x: p.x + t * (next.x - p.x), y: yMax });
      }
    }
  }
  return out.sort((a, b) => a.x - b.x);
}
// Helper: clip ZAV to x domain [xMin, xMax] with intersection points at boundaries
function clipZAVToXDomain(points, xMin, xMax) {
  const sorted = points.slice().sort((a, b) => a.x - b.x);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;
    if (p.x >= xMin && p.x <= xMax) {
      out.push({ x: p.x, y: p.y });
    } else {
      if (p.x > xMax && prev && prev.x < xMax) {
        const t = (xMax - prev.x) / (p.x - prev.x);
        out.push({ x: xMax, y: prev.y + t * (p.y - prev.y) });
      }
      if (p.x < xMin && next && next.x >= xMin) {
        const t = (xMin - p.x) / (next.x - p.x);
        out.push({ x: xMin, y: p.y + t * (next.y - p.y) });
      }
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/**
 * Coerce proctor_points / zav_points from DB (JSONB) or POST body into a point array.
 * Bulk PDF uses req.body from proctor_data without the GET /task route's parsing step —
 * values may be strings, {}, or other non-arrays; guard so .map never throws.
 */
function normalizeProctorPointsArray(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') return [];
  return [];
}

// Helper function to generate Proctor Curve Chart as SVG - MUST match UI exactly (dynamic domains, grid, ZAV clip)
function generateProctorChartSVG(reportData) {
  const toNum = (v) => {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(/,/g, '');
    if (s === '') return NaN;
    return Number(s);
  };

  const proctorPointsRaw = normalizeProctorPointsArray(reportData.proctorPoints);
  const zavPointsRaw = normalizeProctorPointsArray(reportData.zavPoints);
  const omc = reportData.optimumMoisturePercent ? parseFloat(reportData.optimumMoisturePercent) : undefined;
  const maxDensity = reportData.maximumDryDensityPcf ? parseFloat(reportData.maximumDryDensityPcf) : undefined;

  const cleanedProctorPoints = proctorPointsRaw
    .map(p => ({ x: toNum(p.x), y: toNum(p.y) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .sort((a, b) => a.x - b.x);

  const cleanedZAVPoints = zavPointsRaw
    .map(p => ({ x: toNum(p.x), y: toNum(p.y) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .sort((a, b) => a.x - b.x);

  // --- Dynamic Y domain (match UI: dataMaxY + 5, effectiveYMax = floor(max/2)*2) ---
  const yValues = cleanedProctorPoints.map(p => p.y).filter(Number.isFinite);
  if (maxDensity != null && !isNaN(maxDensity)) yValues.push(maxDensity);
  const dataMaxY = yValues.length ? Math.max(...yValues) : 110;
  const minY = yValues.length ? Math.min(...yValues) : 96;
  const domainMax = dataMaxY + 5;
  const padding = Math.max(1, (domainMax - minY) * 0.05);
  const roundedMinY = Math.floor((minY - padding) / 2) * 2;
  const domainMin = Math.max(0, roundedMinY);
  const effectiveYMax = Math.floor(domainMax / 2) * 2;
  const effectiveYDomain = [domainMin, effectiveYMax];

  const yTicks = [];
  const roundedMin = Math.ceil(domainMin / 2) * 2;
  const roundedMax = Math.floor(effectiveYMax / 2) * 2;
  for (let y = roundedMin; y <= roundedMax; y += 2) yTicks.push(y);
  if (yTicks.length === 0) yTicks.push(roundedMin, roundedMax);
  const yTicksWithMinor = ticksWithMinor(yTicks);

  // --- Dynamic X domain (match UI: minX-2 gap, maxX+6, tick step 1 or 2) ---
  const validMoistures = cleanedProctorPoints.map(p => p.x).filter(Number.isFinite);
  let xDomain = [0, 25];
  let xTicks = [0, 5, 10, 15, 20, 25];
  let xTicksWithMinor = xTicks;
  if (validMoistures.length > 0) {
    const minX = Math.min(...validMoistures);
    const maxX = Math.max(...validMoistures);
    const xAxisMax = maxX + 6;
    const range = xAxisMax - Math.max(0, minX - 2);
    const tickStep = range <= 14 ? 1 : 2;
    const xMinAligned = Math.max(0, Math.ceil((minX - 2) / tickStep) * tickStep);
    const xMaxAligned = Math.ceil(xAxisMax / tickStep) * tickStep;
    xTicks = [];
    for (let x = xMinAligned; x <= xMaxAligned; x += tickStep) xTicks.push(x);
    xDomain = [xMinAligned, xMaxAligned];
    xTicksWithMinor = ticksWithMinor(xTicks);
  }

  // ZAV: clip to y max then to x-axis domain so curve does not extend past max x-axis value
  const filteredZAV = cleanedZAVPoints
    .filter(p => p.x >= 0 && p.x <= 25)
    .map(p => ({ x: Math.max(0, Math.min(25, p.x)), y: p.y }))
    .filter(p => p.y >= effectiveYDomain[0]);
  const zavClippedY = clipZAVToYMax(filteredZAV, effectiveYMax);
  const zavInPlot = clipZAVToXDomain(zavClippedY, xDomain[0], xDomain[1]);

  const width = 680;
  const height = 380;
  // Extra top margin so max Y-axis label (e.g. 114) and ZAV curve are not cut off in PDF
  const margin = { top: 50, right: 25, bottom: 55, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const scaleX = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * chartWidth;
  const scaleY = (value) => margin.top + chartHeight - ((value - effectiveYDomain[0]) / (effectiveYDomain[1] - effectiveYDomain[0])) * chartHeight;

  // --- Grid: grey solid; vertical only from effectiveYDomain (do not extend past top) ---
  const yTop = scaleY(effectiveYDomain[1]);
  const yBottom = scaleY(effectiveYDomain[0]);
  const gridParts = [];
  xTicksWithMinor.forEach(v => {
    const x = scaleX(v);
    gridParts.push(`<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBottom}" stroke="#d0d0d0" stroke-width="1"/>`);
  });
  yTicksWithMinor.forEach(v => {
    const y = scaleY(v);
    gridParts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" stroke="#d0d0d0" stroke-width="1"/>`);
  });

  // --- Proctor curve (monotone) ---
  let proctorPath = '';
  if (cleanedProctorPoints.length >= 2) {
    const smoothPoints = monotoneInterpolation(cleanedProctorPoints);
    const pathData = smoothPoints.map((p, i) => {
      const x = scaleX(p.x);
      const y = scaleY(p.y);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    proctorPath = `<path d="${pathData}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (cleanedProctorPoints.length === 1) {
    const p = cleanedProctorPoints[0];
    proctorPath = `<circle cx="${scaleX(p.x)}" cy="${scaleY(p.y)}" r="2" fill="#000" stroke="#000" stroke-width="1"/>`;
  }

  // --- ZAV curve (clipped to x-axis max and y-axis max in data space) ---
  const plotLeft = margin.left;
  const plotRight = margin.left + chartWidth;
  let zavPath = '';
  if (zavInPlot.length >= 2) {
    const smoothZAV = monotoneInterpolation(zavInPlot);
    const pathData = smoothZAV.map((p, i) => {
      const x = scaleX(p.x);
      const y = scaleY(p.y);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    zavPath = `<path d="${pathData}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (zavInPlot.length === 1) {
    const p = zavInPlot[0];
    zavPath = `<circle cx="${scaleX(p.x)}" cy="${scaleY(p.y)}" r="2" fill="#000" stroke="#000" stroke-width="1"/>`;
  }

  // --- X-axis: major ticks only (labels); short dash 1px ---
  const xAxisTickY = margin.top + chartHeight;
  const xAxisLabels = xTicks.map(tick => {
    const x = scaleX(tick);
    const dash = `<line x1="${x}" y1="${xAxisTickY}" x2="${x}" y2="${xAxisTickY + 1}" stroke="#000" stroke-width="1"/>`;
    const label = `<text x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="#000">${tick}</text>`;
    return dash + label;
  }).join('');

  // --- Y-axis: all major ticks (no skipping) ---
  const yAxisLabels = yTicks.map(tick => {
    const y = scaleY(tick);
    const dash = `<line x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#000" stroke-width="1"/>`;
    const label = `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="bold" fill="#000">${tick}</text>`;
    return dash + label;
  }).join('');

  // Reference lines (OMC vertical, max density horizontal)
  let referenceLines = '';
  if (omc != null && !isNaN(omc) && omc >= 0 && omc <= 25) {
    const x = scaleX(omc);
    referenceLines += `<line x1="${x}" y1="${yTop}" x2="${x}" y2="${yBottom}" stroke="#000" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  }
  if (maxDensity != null && !isNaN(maxDensity) && maxDensity >= effectiveYDomain[0] && maxDensity <= effectiveYDomain[1]) {
    const y = scaleY(maxDensity);
    referenceLines += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" stroke="#000" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  }

  let peakMarker = '';
  if (omc != null && maxDensity != null && !isNaN(omc) && !isNaN(maxDensity) &&
      omc >= 0 && omc <= 25 && maxDensity >= effectiveYDomain[0] && maxDensity <= effectiveYDomain[1]) {
    const px = scaleX(omc);
    const py = scaleY(maxDensity);
    peakMarker = `<path d="M ${px} ${py - 3} L ${px - 3} ${py + 3} L ${px + 3} ${py + 3} Z" fill="#000" stroke="#000" stroke-width="1"/>`;
  }

  const proctorMarkers = cleanedProctorPoints.map(p => {
    const x = scaleX(p.x);
    const y = scaleY(p.y);
    return `<path d="M ${x} ${y - 4} L ${x - 4} ${y + 4} L ${x + 4} ${y + 4} Z" fill="white" stroke="#000" stroke-width="1.5"/>`;
  }).join('');

  let zavLabel = '';
  if (zavInPlot.length > 0) {
    // Prefer a point on the lower part of the curve so label can sit clearly above it
    const targetPoint = zavInPlot.find(p => p.x >= 14 && p.x <= 17) || zavInPlot.find(p => p.x >= 17 && p.x <= 20) || zavInPlot[Math.floor(zavInPlot.length * 0.7)];
    if (targetPoint) {
      let labelX = scaleX(targetPoint.x);
      const labelY = scaleY(targetPoint.y);
      const textWidthApprox = 95;
      // Position label to the LEFT of the curve (text-anchor end) and well ABOVE so it never overlaps the diagonal
      const labelOffsetX = 15;
      const labelOffsetY = 32;
      const labelEndX = Math.max(plotLeft + textWidthApprox, Math.min(labelX - labelOffsetX, plotRight - 5));
      let safeY = Math.max(labelY - labelOffsetY, margin.top + 14);
      safeY = Math.min(safeY, margin.top + chartHeight - 5);
      zavLabel = `<text x="${labelEndX}" y="${safeY}" font-size="11" font-weight="bold" fill="#000" text-anchor="end">Zero Air Voids</text>`;
    }
  }

  const xAxisLabel = `<text x="${width / 2}" y="${height - margin.bottom + 35}" text-anchor="middle" font-size="12" font-weight="bold" fill="#000">% Moisture</text>`;
  const yAxisLabelX = margin.left / 2 - 10;
  const yAxisLabel = `<text x="${yAxisLabelX}" y="${height / 2}" text-anchor="middle" font-size="12" font-weight="bold" fill="#000" transform="rotate(-90, ${yAxisLabelX}, ${height / 2})">Dry Density (LBS. Cu. Ft.)</text>`;

  const chartBorder = `<rect x="${margin.left}" y="${margin.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#000" stroke-width="1.5"/>`;

  return `
    <div id="proctor-chart" style="width: ${width}px; height: ${height}px; margin: 15px auto; padding: 15px; background: #fff; page-break-inside: avoid; break-inside: avoid; overflow: visible;">
      <svg width="${width}" height="${height}" style="background: white; font-family: Arial, sans-serif; overflow: visible;">
        <!-- Grid (grey, solid; vertical clipped to y range) -->
        ${gridParts.join('')}
        <!-- Chart border -->
        ${chartBorder}
        <!-- Curves on top of grid -->
        ${zavPath}
        ${proctorPath}
        <!-- Reference lines -->
        ${referenceLines}
        ${peakMarker}
        ${proctorMarkers}
        ${zavLabel}
        <!-- Axis tick marks and labels -->
        ${xAxisLabels}
        ${yAxisLabels}
        <!-- Axis labels -->
        ${xAxisLabel}
        ${yAxisLabel}
      </svg>
    </div>
  `;
}

// Generate Proctor PDF (requireTenant so save path uses tenant's workflow_base_path)
router.post('/:taskId/pdf', authenticate, requireTenant, async (req, res) => {
  try {
    const { taskId } = req.params;
    const reportData = req.body || {};
    if (reportData && typeof reportData === 'object') {
      reportData.proctorPoints = normalizeProctorPointsArray(reportData.proctorPoints);
      reportData.zavPoints = normalizeProctorPointsArray(reportData.zavPoints);
    }
    const isRegeneration = req.query.regenerate === 'true' || req.query.regen === 'true';
    
    // Get task and project information for file naming
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number, id, tenant_id)
        `)
        .eq('id', taskId)
        .eq('task_type', 'PROCTOR')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      const tenantId = data.tenant_id ?? data.projects?.tenant_id ?? req.tenantId;
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        projectId: data.projects?.id,
        tenantId,
        tenant_id: tenantId,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectNumber, p.id as projectId, p.projectName
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'PROCTOR'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check access
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get field date (prefer scheduledStartDate, fallback to sampleDate from reportData, then today)
    const fieldDate = task.scheduledStartDate || reportData.sampleDate || new Date().toISOString().split('T')[0];

    // Tenant branding and save path: always use signed-in tenant for folder (req.tenantId from requireTenant)
    const pdfTenantId = task.tenantId ?? task.tenant_id ?? req.tenantId;
    const tenantIdForPath = req.tenantId != null ? Number(req.tenantId) : (pdfTenantId != null ? Number(pdfTenantId) : null);
    const pdfTenant = await getTenant(pdfTenantId);
    const logoDataUri = await getLogoBase64(pdfTenantId);
    const companyName = (pdfTenant?.name ?? pdfTenant?.company_name ?? '').trim() || 'Company';
    const addressLines = getTenantAddress(pdfTenant);
    const companyPhone = pdfTenant?.company_phone ?? pdfTenant?.companyPhone ?? '';
    const companyEmail = pdfTenant?.company_email ?? pdfTenant?.companyEmail ?? '';
    const phoneEmailLine = [companyPhone && `P: ${companyPhone}`, companyEmail && `E: ${companyEmail}`].filter(Boolean).join(' | ');
    const headerAddressHtml = [
      ...addressLines.split('\n').filter(Boolean).map(line => `<div>${escapeHtml(line)}</div>`),
      phoneEmailLine ? `<div>${escapeHtml(phoneEmailLine)}</div>` : ''
    ].filter(Boolean).join('\n      ') || '<div>—</div>';

    // Shared PDF footer (bottom-right): firm name, signature, engineer name, title, firm reg, date (positioned further down/right in Proctor)
    const proctorFooterData = await getPdfFooterData(pdfTenant, { reportDate: reportData.sampleDate });
    const pdfFooterHtml = buildPdfFooterHtml(proctorFooterData, { bottom: '0.2in', right: '0.2in' });

    // Generate HTML template for Proctor report
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      background: white;
    }
    .page-container {
      position: relative;
      min-height: 11in;
      width: 8.5in;
      max-width: 8.5in;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 15px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #000;
    }
    .header-logo {
      width: 120px;
      height: 80px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    .header-logo img {
      width: 120px;
      height: 80px;
      object-fit: contain;
      object-position: left center;
    }
    .header-address {
      font-size: 11px;
      line-height: 1.4;
      text-align: right;
      color: #333;
    }
    .title {
      text-align: center;
      color: #0066cc;
      font-size: 22px;
      font-weight: bold;
      margin: 12px 0 20px 0;
      text-transform: uppercase;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 40px;
      margin-bottom: 30px;
    }
    .form-row {
      display: flex;
      align-items: baseline;
      min-height: 24px;
    }
    .form-row label {
      min-width: 160px;
      font-weight: 500;
      font-size: 13px;
      color: #333;
      padding-right: 5px; /* Add space after colon */
    }
    .form-row .value {
      flex: 1;
      border-bottom: 1px solid #333;
      padding: 2px 0;
      font-size: 13px;
      color: #333;
      min-height: 18px;
    }
    .chart-container {
      margin-top: 25px;
      padding: 15px;
      background: #fff;
      text-align: center;
      display: flex;
      justify-content: center;
      align-items: center;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-page-break-inside: avoid !important;
    }
    #proctor-chart {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-page-break-inside: avoid !important;
    }
    #proctor-chart svg {
      background: white;
      max-width: 100%;
      height: auto;
    }
    @media print {
      body {
        padding: 0;
      }
      .page-container {
        border: none;
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header">
      <div class="header-logo">
        ${logoDataUri ? `<img src="${logoDataUri}" alt="${escapeHtml(companyName)}" />` : `<div style="font-size:12px;line-height:1.2;">${escapeHtml(companyName)}</div>`}
      </div>
      <div class="header-address">
        ${headerAddressHtml}
      </div>
    </div>

    <h1 class="title">MOISTURE DENSITY RELATION OF SOILS</h1>

    <div class="form-grid">
      <div class="form-column">
        <div class="form-row">
          <label>Project Name:</label>
          <div class="value">${escapeHtml(reportData.projectName)}</div>
        </div>
        <div class="form-row">
          <label>Project No.:</label>
          <div class="value">${escapeHtml(reportData.projectNumber)}</div>
        </div>
        <div class="form-row">
          <label>Sampled By:</label>
          <div class="value">${escapeHtml(reportData.sampledBy)}</div>
        </div>
        <div class="form-row">
          <label>Test Method:</label>
          <div class="value">${escapeHtml(reportData.testMethod)}</div>
        </div>
        <div class="form-row">
          <label>Client:</label>
          <div class="value">${escapeHtml(reportData.client)}</div>
        </div>
        <div class="form-row">
          <label>Soil Classification:</label>
          <div class="value">${escapeHtml(reportData.soilClassification)}</div>
        </div>
        <div class="form-row">
          <label>Maximum Dry Density (pcf):</label>
          <div class="value">${escapeHtml(reportData.maximumDryDensityPcf)}</div>
        </div>
        <div class="form-row">
          <label>Optimum Moisture (%):</label>
          <div class="value">${escapeHtml(reportData.optimumMoisturePercent)}</div>
        </div>
        <div class="form-row">
          <label>Liquid Limit (LL):</label>
          <div class="value">${escapeHtml(reportData.liquidLimitLL)}</div>
        </div>
        <div class="form-row">
          <label>Plasticity Index (PI):</label>
          <div class="value">${escapeHtml(reportData.plasticityIndex)}</div>
        </div>
      </div>

      <div class="form-column">
        <div class="form-row">
          <label>Sample Date:</label>
          <div class="value">${escapeHtml(reportData.sampleDate)}</div>
        </div>
        <div class="form-row">
          <label>Calculated By:</label>
          <div class="value">${escapeHtml(reportData.calculatedBy)}</div>
        </div>
        <div class="form-row">
          <label>Reviewed By:</label>
          <div class="value">${escapeHtml(reportData.reviewedBy)}</div>
        </div>
        <div class="form-row">
          <label>Checked By:</label>
          <div class="value">${escapeHtml(reportData.checkedBy)}</div>
        </div>
        <div class="form-row">
          <label>% Passing #200 Sieve:</label>
          <div class="value">${escapeHtml(reportData.percentPassing200)}</div>
        </div>
        <div class="form-row">
          <label>Specific Gravity (Estimated):</label>
          <div class="value">${escapeHtml(reportData.specificGravityG)}</div>
        </div>
      </div>
    </div>

    <div class="chart-container">
      ${generateProctorChartSVG(reportData)}
    </div>

    ${pdfFooterHtml}
  </div>
</body>
</html>
    `;

    // Launch Puppeteer and generate PDF
    let browser;
    try {
      browser = await puppeteer.launch(getPuppeteerLaunchOptions());
      const page = await browser.newPage();
      // Allow more time on Render/cloud where Chromium is slow (avoid "Navigation timeout of 30000 ms exceeded")
      const pdfTimeout = process.env.RENDER === 'true' ? 60000 : 30000;
      page.setDefaultNavigationTimeout(pdfTimeout);
      page.setDefaultTimeout(pdfTimeout);

      // Step 4: Puppeteer generation - use 'load' for inline HTML (networkidle0 can hang with data URIs)
      await page.setContent(html, { waitUntil: 'load', timeout: pdfTimeout });
      
      // Wait for chart to fully render (critical for matching UI)
      try {
        await page.waitForSelector('#proctor-chart svg', { timeout: 15000 });
        // Additional wait for SVG rendering to complete
        await page.waitForTimeout(200);
      } catch (e) {
        console.warn('Timeout waiting for chart (continuing anyway):', e.message);
      }
      
      // Wait for any images (like logo) to load
      try {
        await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
        // Small wait to ensure images are fully rendered
        await page.waitForTimeout(500);
      } catch (e) {
        console.warn('Timeout waiting for images (continuing anyway):', e.message);
      }
      
      // Disable animations to ensure consistent rendering
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = '* { animation: none !important; transition: none !important; }';
        document.head.appendChild(style);
      });
      
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.4in',
          right: '0.4in',
          bottom: '0.4in',
          left: '0.4in'
        },
        preferCSSPageSize: false,
        displayHeaderFooter: false
      });

      await browser.close();

      // Validate PDF was generated
      if (!pdf || pdf.length === 0) {
        throw new Error('Generated PDF is empty');
      }

      // Step 1: Verify we are returning REAL PDF bytes
      const pdfBuffer = Buffer.from(pdf);
      const header = pdfBuffer.slice(0, 8).toString('ascii');
      const footer = pdfBuffer.slice(-20).toString('ascii');
      
      console.log('=== PDF Verification ===');
      console.log(`PDF buffer length: ${pdfBuffer.length} bytes`);
      console.log(`First 8 bytes: ${header} (should start with %PDF-)`);
      console.log(`Last 20 bytes: ${footer} (should contain %%EOF)`);
      
      // Verify PDF structure
      if (!header.startsWith('%PDF-')) {
        console.error('ERROR: PDF header is invalid! First 8 bytes:', pdfBuffer.slice(0, 20).toString('hex'));
        throw new Error('Generated PDF has invalid header - not a valid PDF file');
      }
      
      if (!footer.includes('%%EOF')) {
        console.error('ERROR: PDF footer is missing %%EOF!');
        throw new Error('Generated PDF appears truncated - missing EOF marker');
      }
      
      console.log('PDF structure verified: Valid PDF file');
      console.log('========================');

      // Save PDF to file system
      let saveInfo = null;
      let saveError = null;
      try {
        const saveTenantId = tenantIdForPath;
        saveInfo = await getPDFSavePath(
          task.projectNumber,
          'PROCTOR',
          fieldDate,
          isRegeneration,
          saveTenantId
        );
        
        await savePDFToFile(pdfBuffer, saveInfo.filePath);
        console.log(`[Proctor PDF] tenantId=${saveTenantId} → saved: ${saveInfo.filePath}`);
        console.log(`Filename: ${saveInfo.filename} (Sequence: ${saveInfo.sequence}${saveInfo.isRevision ? `, Revision: ${saveInfo.revisionNumber}` : ''})`);
      } catch (saveErr) {
        saveError = saveErr;
        console.error('Error saving PDF to file:', saveErr);
        console.error('Save error stack:', saveErr.stack);
      }

      // Return JSON response with save info and download URL
      // savedToConfiguredPath: false when using deployed server (e.g. Render) or path not set - file cannot be saved to user's folder
      res.status(200).json({
        success: true,
        saved: saveInfo !== null,
        savedPath: saveInfo ? saveInfo.filePath : null,
        fileName: saveInfo ? saveInfo.filename : null,
        sequence: saveInfo ? saveInfo.sequence : null,
        isRevision: saveInfo ? saveInfo.isRevision : false,
        revisionNumber: saveInfo ? saveInfo.revisionNumber : null,
        savedToConfiguredPath: saveInfo ? !!saveInfo.fromConfigured : false,
        downloadUrl: `/api/proctor/${taskId}/pdf/download?token=${encodeURIComponent(req.headers.authorization || '')}`,
        saveError: saveError ? saveError.message : null,
        pdfBase64: pdfBuffer.toString('base64')
      });
    } catch (pdfError) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      throw pdfError;
    }
  } catch (error) {
    console.error('Error generating Proctor PDF:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
  }
});

// Get Proctor data by taskId (tenant-scoped)
router.get('/task/:taskId', authenticate, requireTenant, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number, client_name)
        `)
        .eq('id', taskId)
        .eq('task_type', 'PROCTOR')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        projectClientName: data.projects?.client_name ?? null,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber, p.clientName AS projectClientName
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'PROCTOR'`,
          [taskId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          }
        );
      });
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const data = await db.get('proctor_data', { taskId });

    if (data) {
      // Parse JSON fields
      if (typeof data.proctorPoints === 'string') {
        try {
          data.proctorPoints = JSON.parse(data.proctorPoints || '[]');
        } catch (e) {
          data.proctorPoints = [];
        }
      } else {
        data.proctorPoints = data.proctorPoints || [];
      }
      
      if (typeof data.zavPoints === 'string') {
        try {
          data.zavPoints = JSON.parse(data.zavPoints || '[]');
        } catch (e) {
          data.zavPoints = [];
        }
      } else {
        data.zavPoints = data.zavPoints || [];
      }
      
      if (typeof data.passing200 === 'string') {
        try {
          data.passing200 = JSON.parse(data.passing200 || '[]');
        } catch (e) {
          data.passing200 = [];
        }
      } else {
        data.passing200 = data.passing200 || [];
      }
      
      // Ensure passing200SummaryPct is included in response (fallback to percentPassing200 for backward compatibility)
      if (!data.passing200SummaryPct && data.percentPassing200) {
        data.passing200SummaryPct = data.percentPassing200;
      }
      
      // QA: Handle naming mismatch - ensure liquidLimitLL is set (might be liquidLimitLl from conversion)
      if (!data.liquidLimitLL && data.liquidLimitLl) {
        data.liquidLimitLL = data.liquidLimitLl;
        delete data.liquidLimitLl; // Remove the incorrect key
      }
      
      // QA: Debug logging to verify field names
      console.log('🔍 [QA] Proctor GET - Field names in response:', {
        hasLiquidLimitLL: !!data.liquidLimitLL,
        hasLiquidLimitLl: !!data.liquidLimitLl,
        liquidLimitLL: data.liquidLimitLL,
        plasticLimit: data.plasticLimit,
        plasticityIndex: data.plasticityIndex
      });

      {
        const saved = data.client != null ? String(data.client).trim() : '';
        data.client = saved || (task.projectClientName || '');
      }
      
      res.json(data);
    } else {
      // Return empty structure with project info
      res.json({
        taskId: parseInt(taskId),
        projectName: task.projectName || '',
        projectNumber: task.projectNumber || '',
        sampledBy: 'MAK Lonestar Consulting, LLC',
        testMethod: 'ASTM D698',
        client: task.projectClientName || '',
        soilClassification: '',
        maximumDryDensityPcf: '',
        optimumMoisturePercent: '',
        correctedDryDensityPcf: '',
        correctedMoistureContentPercent: '',
        applyCorrectionFactor: false,
        liquidLimitLL: '',
        plasticLimit: '',
        plasticityIndex: '',
        sampleDate: '',
        calculatedBy: '',
        reviewedBy: '',
        checkedBy: '',
        percentPassing200: '',
        passing200: [],
        passing200SummaryPct: '',
        specificGravityG: '',
        proctorPoints: [],
        zavPoints: []
      });
    }
  } catch (err) {
    console.error('Error fetching Proctor data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save Proctor data (tenant-scoped)
router.post('/task/:taskId', authenticate, requireTenant, [
  body('projectName').optional().trim(),
  body('projectNumber').optional().trim(),
  body('sampledBy').optional().trim(),
  body('testMethod').optional().trim(),
  body('client').optional().trim(),
  body('soilClassification').optional().trim(),
  // Canonical fields (preferred) - accept as number or string that can be parsed
  body('optMoisturePct').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return !isNaN(num);
  }).withMessage('optMoisturePct must be a number'),
  body('maxDryDensityPcf').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return !isNaN(num);
  }).withMessage('maxDryDensityPcf must be a number'),
  // Legacy fields (for backward compatibility)
  body('maximumDryDensityPcf').optional().trim(),
  body('optimumMoisturePercent').optional().trim(),
  body('liquidLimitLL').optional().trim(),
  body('plasticLimit').optional().trim(), // Add plasticLimit to validation
  body('plasticityIndex').optional().trim(),
  body('sampleDate').optional().trim(),
  body('calculatedBy').optional().trim(),
  body('reviewedBy').optional().trim(),
  body('checkedBy').optional().trim(),
  body('percentPassing200').optional().trim(),
  body('specificGravityG').optional().trim(),
  body('proctorPoints').optional().isArray(),
  body('zavPoints').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.taskId;

    // Check task access
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id(project_name, project_number)
        `)
        .eq('id', taskId)
        .eq('task_type', 'PROCTOR')
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      task = {
        ...data,
        projectName: data.projects?.project_name,
        projectNumber: data.projects?.project_number,
        projects: undefined
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.*, p.projectName, p.projectNumber
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           WHERE t.id = ? AND t.taskType = 'PROCTOR'`,
          [taskId],
          (err, row) => {
            if (err) {
              return reject(err);
            }
            resolve(row || null);
          }
        );
      });
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
    }

    if (req.tenantId != null && (task.tenant_id ?? task.tenantId) !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const assignedTechId = task.assigned_technician_id ?? task.assignedTechnicianId;
    if (req.user.role === 'TECHNICIAN' && assignedTechId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantId = task.tenant_id ?? task.tenantId ?? req.tenantId;
    const {
      projectName,
      projectNumber,
      sampledBy,
      testMethod,
      client,
      soilClassification,
      maximumDryDensityPcf,
      optimumMoisturePercent,
      correctedDryDensityPcf,
      correctedMoistureContentPercent,
      applyCorrectionFactor,
      // Canonical fields (preferred)
      optMoisturePct,
      maxDryDensityPcf,
      liquidLimitLL,
      plasticLimit,
      plasticityIndex,
      sampleDate,
      calculatedBy,
      reviewedBy,
      checkedBy,
      percentPassing200,
      passing200,
      passing200SummaryPct,
      specificGravityG,
      proctorPoints,
      zavPoints
    } = req.body;

    // Use canonical fields if provided, otherwise fallback to old field names
    // Handle both number and string types
    const canonicalOptMoisture = (optMoisturePct !== undefined && optMoisturePct !== null && optMoisturePct !== '')
      ? (typeof optMoisturePct === 'number' ? optMoisturePct : parseFloat(optMoisturePct))
      : (optimumMoisturePercent && optimumMoisturePercent !== '' ? parseFloat(optimumMoisturePercent) : null);
    
    const canonicalMaxDensity = (maxDryDensityPcf !== undefined && maxDryDensityPcf !== null && maxDryDensityPcf !== '')
      ? (typeof maxDryDensityPcf === 'number' ? maxDryDensityPcf : parseFloat(maxDryDensityPcf))
      : (maximumDryDensityPcf && maximumDryDensityPcf !== '' ? parseFloat(maximumDryDensityPcf) : null);
    
    // Validate parsed values (reject NaN)
    const finalOptMoisture = (canonicalOptMoisture !== null && !isNaN(canonicalOptMoisture)) ? canonicalOptMoisture : null;
    const finalMaxDensity = (canonicalMaxDensity !== null && !isNaN(canonicalMaxDensity)) ? canonicalMaxDensity : null;

    // Serialize arrays to JSON
    const proctorPointsJson = proctorPoints ? JSON.stringify(proctorPoints) : null;
    const zavPointsJson = zavPoints ? JSON.stringify(zavPoints) : null;
    const passing200Json = passing200 ? JSON.stringify(passing200) : null;

    // Check if record exists
    const existing = await db.get('proctor_data', { taskId: parseInt(taskId) });

    // When updating, preserve sign-off fields (sample date, calculated/reviewed/checked by) if
    // the request did not send them or sent empty — they are only edited on the Summary step,
    // and ProctorForm (Step 1) sends empty strings when user clicks Next after having saved on Summary.
    const hasSignOffValue = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    const sampleDateFinal = existing && !hasSignOffValue(sampleDate) ? (existing.sampleDate ?? existing.sample_date ?? null) : (sampleDate || null);
    const calculatedByFinal = existing && !hasSignOffValue(calculatedBy) ? (existing.calculatedBy ?? existing.calculated_by ?? null) : (calculatedBy || null);
    const reviewedByFinal = existing && !hasSignOffValue(reviewedBy) ? (existing.reviewedBy ?? existing.reviewed_by ?? null) : (reviewedBy || null);
    const checkedByFinal = existing && !hasSignOffValue(checkedBy) ? (existing.checkedBy ?? existing.checked_by ?? null) : (checkedBy || null);

    const proctorData = {
      taskId: parseInt(taskId),
      projectName: projectName || null,
      projectNumber: projectNumber || null,
      sampledBy: sampledBy || null,
      ...(tenantId != null ? { tenantId } : {}),
      testMethod: testMethod || null,
      client: client || null,
      soilClassification: soilClassification || null,
      description: null, // deprecated, set to NULL
      maximumDryDensityPcf: maximumDryDensityPcf || null, // Keep old field for backward compatibility
      optimumMoisturePercent: optimumMoisturePercent || null, // Keep old field for backward compatibility
      correctedDryDensityPcf: correctedDryDensityPcf || null,
      correctedMoistureContentPercent: correctedMoistureContentPercent || null,
      applyCorrectionFactor: applyCorrectionFactor !== undefined ? applyCorrectionFactor : false,
      optMoisturePct: finalOptMoisture, // Canonical field
      maxDryDensityPcf: finalMaxDensity, // Canonical field
      liquidLimitLL: liquidLimitLL || null,
      plasticLimit: plasticLimit || null,
      plasticityIndex: plasticityIndex || null,
      sampleDate: sampleDateFinal,
      calculatedBy: calculatedByFinal,
      reviewedBy: reviewedByFinal,
      checkedBy: checkedByFinal,
      percentPassing200: percentPassing200 || null,
      passing200: passing200Json,
      passing200SummaryPct: passing200SummaryPct || null,
      specificGravityG: specificGravityG || null,
      proctorPoints: proctorPointsJson,
      zavPoints: zavPointsJson
    };

    const isTenantIdError = (e) => e && e.message && /tenant_id/.test(e.message);
    let result;
    if (existing) {
      try {
        await db.update('proctor_data', proctorData, { taskId: parseInt(taskId) });
      } catch (e) {
        if (isTenantIdError(e) && proctorData.tenantId != null) {
          delete proctorData.tenantId;
          await db.update('proctor_data', proctorData, { taskId: parseInt(taskId) });
        } else throw e;
      }
      result = await db.get('proctor_data', { taskId: parseInt(taskId) });
    } else {
      try {
        result = await db.insert('proctor_data', proctorData);
      } catch (e) {
        if (isTenantIdError(e) && proctorData.tenantId != null) {
          delete proctorData.tenantId;
          result = await db.insert('proctor_data', proctorData);
        } else throw e;
      }
    }

    // Parse JSON fields
    if (result) {
      try {
        result.proctorPoints = result.proctorPoints ? JSON.parse(result.proctorPoints) : [];
        result.zavPoints = result.zavPoints ? JSON.parse(result.zavPoints) : [];
        result.passing200 = result.passing200 ? JSON.parse(result.passing200) : [];
      } catch (e) {
        result.proctorPoints = [];
        result.zavPoints = [];
        result.passing200 = [];
      }
    }

    res.status(existing ? 200 : 201).json(result);
  } catch (err) {
    console.error('Error saving Proctor data:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Get Proctor data by projectId + proctorNo (for Density auto-fill)
router.get('/project/:projectId/proctor/:proctorNo', authenticate, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const proctorNo = parseInt(req.params.proctorNo);

    // Check project access
    const project = await db.get('projects', { id: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get Proctor task by projectId + proctorNo
    let task;
    if (db.isSupabase()) {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, proctor_no')
        .eq('project_id', projectId)
        .eq('task_type', 'PROCTOR')
        .eq('proctor_no', proctorNo)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ error: `Proctor #${proctorNo} not found for this project` });
      }
      
      task = {
        id: data.id,
        proctorNo: data.proctor_no
      };
    } else {
      const sqliteDb = require('../database');
      task = await new Promise((resolve, reject) => {
        sqliteDb.get(
          `SELECT t.id, t.proctorNo
           FROM tasks t
           WHERE t.projectId = ? AND t.taskType = 'PROCTOR' AND t.proctorNo = ?`,
          [projectId, proctorNo],
          (err, row) => {
            if (err) {
              return reject(err);
            }
            resolve(row || null);
          }
        );
      });
      
      if (!task) {
        return res.status(404).json({ error: `Proctor #${proctorNo} not found for this project` });
      }
    }

    // Get Proctor data - use canonical fields with backward compatibility
    const data = await db.get('proctor_data', { taskId: task.id });

    // Use canonical fields if available, otherwise fallback to old fields
    const optMoisturePct = data?.optMoisturePct !== null && data?.optMoisturePct !== undefined
      ? data.optMoisturePct
      : (data?.optimumMoisturePercent ? parseFloat(data.optimumMoisturePercent) : null);
    
    const maxDryDensityPcf = data?.maxDryDensityPcf !== null && data?.maxDryDensityPcf !== undefined
      ? data.maxDryDensityPcf
      : (data?.maximumDryDensityPcf ? parseFloat(data.maximumDryDensityPcf) : null);

    // Debug logging
    console.log(`[Proctor API] Fetching Proctor #${proctorNo} for project ${projectId}:`, {
      taskId: task.id,
      optMoisturePct,
      maxDryDensityPcf,
      rawData: data
    });

    if (optMoisturePct !== null && maxDryDensityPcf !== null) {
      res.json({
        proctorNo: proctorNo,
        optMoisturePct: optMoisturePct,
        maxDryDensityPcf: maxDryDensityPcf,
        soilClassification: data?.soilClassification || null,
        soilClassificationText: data?.soilClassification || null
      });
    } else {
      res.status(404).json({ error: `Proctor #${proctorNo} data not found. Please save the Proctor report first.` });
    }
  } catch (err) {
    console.error('Error fetching Proctor data by projectId + proctorNo:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

module.exports = router;

