const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { getPDFSavePath, savePDFToFile } = require('../utils/pdfFileManager');

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

// Helper function to generate Proctor Curve Chart as SVG - MUST match UI exactly
function generateProctorChartSVG(reportData) {
  // Helper to convert values to numbers (same as UI component)
  const toNum = (v) => {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(/,/g, "");
    if (s === "") return NaN;
    return Number(s);
  };

  const proctorPointsRaw = reportData.proctorPoints || [];
  const zavPointsRaw = reportData.zavPoints || [];
  const omc = reportData.optimumMoisturePercent ? parseFloat(reportData.optimumMoisturePercent) : undefined;
  const maxDensity = reportData.maximumDryDensityPcf ? parseFloat(reportData.maximumDryDensityPcf) : undefined;
  
  // EXACT same data processing as UI component
  const cleanedProctorPoints = proctorPointsRaw
    .map(p => ({ x: toNum(p.x), y: toNum(p.y) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .sort((a, b) => a.x - b.x);
  
  const cleanedZAVPoints = zavPointsRaw
    .map(p => ({ x: toNum(p.x), y: toNum(p.y) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y))
    .sort((a, b) => a.x - b.x);
  
  // Filter and clamp ZAV points - EXACT same logic as UI
  const yAxisMin = 100; // Fixed Y-axis minimum (same as UI)
  const yAxisMax = 112; // Fixed Y-axis maximum (same as UI)
  const filteredZAVPoints = cleanedZAVPoints
    .filter(p => p.x >= 0 && p.x <= 25)
    .map(p => ({ x: Math.max(0, Math.min(25, p.x)), y: p.y }))
    .filter(p => p.y >= yAxisMin && p.y <= yAxisMax); // Exclude below Y-axis minimum and above Y-axis maximum
  
  // Use EXACT same axis domains as UI
  const xDomain = [0, 25];
  const yDomain = [100, 112];
  const xTicks = [0, 5, 10, 15, 20, 25];
  const yTicks = [100, 102, 104, 106, 108, 110, 112];
  
  // Chart dimensions - reduced height to fit on single page
  // Letter page is ~612px x 792px (72 DPI) or ~816px x 1056px (96 DPI)
  // Need to leave room for header, form fields, and margins (~350px header+form, ~40px margins = ~400px used)
  const width = 680;
  const height = 380; // Reduced from 420 to ensure entire chart fits on Page 1 (792px - 400px = 392px max)
  // Increased margins to prevent text clipping (top for ZAV label, bottom for x-axis, left for y-axis label)
  const margin = { top: 35, right: 25, bottom: 55, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // Scale functions
  const scaleX = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * chartWidth;
  const scaleY = (value) => margin.top + chartHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * chartHeight;
  
  // Generate Proctor curve path - use monotone interpolation (same as Recharts)
  let proctorPath = '';
  if (cleanedProctorPoints.length >= 2) {
    // Use monotone interpolation to create smooth curve
    const smoothPoints = monotoneInterpolation(cleanedProctorPoints);
    const pathData = smoothPoints.map((p, i) => {
      const x = scaleX(p.x);
      const y = scaleY(p.y);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    // BLACK line, width 2 (same as UI)
    proctorPath = `<path d="${pathData}" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (cleanedProctorPoints.length === 1) {
    // Single point - just draw a dot
    const p = cleanedProctorPoints[0];
    const x = scaleX(p.x);
    const y = scaleY(p.y);
    proctorPath = `<circle cx="${x}" cy="${y}" r="2" fill="#000" stroke="#000" stroke-width="1"/>`;
  }
  
  // Generate ZAV curve - use monotone interpolation for smoothness
  // Clip ZAV points to y-axis max to prevent overflow
  let zavPath = '';
  if (filteredZAVPoints.length >= 2) {
    // Clip any points that exceed y-axis max before interpolation
    const clippedZAVPoints = filteredZAVPoints.map(p => ({
      x: p.x,
      y: Math.min(p.y, yAxisMax) // Clamp to y-axis max
    }));
    const smoothZAVPoints = monotoneInterpolation(clippedZAVPoints);
    // Clip the path to y-axis max - filter and clamp points that exceed max
    const clippedPathPoints = smoothZAVPoints
      .map(p => ({ x: p.x, y: Math.min(p.y, yAxisMax) }))
      .filter((p, i, arr) => {
        // Only include points that are within bounds or help define the boundary
        if (i === 0 || i === arr.length - 1) return true; // Always include first and last
        return p.y <= yAxisMax;
      });
    
    if (clippedPathPoints.length >= 2) {
      const pathData = clippedPathPoints.map((p, i) => {
        const x = scaleX(p.x);
        const y = scaleY(Math.min(p.y, yAxisMax)); // Ensure y never exceeds max
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      }).join(' ');
      // BLACK line, width 2.5 (same as UI)
      zavPath = `<path d="${pathData}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  } else if (filteredZAVPoints.length === 1) {
    const p = filteredZAVPoints[0];
    const x = scaleX(p.x);
    const y = scaleY(p.y);
    zavPath = `<circle cx="${x}" cy="${y}" r="2" fill="#000" stroke="#000" stroke-width="1"/>`;
  }
  
  // Generate grid lines - same style as UI
  const gridLines = [];
  xTicks.forEach(tick => {
    const x = scaleX(tick);
    gridLines.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + chartHeight}" stroke="#d0d0d0" stroke-width="0.5" stroke-dasharray="1 1"/>`);
    // Ensure x-axis tick labels have adequate bottom padding (at least 20px from bottom edge)
    gridLines.push(`<text x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="#000">${tick}</text>`);
  });
  
  yTicks.forEach(tick => {
    const y = scaleY(tick);
    gridLines.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" stroke="#d0d0d0" stroke-width="0.5" stroke-dasharray="1 1"/>`);
    // Ensure y-axis labels have adequate left padding (at least 15px from left edge)
    gridLines.push(`<text x="${margin.left - 15}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="bold" fill="#000">${tick}</text>`);
  });
  
  // Reference lines - BLACK dashed (same as UI)
  let referenceLines = '';
  if (omc !== undefined && !isNaN(omc) && omc >= 0 && omc <= 25) {
    const x = scaleX(omc);
    referenceLines += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + chartHeight}" stroke="#000" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  }
  if (maxDensity !== undefined && !isNaN(maxDensity) && maxDensity >= yDomain[0] && maxDensity <= yDomain[1]) {
    const y = scaleY(maxDensity);
    referenceLines += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartWidth}" y2="${y}" stroke="#000" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  }
  
  // Peak point marker (small filled triangle at OMC/Max intersection)
  let peakMarker = '';
  if (omc !== undefined && maxDensity !== undefined && !isNaN(omc) && !isNaN(maxDensity) &&
      omc >= 0 && omc <= 25 && maxDensity >= yDomain[0] && maxDensity <= yDomain[1]) {
    const px = scaleX(omc);
    const py = scaleY(maxDensity);
    peakMarker = `<path d="M ${px} ${py - 3} L ${px - 3} ${py + 3} L ${px + 3} ${py + 3} Z" fill="#000" stroke="#000" stroke-width="1"/>`;
  }
  
  // Proctor points - hollow triangles (same as UI)
  const proctorMarkers = cleanedProctorPoints.map(p => {
    const x = scaleX(p.x);
    const y = scaleY(p.y);
    // Hollow triangle marker
    return `<path d="M ${x} ${y - 4} L ${x - 4} ${y + 4} L ${x + 4} ${y + 4} Z" fill="white" stroke="#000" stroke-width="1.5"/>`;
  }).join('');
  
  // ZAV label - positioned near curve (around moisture 17-20, same as UI)
  // Offset above the curve to prevent overlap
  let zavLabel = '';
  if (filteredZAVPoints.length > 0) {
    const targetPoint = filteredZAVPoints.find(p => p.x >= 17 && p.x <= 20) || 
                        filteredZAVPoints[Math.floor(filteredZAVPoints.length * 0.7)];
    if (targetPoint) {
      const labelX = scaleX(targetPoint.x);
      const labelY = scaleY(targetPoint.y);
      // Position label above the curve with adequate spacing (15px offset)
      // Ensure it's at least 20px from top edge
      const safeY = Math.max(labelY - 15, margin.top + 20);
      zavLabel = `<text x="${labelX + 15}" y="${safeY}" font-size="11" font-weight="bold" fill="#000" text-anchor="start">Zero Air Voids</text>`;
    }
  }
  
  // Axis labels - adjusted positions to ensure no clipping
  // Bottom axis label positioned with adequate spacing from bottom edge (moved up slightly)
  const xAxisLabel = `<text x="${width / 2}" y="${height - margin.bottom + 35}" text-anchor="middle" font-size="12" font-weight="bold" fill="#000">% Moisture</text>`;
  // Y-axis label positioned further left to avoid overlap with tick labels
  const yAxisLabel = `<text x="${margin.left / 2 - 10}" y="${height / 2}" text-anchor="middle" font-size="12" font-weight="bold" fill="#000" transform="rotate(-90, ${margin.left / 2 - 10}, ${height / 2})">Dry Density (LBS. Cu. Ft.)</text>`;
  
  // Chart border
  const chartBorder = `<rect x="${margin.left}" y="${margin.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="#000" stroke-width="1.5"/>`;
  
  return `
    <div id="proctor-chart" style="width: ${width}px; height: ${height}px; margin: 15px auto; padding: 15px; background: #fff; page-break-inside: avoid; break-inside: avoid;">
      <svg width="${width}" height="${height}" style="background: white; font-family: Arial, sans-serif;">
        <!-- Grid lines -->
        ${gridLines.join('')}
        
        <!-- Chart border -->
        ${chartBorder}
        
        <!-- ZAV Curve (render first so it's behind) -->
        ${zavPath}
        
        <!-- Proctor Curve -->
        ${proctorPath}
        
        <!-- Reference lines -->
        ${referenceLines}
        
        <!-- Peak point marker -->
        ${peakMarker}
        
        <!-- Proctor markers (hollow triangles) -->
        ${proctorMarkers}
        
        <!-- ZAV Label -->
        ${zavLabel}
        
        <!-- Axis labels -->
        ${xAxisLabel}
        ${yAxisLabel}
      </svg>
    </div>
  `;
}

// Generate Proctor PDF
router.post('/:taskId/pdf', authenticate, async (req, res) => {
  try {
    const { taskId } = req.params;
    const reportData = req.body;
    const isRegeneration = req.query.regenerate === 'true' || req.query.regen === 'true';
    
    // Get task and project information for file naming
    const task = await new Promise((resolve, reject) => {
      db.get(
        `SELECT t.*, p.projectNumber, p.id as projectId, p.projectName
         FROM tasks t
         INNER JOIN projects p ON t.projectId = p.id
         WHERE t.id = ? AND t.taskType = 'PROCTOR'`,
        [taskId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check access
    if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get field date (prefer scheduledStartDate, fallback to sampleDate from reportData, then today)
    const fieldDate = task.scheduledStartDate || reportData.sampleDate || new Date().toISOString().split('T')[0];

    // Read the logo file (try multiple possible locations)
    let logoBase64 = '';
    let logoMimeType = 'image/jpeg';
    const possibleLogoPaths = [
      path.join(__dirname, '../public/MAK logo_consulting.jpg'),
      path.join(__dirname, '../../public/MAK logo_consulting.jpg'),
      path.join(__dirname, '../client/public/MAK logo_consulting.jpg'),
      path.join(__dirname, '../../client/public/MAK logo_consulting.jpg')
    ];
    
    for (const logoPath of possibleLogoPaths) {
      if (fs.existsSync(logoPath)) {
        try {
          const logoBuffer = fs.readFileSync(logoPath);
          logoBase64 = logoBuffer.toString('base64');
          console.log('Logo found at:', logoPath);
          break;
        } catch (err) {
          console.error('Error reading logo from', logoPath, err);
        }
      }
    }
    
    if (!logoBase64) {
      console.warn('MAK logo not found in any expected location');
    }

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
      max-width: 8.5in;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 15px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #000;
    }
    .header-logo {
      width: 150px;
    }
    .header-logo img {
      width: 100%;
      height: auto;
      max-width: 150px;
    }
    .header-address {
      font-size: 11px;
      line-height: 1.5;
      text-align: right;
      color: #333;
    }
    .title {
      text-align: center;
      color: #0066cc;
      font-size: 22px;
      font-weight: bold;
      margin: 25px 0;
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
        ${logoBase64 ? `<img src="data:${logoMimeType};base64,${logoBase64}" alt="MAK Logo" />` : '<div>MAK Logo</div>'}
      </div>
      <div class="header-address">
        <div>940 N Beltline Road, Suite 107,</div>
        <div>Irving, TX 75061</div>
        <div>P: 214-718-1250</div>
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
  </div>
</body>
</html>
    `;

    // Launch Puppeteer and generate PDF
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      const page = await browser.newPage();
      
      // Step 4: Puppeteer generation - wait for all assets + avoid partial renders
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // Wait for chart to fully render (critical for matching UI)
      try {
        await page.waitForSelector('#proctor-chart svg', { timeout: 10000 });
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
        saveInfo = await getPDFSavePath(
          task.projectNumber,
          'PROCTOR',
          fieldDate,
          isRegeneration
        );
        
        await savePDFToFile(pdfBuffer, saveInfo.filePath);
        console.log(`PDF saved: ${saveInfo.filePath}`);
        console.log(`Filename: ${saveInfo.filename} (Sequence: ${saveInfo.sequence}${saveInfo.isRevision ? `, Revision: ${saveInfo.revisionNumber}` : ''})`);
      } catch (saveErr) {
        saveError = saveErr;
        console.error('Error saving PDF to file:', saveErr);
        console.error('Save error stack:', saveErr.stack);
      }

      // Return JSON response with save info and download URL
      // Frontend can then trigger download if needed
      res.status(200).json({
        success: true,
        saved: saveInfo !== null,
        savedPath: saveInfo ? saveInfo.filePath : null,
        fileName: saveInfo ? saveInfo.filename : null,
        sequence: saveInfo ? saveInfo.sequence : null,
        isRevision: saveInfo ? saveInfo.isRevision : false,
        revisionNumber: saveInfo ? saveInfo.revisionNumber : null,
        downloadUrl: `/api/proctor/${taskId}/pdf/download?token=${encodeURIComponent(req.headers.authorization || '')}`,
        saveError: saveError ? saveError.message : null,
        // Include PDF as base64 for download (optional - frontend can also use downloadUrl)
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

module.exports = router;

