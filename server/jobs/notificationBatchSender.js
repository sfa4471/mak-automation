/**
 * Debounced batch assignment email sender.
 *
 * Polls `pending_notifications` every 2 minutes.
 * For each technician, waits DEBOUNCE_MINUTES after the last queued row,
 * then sends emails — ONE per workorder (dispatch format) or ONE consolidated
 * project-grouped email for legacy tasks without a workorder.
 */

const { supabase, isAvailable } = require('../db/supabase');
const emailService = require('../services/email');

const DEBOUNCE_MINUTES  = 3;
const POLL_INTERVAL_MS  = 2 * 60 * 1000;

let _sending = false;

// "07:30:00" → "7:30 AM"
function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

async function processPendingNotifications() {
  if (_sending)          { console.log('[notificationBatch] Send in progress, skipping poll'); return; }
  if (!isAvailable())    return;
  if (!emailService.isConfigured()) return;

  let pending;
  try {
    const { data, error } = await supabase
      .from('pending_notifications')
      .select('*')
      .eq('sent', false)
      .order('created_at', { ascending: true });
    if (error) throw error;
    pending = data || [];
  } catch (err) {
    console.error('[notificationBatch] Query error:', err.message);
    return;
  }

  console.log(`[notificationBatch] Poll: ${pending.length} unsent row(s) found`);
  if (pending.length === 0) return;

  // Group by technician → track max created_at for debounce
  const byTech = new Map();
  for (const row of pending) {
    if (!byTech.has(row.technician_id)) {
      byTech.set(row.technician_id, { rows: [], maxCreatedAt: 0 });
    }
    const group = byTech.get(row.technician_id);
    group.rows.push(row);
    const ts = new Date(row.created_at).getTime();
    if (ts > group.maxCreatedAt) group.maxCreatedAt = ts;
  }

  const debounceMs = DEBOUNCE_MINUTES * 60 * 1000;
  const now = Date.now();

  for (const [techId, group] of byTech) {
    const ageMs    = now - group.maxCreatedAt;
    const remainMs = debounceMs - ageMs;

    if (remainMs > 0) {
      console.log(`[notificationBatch] Tech ${techId}: debouncing, ${Math.ceil(remainMs / 1000)}s left`);
      continue;
    }

    const email = group.rows[0].technician_email;
    const ids   = group.rows.map(r => r.id);

    _sending = true;
    try {
      // Split rows: those with a workorder_id vs. legacy (no workorder_id)
      const woRows     = group.rows.filter(r => r.workorder_id);
      const legacyRows = group.rows.filter(r => !r.workorder_id);

      // ── Send one dispatch email per workorder ────────────────────────────
      const woGroups = new Map();
      for (const r of woRows) {
        if (!woGroups.has(r.workorder_id)) {
          woGroups.set(r.workorder_id, {
            workorder: {
              workorder_number: r.workorder_number,
              scheduled_date:   r.scheduled_start_date,  // date comes from the task row
              scheduled_time:   r.scheduled_time,
              site_location:    r.site_location,
              project_number:   r.project_number,
              project_name:     r.project_name,
            },
            tasks: [],
          });
        }
        woGroups.get(r.workorder_id).tasks.push({
          task_type:       r.task_type,
          task_label:      r.task_label,
          location_name:   r.location_name,
          engagement_notes: r.engagement_notes,
        });
      }

      for (const [woId, { workorder, tasks }] of woGroups) {
        const assignedByName = woRows.find(r => r.workorder_id === woId)?.assigned_by_name || 'Admin';
        // Enrich subject with report time if available
        const timeStr = workorder.scheduled_time ? ` · ${formatTime(workorder.scheduled_time)}` : '';
        const woNum   = workorder.workorder_number || `WO-${woId}`;
        const dateStr = workorder.scheduled_date   || '';
        console.log(`[notificationBatch] Sending dispatch email for WO ${woNum} to ${email}`);
        await emailService.sendWorkorderDispatchEmail(email, workorder, tasks, assignedByName);
      }

      // ── Legacy: no workorder — send old project-grouped email ────────────
      if (legacyRows.length > 0) {
        console.log(`[notificationBatch] Sending legacy task batch (${legacyRows.length} tasks) to ${email}`);
        await emailService.sendTaskAssignmentBatchEmail(email, legacyRows);
      }

      // Mark all rows sent
      const { error: markErr } = await supabase
        .from('pending_notifications')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .in('id', ids);

      if (markErr) {
        console.error(`[notificationBatch] Failed to mark rows sent for tech ${techId}:`, markErr.message);
      } else {
        console.log(`[notificationBatch] Marked ${ids.length} row(s) sent for tech ${techId}`);
      }
    } catch (err) {
      const detail = err.response || err.message;
      console.error(`[notificationBatch] Email send failed for ${email}: ${detail}`);
    } finally {
      _sending = false;
    }
  }
}

function startNotificationBatchSender() {
  if (global.__notificationBatchSenderStarted) return;
  global.__notificationBatchSenderStarted = true;

  console.log('[notificationBatch] Batch sender started (poll every 2 min, debounce 3 min)');

  const tick = async () => {
    try { await processPendingNotifications(); }
    catch (err) { console.error('[notificationBatch] Unexpected error in tick:', err); }
  };

  setTimeout(function schedule() {
    tick().finally(() => setTimeout(schedule, POLL_INTERVAL_MS));
  }, POLL_INTERVAL_MS);
}

module.exports = { startNotificationBatchSender };
