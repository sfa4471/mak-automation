/**
 * Debounced batch assignment email sender.
 *
 * Polls the `pending_notifications` table every 2 minutes.
 * For each technician with unsent rows, if their LAST queued notification is
 * older than DEBOUNCE_MINUTES (3 min), send ONE consolidated email covering
 * all pending tasks, then mark those rows sent.
 *
 * This means:
 *   - Admin assigns 8 tasks in 90 seconds → tech gets 1 email, not 8.
 *   - 3-minute window resets each time admin adds another assignment.
 */

const { supabase, isAvailable } = require('../db/supabase');
const emailService = require('../services/email');

const DEBOUNCE_MINUTES = 3;
const POLL_INTERVAL_MS = 2 * 60 * 1000;

let _sending = false;

async function processPendingNotifications() {
  if (_sending) { console.log('[notificationBatch] Send in progress, skipping poll'); return; }
  if (!isAvailable()) return;
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

  // Group by technician_id; track max created_at per group
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
    const ageMs = now - group.maxCreatedAt;
    const remainMs = debounceMs - ageMs;

    // Skip if admin is still actively assigning (last assignment < debounce window)
    if (remainMs > 0) {
      console.log(`[notificationBatch] Tech ${techId}: debouncing, ${Math.ceil(remainMs / 1000)}s left (last row age: ${Math.floor(ageMs / 1000)}s, maxCreatedAt: ${new Date(group.maxCreatedAt).toISOString()})`);
      continue;
    }

    const email = group.rows[0].technician_email;
    const ids = group.rows.map((r) => r.id);
    console.log(`[notificationBatch] Tech ${techId}: ready, sending ${ids.length} task(s) to ${email}`);

    _sending = true;
    try {
      await emailService.sendTaskAssignmentBatchEmail(email, group.rows);

      const { error: markErr } = await supabase
        .from('pending_notifications')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .in('id', ids);

      if (markErr) {
        console.error(`[notificationBatch] Failed to mark rows sent for tech ${techId}:`, markErr.message);
      } else {
        console.log(`[notificationBatch] Sent batch (${ids.length} tasks) to ${email}`);
      }
    } catch (err) {
      const code = err.responseCode || err.code || '';
      const detail = err.response || err.message;
      console.error(`[notificationBatch] Email send failed for ${email} (${code}): ${detail}`);
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
    try {
      await processPendingNotifications();
    } catch (err) {
      console.error('[notificationBatch] Unexpected error in tick:', err);
    }
  };

  // First poll after one interval (not immediately on boot)
  setTimeout(function schedule() {
    tick().finally(() => setTimeout(schedule, POLL_INTERVAL_MS));
  }, POLL_INTERVAL_MS);
}

module.exports = { startNotificationBatchSender };
