const { sendApprovedReportsForAllTenants } = require('./sendApprovedReports');

const TIME_ZONE = 'America/Chicago';
// Nightly send wall time in Chicago (handles CST/CDT). Revert to 18 / 0 after testing (6:00 PM).
const TARGET_HOUR = 21; // 9 PM (24h)
const TARGET_MINUTE = 15; // 9:15 PM Chicago — bulk approved / report-out test window

function getTimeZoneParts(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type && p.value) map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

/**
 * Instant (UTC ms) when it is TARGET_HOUR:TARGET_MINUTE on the given calendar date in Chicago.
 * (Do not use Date.UTC(y,m,d,H,M) for local wall time — that interprets H:M as UTC and broke scheduling.)
 */
function chicagoWallTimeToUtcMs(year, month, day, hour, minute) {
  let t = Date.UTC(year, month - 1, day, 12, 0, 0);
  for (let i = 0; i < 50; i++) {
    const p = getTimeZoneParts(new Date(t));
    const dayDiffMs = Date.UTC(year, month - 1, day) - Date.UTC(p.year, p.month - 1, p.day);
    const minDiff = hour * 60 + minute - (p.hour * 60 + p.minute);
    const totalMin = (dayDiffMs / 86400000) * 24 * 60 + minDiff;
    if (totalMin === 0) return t;
    t += totalMin * 60 * 1000;
  }
  return t;
}

/**
 * Next run strictly after `now` at TARGET_HOUR:TARGET_MINUTE America/Chicago.
 */
function computeNextRunUTC(now = new Date()) {
  let t = now.getTime();
  for (let i = 0; i < 120; i++) {
    const p = getTimeZoneParts(new Date(t));
    const candidateMs = chicagoWallTimeToUtcMs(p.year, p.month, p.day, TARGET_HOUR, TARGET_MINUTE);
    if (candidateMs > now.getTime()) return new Date(candidateMs);
    t += 6 * 60 * 60 * 1000;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function startAutoSendScheduler() {
  // Avoid starting multiple schedulers inside dev hot-reload.
  if (global.__autoSendSchedulerStarted) return;
  global.__autoSendSchedulerStarted = true;

  const run = async () => {
    try {
      console.log(`[autoSendScheduler] Triggering nightly auto-send at ${new Date().toISOString()}`);
      const summary = await sendApprovedReportsForAllTenants();
      console.log('[autoSendScheduler] Completed nightly auto-send:', summary);
    } catch (err) {
      console.error('[autoSendScheduler] Nightly auto-send failed:', err);
    } finally {
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    const now = new Date();
    const next = computeNextRunUTC(now);
    const delayMs = Math.max(1000, next.getTime() - now.getTime());

    const h12 = TARGET_HOUR % 12 || 12;
    const ampm = TARGET_HOUR >= 12 ? 'PM' : 'AM';
    const mm = String(TARGET_MINUTE).padStart(2, '0');
    console.log(
      `[autoSendScheduler] Next run scheduled for ${next.toISOString()} (${TIME_ZONE} ${h12}:${mm} ${ampm})`
    );

    setTimeout(run, delayMs);
  };

  scheduleNext();
}

module.exports = { startAutoSendScheduler };

