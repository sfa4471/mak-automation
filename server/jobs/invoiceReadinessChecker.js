'use strict';

/**
 * Invoice Readiness Checker — polls every 30 minutes.
 *
 * For each tenant, finds projects where:
 *   - At least one workorder has billing_status = 'unbilled'
 *   - No workorder has status = 'open' (all field work is complete/approved)
 *
 * If wipCents > 0, sends one billing-ready alert email to all ADMIN users
 * for that tenant. A per-process in-memory cooldown (23 h) prevents the
 * same project from being re-alerted until the server restarts or the
 * cooldown expires.
 *
 * Kill switch: set ENABLE_INVOICE_READINESS_CHECKER=false to disable.
 */

const { supabase, isAvailable } = require('../db/supabase');
const emailService = require('../services/email');
const { projectFinancialSummary } = require('../services/billingEngine');

const POLL_INTERVAL_MS  = 30 * 60 * 1000; // 30 minutes
const COOLDOWN_MS       = 23 * 60 * 60 * 1000; // 23 hours per project

// projectId → timestamp of last alert sent
const lastAlertedAt = new Map();

function formatDollars(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

async function checkAllTenants() {
  if (!isAvailable()) return;
  if (!emailService.isConfigured()) return;

  // Find all distinct tenant IDs that have unbilled workorders
  const { data: unbilledWos, error } = await supabase
    .from('workorders')
    .select('tenant_id, project_id')
    .eq('billing_status', 'unbilled');

  if (error) {
    console.error('[invoiceReadiness] Query error:', error.message);
    return;
  }
  if (!unbilledWos || unbilledWos.length === 0) return;

  // Group project IDs by tenant
  const tenantProjects = new Map();
  for (const wo of unbilledWos) {
    if (!wo.tenant_id || !wo.project_id) continue;
    if (!tenantProjects.has(wo.tenant_id)) tenantProjects.set(wo.tenant_id, new Set());
    tenantProjects.get(wo.tenant_id).add(wo.project_id);
  }

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

  for (const [tenantId, projectIds] of tenantProjects) {
    for (const projectId of projectIds) {

      // Cooldown: skip if we already alerted this project recently
      const lastAlert = lastAlertedAt.get(projectId);
      if (lastAlert && Date.now() - lastAlert < COOLDOWN_MS) continue;

      // Check no open workorders remain on this project
      const { data: openWos } = await supabase
        .from('workorders')
        .select('id')
        .eq('project_id', projectId)
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .limit(1);

      if (openWos && openWos.length > 0) continue; // field work still in progress

      // Compute WIP
      let summary;
      try {
        summary = await projectFinancialSummary(projectId, tenantId);
      } catch (err) {
        console.error(`[invoiceReadiness] Error computing WIP for project ${projectId}:`, err.message);
        continue;
      }

      if (!summary.wipCents || summary.wipCents <= 0) continue;

      // Fetch project info
      const { data: project } = await supabase
        .from('projects')
        .select('project_name, project_number')
        .eq('id', projectId)
        .eq('tenant_id', tenantId)
        .single();

      if (!project) continue;

      // Fetch ADMIN emails for this tenant
      const { data: admins } = await supabase
        .from('users')
        .select('email')
        .eq('tenant_id', tenantId)
        .eq('role', 'ADMIN');

      const adminEmails = (admins || []).map(u => u.email).filter(Boolean);
      if (adminEmails.length === 0) continue;

      // Send alert
      try {
        await emailService.sendBillingReadyAlert(adminEmails, {
          projectName: project.project_name,
          projectNumber: project.project_number,
          wipDollars: formatDollars(summary.wipCents),
          warnings: summary.warnings || [],
          dashboardUrl: appUrl ? `${appUrl}/financials` : '',
        });
        lastAlertedAt.set(projectId, Date.now());
        console.log(`[invoiceReadiness] Alert sent for project ${project.project_number} — ${formatDollars(summary.wipCents)} WIP`);
      } catch (err) {
        console.error(`[invoiceReadiness] Failed to send alert for project ${projectId}:`, err.message);
      }
    }
  }
}

function startInvoiceReadinessChecker() {
  if (global.__invoiceReadinessCheckerStarted) return;
  global.__invoiceReadinessCheckerStarted = true;

  console.log(`[invoiceReadiness] Starting — polling every ${POLL_INTERVAL_MS / 60000} minutes`);

  // Run immediately on start, then on interval
  checkAllTenants().catch(err => console.error('[invoiceReadiness] Startup check failed:', err.message));
  setInterval(() => {
    checkAllTenants().catch(err => console.error('[invoiceReadiness] Poll failed:', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { startInvoiceReadinessChecker };
