const express = require('express');
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { saveReportPDF } = require('../utils/pdfFileManager');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Logo configuration - reusable across all reports
const LOGO_CONFIG = {
  path: path.join(__dirname, '..', 'public', 'MAK logo_consulting.jpg'),
  fallback: null // Will be set if logo exists
};

// Helper function to get logo as base64 data URI (for embedding in HTML/PDF)
function getLogoBase64() {
  try {
    if (fs.existsSync(LOGO_CONFIG.path)) {
      const imageBuffer = fs.readFileSync(LOGO_CONFIG.path);
      const base64 = imageBuffer.toString('base64');
      const mimeType = 'image/jpeg'; // Assuming JPG
      return `data:${mimeType};base64,${base64}`;
    }
  } catch (err) {
    console.warn('Error loading logo:', err.message);
  }
  return null; // Return null if logo not found
}

// Generate PDF for WP1 (supports both workPackageId and taskId)
router.get('/wp1/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  const isTask = req.query.type === 'task'; // Check query param

  try {
    let taskOrWp = null;
    let wp1Data = null;

    // Try task first if isTask flag is set, otherwise try workPackage
    if (isTask) {
      // Get task and project info
      taskOrWp = await new Promise((resolve, reject) => {
        db.get(
          `SELECT t.*, p.projectName, p.projectNumber, p.specStrengthPsi, p.specAmbientTempF,
           p.specConcreteTempF, p.specSlump, p.specAirContentByVolume,
           u.name as technicianName
           FROM tasks t
           INNER JOIN projects p ON t.projectId = p.id
           LEFT JOIN users u ON t.assignedTechnicianId = u.id
           WHERE t.id = ? AND t.taskType = 'COMPRESSIVE_STRENGTH'`,
          [id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!taskOrWp) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && taskOrWp.assignedTechnicianId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get WP1 data by taskId
      wp1Data = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM wp1_data WHERE taskId = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    } else {
      // Get work package and project info
      taskOrWp = await new Promise((resolve, reject) => {
        db.get(
          `SELECT wp.*, p.projectName, p.projectNumber, p.projectSpec, p.customerEmail,
           u.name as technicianName
           FROM workpackages wp
           INNER JOIN projects p ON wp.projectId = p.id
           LEFT JOIN users u ON wp.assignedTo = u.id
           WHERE wp.id = ? AND wp.type = 'WP1'`,
          [id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!taskOrWp) {
        return res.status(404).json({ error: 'Work package not found' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && taskOrWp.assignedTo !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get WP1 data by workPackageId
      wp1Data = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM wp1_data WHERE workPackageId = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }

    if (!wp1Data) {
      return res.status(404).json({ error: 'No data found. Please save the form first.' });
    }

    // Parse cylinders
    try {
      wp1Data.cylinders = JSON.parse(wp1Data.cylinders || '[]');
    } catch (e) {
      console.error('Error parsing cylinders:', e);
      wp1Data.cylinders = [];
    }

    // Read HTML template
    const templatePath = path.join(__dirname, '..', 'templates', 'wp1-report.html');
    if (!fs.existsSync(templatePath)) {
      console.error('Template file not found:', templatePath);
      return res.status(500).json({ error: 'Template file not found' });
    }
    let html = fs.readFileSync(templatePath, 'utf8');

    // Helper function to escape HTML
    const escapeHtml = (text) => {
      if (!text && text !== 0) return '&nbsp;';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Helper function to calculate Date Tested from Placement Date + Age
    const calculateDateTested = (placementDateStr, ageDaysStr) => {
      if (!placementDateStr || !ageDaysStr) return '';
      const ageDays = parseInt(ageDaysStr);
      if (isNaN(ageDays) || ageDays < 0) return '';
      try {
        const placementDate = new Date(placementDateStr);
        if (isNaN(placementDate.getTime())) return '';
        const testDate = new Date(placementDate);
        testDate.setDate(testDate.getDate() + ageDays);
        return testDate.toISOString().split('T')[0];
      } catch (e) {
        return '';
      }
    };

    // Format date for display
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    };

    // Format time from 24-hour format (HH:MM) to 12-hour format with AM/PM
    const formatTime = (timeString) => {
      if (!timeString) return '';
      try {
        // Handle formats like "07:42" or "7:42" or "19:30"
        const parts = timeString.split(':');
        if (parts.length !== 2) return timeString; // Return original if invalid format
        
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        
        if (isNaN(hours) || hours < 0 || hours > 23) return timeString;
        
        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours === 0) {
          hours = 12; // 00:xx -> 12:xx AM
        } else if (hours > 12) {
          hours = hours - 12; // 13-23 -> 1-11 PM
        }
        // hours is already 1-12 for AM/PM format
        
        return `${hours}:${minutes} ${period}`;
      } catch (e) {
        return timeString; // Return original if invalid
      }
    };

    // Get logo as base64 data URI and replace placeholder
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64 
      ? `<img src="${logoBase64}" alt="MAK Lone Star Consulting Logo" style="max-width: 120px; max-height: 80px; object-fit: contain;" />`
      : '<div class="logo-placeholder">MAK</div>';
    html = html.replace('{{LOGO_IMAGE}}', logoHtml);

    // Replace basic placeholders
    html = html.replace('{{PROJECT_NAME}}', escapeHtml(taskOrWp.projectName || ''));
    html = html.replace('{{PROJECT_NUMBER}}', escapeHtml(taskOrWp.projectNumber || ''));
    html = html.replace('{{TECHNICIAN}}', escapeHtml(wp1Data.technician || taskOrWp.technicianName || ''));
    html = html.replace('{{WEATHER}}', escapeHtml(wp1Data.weather || ''));
    html = html.replace('{{PLACEMENT_DATE}}', escapeHtml(formatDate(wp1Data.placementDate)));
    
    // Spec Strength
    const specStrength = wp1Data.specStrength || taskOrWp.specStrengthPsi || '';
    const specStrengthDays = wp1Data.specStrengthDays || 28;
    html = html.replace('{{SPEC_STRENGTH}}', escapeHtml(specStrength));
    html = html.replace('{{SPEC_STRENGTH_DAYS}}', escapeHtml(specStrengthDays));

    // Sample Information
    html = html.replace('{{STRUCTURE}}', escapeHtml(wp1Data.structure || ''));
    html = html.replace('{{SAMPLE_LOCATION}}', escapeHtml(wp1Data.sampleLocation || ''));
    html = html.replace('{{SUPPLIER}}', escapeHtml(wp1Data.supplier || ''));
    html = html.replace('{{TIME_BATCHED}}', escapeHtml(formatTime(wp1Data.timeBatched || '')));
    html = html.replace('{{CLASS_MIX_ID}}', escapeHtml(wp1Data.classMixId || ''));
    html = html.replace('{{TIME_SAMPLED}}', escapeHtml(formatTime(wp1Data.timeSampled || '')));
    html = html.replace('{{YARDS_BATCHED}}', escapeHtml(wp1Data.yardsBatched || ''));
    html = html.replace('{{TRUCK_NO}}', escapeHtml(wp1Data.truckNo || ''));
    html = html.replace('{{TICKET_NO}}', escapeHtml(wp1Data.ticketNo || ''));
    html = html.replace('{{PLANT}}', escapeHtml(wp1Data.plant || ''));
    html = html.replace('{{YARDS_PLACED}}', escapeHtml(wp1Data.yardsPlaced || ''));
    html = html.replace('{{TOTAL_YARDS}}', escapeHtml(wp1Data.totalYards || ''));
    html = html.replace('{{WATER_ADDED}}', escapeHtml(wp1Data.waterAdded || ''));
    html = html.replace('{{UNIT_WEIGHT}}', escapeHtml(wp1Data.unitWeight || ''));
    html = html.replace('{{FINAL_CURE_METHOD}}', escapeHtml(wp1Data.finalCureMethod || 'STANDARD'));

    // Test Results
    html = html.replace('{{AMBIENT_TEMP_MEASURED}}', escapeHtml(wp1Data.ambientTempMeasured || ''));
    html = html.replace('{{AMBIENT_TEMP_SPECS}}', escapeHtml(wp1Data.ambientTempSpecs || taskOrWp.specAmbientTempF || ''));
    html = html.replace('{{CONCRETE_TEMP_MEASURED}}', escapeHtml(wp1Data.concreteTempMeasured || ''));
    html = html.replace('{{CONCRETE_TEMP_SPECS}}', escapeHtml(wp1Data.concreteTempSpecs || taskOrWp.specConcreteTempF || ''));
    html = html.replace('{{SLUMP_MEASURED}}', escapeHtml(wp1Data.slumpMeasured || ''));
    html = html.replace('{{SLUMP_SPECS}}', escapeHtml(wp1Data.slumpSpecs || taskOrWp.specSlump || ''));
    html = html.replace('{{AIR_CONTENT_MEASURED}}', escapeHtml(wp1Data.airContentMeasured || ''));
    html = html.replace('{{AIR_CONTENT_SPECS}}', escapeHtml(wp1Data.airContentSpecs || taskOrWp.specAirContentByVolume || ''));

    // Generate Specimen Sets HTML (group cylinders into sets of 5)
    let specimenSetsHtml = '';
    const placementDate = wp1Data.placementDate;
    let cylinderSets = []; // Track number of sets for REMARKS placement
    
    if (wp1Data.cylinders && wp1Data.cylinders.length > 0) {
      // Group cylinders into sets of 5
      for (let i = 0; i < wp1Data.cylinders.length; i += 5) {
        cylinderSets.push(wp1Data.cylinders.slice(i, i + 5));
      }

      // Generate HTML for each specimen set
      cylinderSets.forEach((set, setIndex) => {
        const firstCylinder = set[0];
        const specimenNo = firstCylinder?.specimenNo || '';
        const specimenType = firstCylinder?.specimenType || '';
        const specimenQty = firstCylinder?.specimenQty || set.length.toString();

        // Generate cylinder rows for this set
        let cylinderRowsHtml = '';
        set.forEach((cylinder) => {
          // Calculate Date Tested dynamically
          const dateTested = calculateDateTested(placementDate, cylinder.age);
          const dateTestedFormatted = dateTested ? formatDate(dateTested) : '';

          cylinderRowsHtml += `
            <tr>
              <td>${escapeHtml(cylinder.cylinderNumber || '')}</td>
              <td>${escapeHtml(cylinder.age || '')}</td>
              <td>${dateTestedFormatted || '&nbsp;'}</td>
              <td>${escapeHtml(cylinder.avgLength || '')}</td>
              <td>${escapeHtml(cylinder.avgWidth || '')}</td>
              <td>${escapeHtml(cylinder.avgDiameter || '')}</td>
              <td>${escapeHtml(cylinder.crossSectionalArea || '')}</td>
              <td>${cylinder.totalLoad ? cylinder.totalLoad.toLocaleString() : '&nbsp;'}</td>
              <td>${cylinder.compressiveStrength ? cylinder.compressiveStrength.toLocaleString() : '&nbsp;'}</td>
              <td>${escapeHtml(cylinder.fractureType || '')}</td>
            </tr>
          `;
        });

        // Ensure at least 5 rows for the table (fill with empty rows if needed)
        while (set.length < 5) {
          cylinderRowsHtml += `
            <tr>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          `;
          set.push({}); // Add placeholder to match row count
        }

        // Generate specimen set section HTML - wrapped in bordered container
        // First set gets 'first' class to prevent page break, others get page break
        const containerClass = setIndex === 0 ? 'specimen-set-container first' : 'specimen-set-container';
        specimenSetsHtml += `
          <!-- Specimen Set ${setIndex + 1} -->
          <div class="${containerClass}">
            <div class="section-box">
              <div class="section-title">Specimen Information - Specimen Set ${setIndex + 1}</div>
              <div class="field-row">
                <div class="field-group"><strong>SPECIMEN NO:</strong> ${escapeHtml(specimenNo)}</div>
                <div class="field-group"><strong>SPECIMEN TYPE:</strong> ${escapeHtml(specimenType)}</div>
                <div class="field-group"><strong>SPECIMEN QTY:</strong> ${escapeHtml(specimenQty)}</div>
              </div>
            </div>
            
            <div class="section-box">
              <div class="section-title" style="text-decoration: underline;">CONCRETE CYLINDERS COMPRESSIVE STRENGTH TESTS - Specimen Set ${setIndex + 1}</div>
              <table class="cylinders-table">
                <thead>
                  <tr>
                    <th>CYLINDER NUMBER</th>
                    <th>AGE (DAYS)</th>
                    <th>DATE TESTED</th>
                    <th>AVG LENGTH (in)</th>
                    <th>AVG WIDTH (in)</th>
                    <th>AVG DIAMETER (in)</th>
                    <th>CROSS-SECTIONAL AREA (sq.in)</th>
                    <th>TOTAL LOAD (lbs)</th>
                    <th>Compressive Strength (psi)</th>
                    <th>Fracture Type</th>
                  </tr>
                </thead>
                <tbody>
                  ${cylinderRowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });
    } else {
      // If no cylinders, show at least one empty set
      specimenSetsHtml += `
        <div class="specimen-set-container">
          <div class="section-box">
            <div class="section-title">Specimen Information - Specimen Set 1</div>
            <div class="field-row">
              <div class="field-group"><strong>SPECIMEN NO:</strong> </div>
              <div class="field-group"><strong>SPECIMEN TYPE:</strong> </div>
              <div class="field-group"><strong>SPECIMEN QTY:</strong> </div>
            </div>
          </div>
          
          <div class="section-box">
            <div class="section-title" style="text-decoration: underline;">CONCRETE CYLINDERS COMPRESSIVE STRENGTH TESTS - Specimen Set 1</div>
            <table class="cylinders-table">
              <thead>
                <tr>
                  <th>CYLINDER NUMBER</th>
                  <th>AGE (DAYS)</th>
                  <th>DATE TESTED</th>
                  <th>AVG LENGTH (in)</th>
                  <th>AVG WIDTH (in)</th>
                  <th>AVG DIAMETER (in)</th>
                  <th>CROSS-SECTIONAL AREA (sq.in)</th>
                  <th>TOTAL LOAD (lbs)</th>
                  <th>Compressive Strength (psi)</th>
                  <th>Fracture Type</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    html = html.replace('{{SPECIMEN_SETS}}', specimenSetsHtml);

    // Generate REMARKS section conditionally
    // If only 1 specimen set, move REMARKS to Page 2 with top spacing
    const hasOnlyOneSet = cylinderSets.length === 1;
    const remarksSectionClass = hasOnlyOneSet ? 'remarks-section-page2' : 'remarks-section';
    const remarksHtml = `
      <div class="${remarksSectionClass} section-box">
        <div class="section-title">REMARKS:</div>
        <div class="remarks-box">${escapeHtml(wp1Data.remarks || '')}</div>
      </div>
    `;
    html = html.replace('{{REMARKS_SECTION}}', remarksHtml);

    // Generate PDF using Puppeteer
    console.log('Launching Puppeteer for WP1 PDF generation...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Capture console errors
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      
      // Capture page errors
      page.on('pageerror', error => {
        consoleErrors.push(`Page error: ${error.message}`);
      });
      
      // Set viewport to match Letter size
      await page.setViewport({
        width: 816,  // 8.5 inches * 96 DPI
        height: 1056, // 11 inches * 96 DPI
        deviceScaleFactor: 1
      });
      
      // Set content and wait for it to load
      await page.setContent(html, { waitUntil: 'load' });
      
      // Inject JavaScript to update page numbers dynamically
      await page.evaluate(() => {
        // Update page numbers using CSS counters (fallback for browsers that don't support @page)
        const pageCounters = document.querySelectorAll('.page-counter');
        let pageNum = 1;
        pageCounters.forEach(counter => {
          counter.textContent = pageNum;
          pageNum++;
        });
      });
      
      // Log any console errors
      if (consoleErrors.length > 0) {
        console.warn('Console errors during PDF generation:', consoleErrors);
      }
      
      // Wait a bit to ensure all rendering is complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate PDF with proper margins for border and footer
      // Border and page numbers handled via headerFooter templates
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.15in', right: '0.15in', bottom: '0.5in', left: '0.15in' }, // Margins create space for border
        preferCSSPageSize: false,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 3px solid #000; border-bottom: none; pointer-events: none; box-sizing: border-box;"></div>
        `,
        footerTemplate: `
          <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; border: 3px solid #000; border-top: none; pointer-events: none; box-sizing: border-box;">
            <div style="position: absolute; bottom: 0.2in; left: 0.5in; font-size: 9pt; color: #000;">Page <span class="pageNumber"></span></div>
            <div style="position: absolute; bottom: 0.2in; right: 0.5in; font-size: 9pt; color: #000;">MAK Lonestar Consulting, LLC</div>
          </div>
        `
      });

      await browser.close();

      if (!pdf || pdf.length === 0) {
        console.error('PDF buffer is empty');
        return res.status(500).json({ error: 'Failed to generate PDF: Empty buffer' });
      }

      // Convert to Buffer if it's not already
      const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
      
      // Verify PDF starts with PDF header
      const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
      if (pdfHeader !== '%PDF') {
        console.error('Invalid PDF header:', pdfHeader);
        return res.status(500).json({ error: 'Failed to generate PDF: Invalid PDF format' });
      }

      console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
      
      // Determine field date for filename (use scheduledStartDate from task, or placementDate from report, or today)
      const fieldDate = taskOrWp.scheduledStartDate || wp1Data.placementDate || new Date().toISOString().split('T')[0];
      const isRegeneration = req.query.regenerate === 'true' || req.query.regen === 'true';
      
      // Determine task type - use 'COMPRESSIVE_STRENGTH' for task-based WP1, or 'CYLINDER_PICKUP' for work package
      const taskType = isTask ? 'COMPRESSIVE_STRENGTH' : 'CYLINDER_PICKUP';
      
      // Save PDF to file system
      let saveInfo = null;
      let saveError = null;
      try {
        saveInfo = await saveReportPDF(
          taskOrWp.projectNumber,
          taskType,
          fieldDate,
          pdfBuffer,
          isRegeneration
        );
        
        if (saveInfo.saved) {
          console.log(`PDF saved: ${saveInfo.filePath}`);
        } else if (saveInfo.saveError) {
          console.error('Error saving PDF to file:', saveInfo.saveError);
          saveError = saveInfo.saveError;
        }
      } catch (saveErr) {
        console.error('Error saving PDF to file:', saveErr);
        saveError = saveErr.message;
        // Continue even if save fails - still return PDF to client
      }
      
      // Return JSON response with save info and PDF as base64
      res.status(200).json({
        success: true,
        saved: saveInfo ? saveInfo.saved : false,
        savedPath: saveInfo ? saveInfo.savedPath : null,
        fileName: saveInfo ? saveInfo.fileName : null,
        sequence: saveInfo ? saveInfo.sequence : null,
        isRevision: saveInfo ? saveInfo.isRevision : false,
        revisionNumber: saveInfo ? saveInfo.revisionNumber : null,
        downloadUrl: `/api/pdf/wp1/${id}/download?type=${isTask ? 'task' : 'wp'}&token=${encodeURIComponent(req.headers.authorization || '')}`,
        saveError: saveError,
        pdfBase64: pdfBuffer.toString('base64')
      });
    } catch (puppeteerError) {
      await browser.close();
      console.error('Puppeteer error:', puppeteerError);
      throw puppeteerError;
    }
  } catch (err) {
    console.error('Error generating WP1 PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF: ' + (err.message || String(err)) });
    } else {
      res.end();
    }
  }
});

// Generate PDF for Task Details (Job Ticket / Work Order)
router.get('/task/:taskId', authenticate, (req, res) => {
  const taskId = req.params.taskId;

  // Get task and project info
  db.get(
    `SELECT t.*, u.name as assignedTechnicianName, u.email as assignedTechnicianEmail,
     p.projectName, p.projectNumber, p.customerEmail
     FROM tasks t
     LEFT JOIN users u ON t.assignedTechnicianId = u.id
     INNER JOIN projects p ON t.projectId = p.id
     WHERE t.id = ?`,
    [taskId],
    (err, task) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check access
      if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      try {
        // Set headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="task-work-order-${task.projectNumber || taskId}.pdf"`);

        // Create PDF document
        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

        doc.on('error', (err) => {
          console.error('PDF Document error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
          } else {
            res.end();
          }
        });

        doc.pipe(res);

        const pageWidth = 612;
        const margin = 50;
        const usableWidth = pageWidth - (margin * 2); // 512 points

        // Header
        doc.fontSize(10)
           .text('MAK Lonestar Consulting, LLC', 50, 50)
           .text('940 N Beltline Road, Suite 107', 50, 65)
           .text('Irving, TX 75061', 50, 80)
           .text('Tel (214) 718-1250', 50, 95);

        // Title
        doc.fontSize(14)
           .text('TASK WORK ORDER / JOB TICKET', 50, 130, { underline: true });

        let yPos = 170;

        // Project Information
        doc.fontSize(11)
           .text('Project Information', 50, yPos, { underline: true });
        yPos += 20;
        doc.fontSize(10)
           .text(`PROJECT: ${task.projectName || ''}`, 50, yPos);
        yPos += 15;
        doc.text(`PROJECT NO: ${task.projectNumber || ''}`, 50, yPos);
        yPos += 30;

        // Task Information
        doc.fontSize(11)
           .text('Task Information', 50, yPos, { underline: true });
        yPos += 20;
        doc.fontSize(10)
           .text(`TASK TYPE: ${task.taskType || ''}`, 50, yPos);
        yPos += 15;
        doc.text(`ASSIGNED TO: ${task.assignedTechnicianName || 'Unassigned'}`, 50, yPos);
        yPos += 15;
        doc.text(`STATUS: ${task.status || ''}`, 50, yPos);
        yPos += 15;
        doc.text(`DUE DATE: ${task.dueDate || ''}`, 50, yPos);
        yPos += 30;

        // Schedule Information
        if (task.scheduledStartDate || task.scheduledEndDate) {
          doc.fontSize(11)
             .text('Schedule Information', 50, yPos, { underline: true });
          yPos += 20;
          doc.fontSize(10);
          if (task.scheduledStartDate && task.scheduledEndDate) {
            doc.text(`SCHEDULED: ${task.scheduledStartDate} to ${task.scheduledEndDate}`, 50, yPos);
          } else if (task.scheduledStartDate) {
            doc.text(`SCHEDULED: ${task.scheduledStartDate}`, 50, yPos);
          }
          yPos += 30;
        }

        // Location Information
        if (task.locationName || task.locationNotes) {
          doc.fontSize(11)
             .text('Location Information', 50, yPos, { underline: true });
          yPos += 20;
          doc.fontSize(10);
          if (task.locationName) {
            doc.text(`LOCATION: ${task.locationName}`, 50, yPos);
            yPos += 15;
          }
          if (task.locationNotes) {
            doc.text(`NOTES: ${task.locationNotes}`, 50, yPos, { width: usableWidth - 20 });
            yPos += 30;
          }
        }

        // Engagement Notes
        if (task.engagementNotes) {
          doc.fontSize(11)
             .text('Instructions / Engagement Notes', 50, yPos, { underline: true });
          yPos += 20;
          doc.fontSize(10)
             .text(task.engagementNotes, 60, yPos, { width: usableWidth - 20 });
          yPos += 50;
        }

        // Footer
        const footerY = 750;
        doc.fontSize(8)
           .fillColor('#666666')
           .text(`Generated: ${new Date().toLocaleString()}`, 50, footerY)
           .text(`Task ID: ${task.id}`, 450, footerY, { align: 'right' });

        doc.end();
        console.log('Task PDF generation completed successfully');
      } catch (err) {
        console.error('PDF generation error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to generate PDF: ' + (err.message || String(err)) });
        } else {
          res.end();
        }
      }
    }
  );
});

// Generate PDF for Density Report using HTML template + Puppeteer
router.get('/density/:taskId', authenticate, async (req, res) => {
  const taskId = req.params.taskId;

  try {
    // Get task and project info
    db.get(
      `SELECT t.*, p.projectName, p.projectNumber, u.name as assignedTechnicianName
       FROM tasks t
       INNER JOIN projects p ON t.projectId = p.id
       LEFT JOIN users u ON t.assignedTechnicianId = u.id
       WHERE t.id = ? AND t.taskType = 'DENSITY_MEASUREMENT'`,
      [taskId],
      async (err, task) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        // Check access
        if (req.user.role === 'TECHNICIAN' && task.assignedTechnicianId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Get density report data
        db.get('SELECT * FROM density_reports WHERE taskId = ?', [taskId], async (err, data) => {
          if (err) {
            console.error('Database error fetching density report:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          if (!data) {
            return res.status(404).json({ error: 'No report data found. Please save the form first.' });
          }

          try {
            // Parse JSON fields
            try {
              data.testRows = JSON.parse(data.testRows || '[]');
              data.proctors = JSON.parse(data.proctors || '[]');
            } catch (e) {
              console.error('Error parsing JSON fields:', e);
              data.testRows = [];
              data.proctors = [];
            }

            // Ensure we have 19 test rows and 6 proctor rows
            while (data.testRows.length < 19) {
              data.testRows.push({});
            }
            while (data.proctors.length < 6) {
              data.proctors.push({});
            }

            // Read HTML template
            const templatePath = path.join(__dirname, '..', 'templates', 'density-report.html');
            if (!fs.existsSync(templatePath)) {
              console.error('Template file not found:', templatePath);
              return res.status(500).json({ error: 'Template file not found' });
            }
            let html = fs.readFileSync(templatePath, 'utf8');

            // Helper function to escape HTML
            const escapeHtml = (text) => {
              if (!text) return '&nbsp;';
              return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            };

            // Format date
            const datePerformed = data.datePerformed 
              ? new Date(data.datePerformed).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
              : '';

            // Get logo as base64 data URI and replace placeholder
            const logoBase64 = getLogoBase64();
            const logoHtml = logoBase64 
              ? `<img src="${logoBase64}" alt="MAK Lone Star Consulting Logo" style="max-width: 120px; max-height: 80px; object-fit: contain;" />`
              : '<div class="logo-placeholder">MAK</div>';
            html = html.replace('{{LOGO_IMAGE}}', logoHtml);

            // Replace header placeholders (escape HTML)
            html = html.replace('{{CLIENT_NAME}}', escapeHtml(data.clientName || ''));
            html = html.replace('{{DATE_PERFORMED}}', escapeHtml(datePerformed));
            html = html.replace('{{PROJECT_NAME}}', escapeHtml(task.projectName || ''));
            html = html.replace('{{PROJECT_NUMBER}}', escapeHtml(task.projectNumber || ''));
            html = html.replace('{{STRUCTURE}}', escapeHtml(data.structure || ''));

            // Generate test rows HTML
            let testRowsHtml = '';
            for (let i = 0; i < 19; i++) {
              const row = data.testRows[i] || {};
              
              // Calculate dry density
              let dryDensity = row.dryDensity || '';
              if (!dryDensity && row.wetDensity && row.fieldMoisture) {
                const wet = parseFloat(row.wetDensity);
                const moisture = parseFloat(row.fieldMoisture);
                if (!isNaN(wet) && !isNaN(moisture)) {
                  dryDensity = (wet / (1 + (moisture / 100))).toFixed(1);
                }
              }
              
              // Calculate percent proctor
              let percentProctor = row.percentProctorDensity || '';
              if (!percentProctor && dryDensity && row.proctorNo) {
                const dry = parseFloat(dryDensity);
                const proctorNum = parseInt(row.proctorNo);
                if (!isNaN(dry) && !isNaN(proctorNum) && proctorNum >= 1 && proctorNum <= 6) {
                  const proctor = data.proctors[proctorNum - 1];
                  if (proctor && proctor.maxDensity) {
                    const maxDensity = parseFloat(proctor.maxDensity);
                    if (!isNaN(maxDensity) && maxDensity > 0) {
                      percentProctor = ((dry / maxDensity) * 100).toFixed(1);
                    }
                  }
                }
              }

              // Format Dept/Lift display
              let depthLiftDisplay = '';
              if (row.depthLiftValue) {
                depthLiftDisplay = escapeHtml(row.depthLiftValue);
              }

              testRowsHtml += `
                <tr>
                  <td>${i + 1}</td>
                  <td>${escapeHtml(row.testLocation || '')}</td>
                  <td>${depthLiftDisplay || '&nbsp;'}</td>
                  <td>${escapeHtml(row.wetDensity || '')}</td>
                  <td>${escapeHtml(row.fieldMoisture || '')}</td>
                  <td>${dryDensity || '&nbsp;'}</td>
                  <td>${escapeHtml(row.proctorNo || '')}</td>
                  <td>${percentProctor ? percentProctor : '&nbsp;'}</td>
                </tr>
              `;
            }
            html = html.replace('{{TEST_ROWS}}', testRowsHtml);

            // Generate proctor rows HTML
            let proctorRowsHtml = '';
            for (let i = 0; i < 6; i++) {
              const proctor = data.proctors[i] || {};
              proctorRowsHtml += `
                <tr>
                  <td>${i + 1}</td>
                  <td>${escapeHtml(proctor.description || '')}</td>
                  <td>${escapeHtml(proctor.optMoisture || '')}</td>
                  <td>${escapeHtml(proctor.maxDensity || '')}</td>
                </tr>
              `;
            }
            html = html.replace('{{PROCTOR_ROWS}}', proctorRowsHtml);

            // Replace specs and instrument placeholders
            html = html.replace('{{DENS_SPEC}}', escapeHtml(data.densSpecPercent || ''));
            const moistSpec = data.moistSpecMin !== null && data.moistSpecMax !== null
              ? `${data.moistSpecMin} to ${data.moistSpecMax}`
              : (data.moistSpecMin || data.moistSpecMax || '');
            html = html.replace('{{MOIST_SPEC}}', escapeHtml(moistSpec));
            html = html.replace('{{STD_DENSITY_COUNT}}', escapeHtml(data.stdDensityCount || ''));
            html = html.replace('{{STD_MOIST_COUNT}}', escapeHtml(data.stdMoistCount || ''));
            html = html.replace('{{TRANS_DEPTH}}', escapeHtml(data.transDepthIn || ''));
            html = html.replace('{{GAUGE_NO}}', escapeHtml(data.gaugeNo || ''));

            // Replace method checkboxes
            html = html.replace('{{METHOD_D2922}}', data.methodD2922 ? 'checked' : '');
            html = html.replace('{{METHOD_D3017}}', data.methodD3017 ? 'checked' : '');
            html = html.replace('{{METHOD_D698}}', data.methodD698 ? 'checked' : '');

            // Replace footer placeholders
            html = html.replace('{{REMARKS}}', escapeHtml(data.remarks || ''));
            html = html.replace('{{TECH_NAME}}', escapeHtml(data.techName || task.assignedTechnicianName || ''));
            html = html.replace('{{TIME}}', escapeHtml(data.timeStr || ''));

            // Generate PDF using Puppeteer
            console.log('Launching Puppeteer for density PDF generation...');
            const browser = await puppeteer.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            try {
              const page = await browser.newPage();
              
              // Capture console errors
              const consoleErrors = [];
              page.on('console', msg => {
                if (msg.type() === 'error') {
                  consoleErrors.push(msg.text());
                }
              });
              
              // Capture page errors
              page.on('pageerror', error => {
                consoleErrors.push(`Page error: ${error.message}`);
              });
              
              // Set viewport to match Letter size (8.5 x 11 inches at 96 DPI)
              await page.setViewport({
                width: 816,  // 8.5 inches * 96 DPI
                height: 1056, // 11 inches * 96 DPI
                deviceScaleFactor: 1
              });
              
              // Set content and wait for it to load
              await page.setContent(html, { waitUntil: 'load' });
              
              // Log any console errors
              if (consoleErrors.length > 0) {
                console.warn('Console errors during PDF generation:', consoleErrors);
              }
              
              // Wait a bit to ensure all rendering is complete
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Generate PDF
              const pdf = await page.pdf({
                format: 'Letter',
                printBackground: true,
                margin: { top: '0', right: '0', bottom: '0', left: '0' },
                preferCSSPageSize: false
              });

              await browser.close();

              if (!pdf || pdf.length === 0) {
                console.error('PDF buffer is empty');
                return res.status(500).json({ error: 'Failed to generate PDF: Empty buffer' });
              }

              // Convert to Buffer if it's not already (Puppeteer returns Uint8Array)
              const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
              
              // Verify PDF starts with PDF header (check raw bytes)
              const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
              if (pdfHeader !== '%PDF') {
                console.error('Invalid PDF header:', pdfHeader);
                console.error('First 50 bytes (hex):', pdfBuffer.slice(0, 50).toString('hex'));
                console.error('First 50 bytes (ascii):', pdfBuffer.slice(0, 50).toString('ascii').replace(/[^\x20-\x7E]/g, '.'));
                console.error('PDF buffer type:', typeof pdf, 'isBuffer:', Buffer.isBuffer(pdf));
                console.error('PDF buffer length:', pdfBuffer.length);
                // Try to see if it's HTML error page
                const firstChars = pdfBuffer.slice(0, 100).toString('utf8');
                if (firstChars.includes('<html') || firstChars.includes('<!DOCTYPE')) {
                  console.error('Puppeteer returned HTML instead of PDF. HTML preview:', firstChars.substring(0, 200));
                  return res.status(500).json({ error: 'Failed to generate PDF: Puppeteer returned HTML instead of PDF. Check server logs for details.' });
                }
                return res.status(500).json({ error: 'Failed to generate PDF: Invalid PDF format. Check server logs for details.' });
              }

              console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
              console.log(`PDF first bytes (hex): ${pdfBuffer.slice(0, 10).toString('hex')}`);
              console.log(`PDF header: ${pdfHeader}`);
              
              // Determine field date for filename (use scheduledStartDate from task, or test date from report, or today)
              const fieldDate = task.scheduledStartDate || data.testDate || new Date().toISOString().split('T')[0];
              const isRegeneration = req.query.regenerate === 'true' || req.query.regen === 'true';
              
              // Save PDF to file system
              let saveInfo = null;
              let saveError = null;
              try {
                saveInfo = await saveReportPDF(
                  task.projectNumber,
                  'DENSITY_MEASUREMENT',
                  fieldDate,
                  pdfBuffer,
                  isRegeneration
                );
                
                if (saveInfo.saved) {
                  console.log(`PDF saved: ${saveInfo.filePath}`);
                } else if (saveInfo.saveError) {
                  console.error('Error saving PDF to file:', saveInfo.saveError);
                  saveError = saveInfo.saveError;
                }
              } catch (saveErr) {
                console.error('Error saving PDF to file:', saveErr);
                saveError = saveErr.message;
                // Continue even if save fails - still return PDF to client
              }
              
              // Return JSON response with save info and PDF as base64
              res.status(200).json({
                success: true,
                saved: saveInfo ? saveInfo.saved : false,
                savedPath: saveInfo ? saveInfo.savedPath : null,
                fileName: saveInfo ? saveInfo.fileName : null,
                sequence: saveInfo ? saveInfo.sequence : null,
                isRevision: saveInfo ? saveInfo.isRevision : false,
                revisionNumber: saveInfo ? saveInfo.revisionNumber : null,
                downloadUrl: `/api/pdf/density/${taskId}/download?token=${encodeURIComponent(req.headers.authorization || '')}`,
                saveError: saveError,
                pdfBase64: pdfBuffer.toString('base64')
              });
            } catch (puppeteerError) {
              await browser.close();
              console.error('Puppeteer error:', puppeteerError);
              throw puppeteerError;
            }
          } catch (innerErr) {
            console.error('Error in PDF generation:', innerErr);
            if (!res.headersSent) {
              res.status(500).json({ error: 'Failed to generate PDF: ' + (innerErr.message || String(innerErr)) });
            } else {
              res.end();
            }
          }
        });
      }
    );
  } catch (err) {
    console.error('Error generating density PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF: ' + (err.message || String(err)) });
    } else {
      res.end();
    }
  }
});

// Generate PDF for Rebar Report
router.get('/rebar/:taskId', authenticate, async (req, res) => {
  const taskId = req.params.taskId;

  try {
    // Get task and project info
    const task = await new Promise((resolve, reject) => {
      db.get(
        `SELECT t.*, p.projectName, p.projectNumber,
         u.name as assignedTechnicianName
         FROM tasks t
         INNER JOIN projects p ON t.projectId = p.id
         LEFT JOIN users u ON t.assignedTechnicianId = u.id
         WHERE t.id = ? AND t.taskType = 'REBAR'`,
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

    // Get rebar report data
    db.get('SELECT * FROM rebar_reports WHERE taskId = ?', [taskId], async (err, data) => {
      if (err) {
        console.error('Database error fetching rebar report:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!data) {
        return res.status(404).json({ error: 'No report data found. Please save the form first.' });
      }

      try {
        // Read HTML template
        const templatePath = path.join(__dirname, '..', 'templates', 'rebar-report.html');
        if (!fs.existsSync(templatePath)) {
          console.error('Template file not found:', templatePath);
          return res.status(500).json({ error: 'Template file not found' });
        }
        let html = fs.readFileSync(templatePath, 'utf8');

        // Helper function to escape HTML
        const escapeHtml = (text) => {
          if (!text) return '&nbsp;';
          return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };

        // Format dates
        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          try {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
          } catch (e) {
            return dateStr;
          }
        };

        // Get logo as base64 data URI and replace placeholder
        const logoBase64 = getLogoBase64();
        const logoHtml = logoBase64 
          ? `<img src="${logoBase64}" alt="MAK Lone Star Consulting Logo" style="max-width: 120px; max-height: 80px; object-fit: contain;" />`
          : '<div class="logo-placeholder">MAK</div>';
        html = html.replace('{{LOGO_IMAGE}}', logoHtml);

        // Replace placeholders
        html = html.replace('{{CLIENT_NAME}}', escapeHtml(data.clientName || ''));
        html = html.replace('{{REPORT_DATE}}', escapeHtml(formatDate(data.reportDate)));
        html = html.replace('{{PROJECT_NAME}}', escapeHtml(task.projectName || ''));
        html = html.replace('{{PROJECT_NUMBER}}', escapeHtml(task.projectNumber || ''));
        html = html.replace('{{INSPECTION_DATE}}', escapeHtml(formatDate(data.inspectionDate)));
        html = html.replace('{{GENERAL_CONTRACTOR}}', escapeHtml(data.generalContractor || ''));
        html = html.replace('{{LOCATION_DETAIL}}', escapeHtml(data.locationDetail || ''));
        html = html.replace('{{WIRE_MESH_SPEC}}', escapeHtml(data.wireMeshSpec || ''));
        html = html.replace('{{DRAWINGS}}', escapeHtml(data.drawings || ''));
        html = html.replace('{{TECHNICIAN_NAME}}', escapeHtml(data.techName || task.assignedTechnicianName || ''));

        // Generate PDF using Puppeteer
        console.log('Launching Puppeteer for rebar PDF generation...');
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
          const page = await browser.newPage();
          
          // Capture console errors
          const consoleErrors = [];
          page.on('console', msg => {
            if (msg.type() === 'error') {
              consoleErrors.push(msg.text());
            }
          });
          
          // Capture page errors
          page.on('pageerror', error => {
            consoleErrors.push(`Page error: ${error.message}`);
          });
          
          // Set viewport to match Letter size
          await page.setViewport({
            width: 816,
            height: 1056,
            deviceScaleFactor: 1
          });
          
          // Set content and wait for it to load
          await page.setContent(html, { waitUntil: 'load' });
          
          // Log any console errors
          if (consoleErrors.length > 0) {
            console.warn('Console errors during PDF generation:', consoleErrors);
          }
          
          // Wait a bit to ensure all rendering is complete
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Generate PDF
          const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            preferCSSPageSize: false
          });
          
          await browser.close();
          
          // Convert to Node.js Buffer
          const pdfBuffer = Buffer.from(pdf);
          
          // Verify PDF buffer
          const pdfHeader = pdfBuffer.slice(0, 4).toString('ascii');
          if (pdfHeader !== '%PDF') {
            console.error('Invalid PDF header:', pdfHeader);
            return res.status(500).json({ error: 'Failed to generate PDF: Invalid PDF format' });
          }
          
          console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
          
          // Determine field date for filename (use scheduledStartDate from task, or inspectionDate from report, or today)
          const fieldDate = task.scheduledStartDate || data.inspectionDate || new Date().toISOString().split('T')[0];
          const isRegeneration = req.query.regenerate === 'true' || req.query.regen === 'true';
          
          // Save PDF to file system
          let saveInfo = null;
          let saveError = null;
          try {
            saveInfo = await saveReportPDF(
              task.projectNumber,
              'REBAR',
              fieldDate,
              pdfBuffer,
              isRegeneration
            );
            
            if (saveInfo.saved) {
              console.log(`PDF saved: ${saveInfo.filePath}`);
            } else if (saveInfo.saveError) {
              console.error('Error saving PDF to file:', saveInfo.saveError);
              saveError = saveInfo.saveError;
            }
          } catch (saveErr) {
            console.error('Error saving PDF to file:', saveErr);
            saveError = saveErr.message;
            // Continue even if save fails - still return PDF to client
          }
          
          // Return JSON response with save info and PDF as base64
          res.status(200).json({
            success: true,
            saved: saveInfo ? saveInfo.saved : false,
            savedPath: saveInfo ? saveInfo.savedPath : null,
            fileName: saveInfo ? saveInfo.fileName : null,
            sequence: saveInfo ? saveInfo.sequence : null,
            isRevision: saveInfo ? saveInfo.isRevision : false,
            revisionNumber: saveInfo ? saveInfo.revisionNumber : null,
            downloadUrl: `/api/pdf/rebar/${taskId}/download?token=${encodeURIComponent(req.headers.authorization || '')}`,
            saveError: saveError,
            pdfBase64: pdfBuffer.toString('base64')
          });
        } catch (puppeteerError) {
          await browser.close();
          console.error('Puppeteer error:', puppeteerError);
          throw puppeteerError;
        }
      } catch (err) {
        console.error('Error generating rebar PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to generate PDF: ' + (err.message || String(err)) });
        } else {
          res.end();
        }
      }
    });
  } catch (err) {
    console.error('Error generating rebar PDF:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF: ' + (err.message || String(err)) });
    } else {
      res.end();
    }
  }
});

module.exports = router;

