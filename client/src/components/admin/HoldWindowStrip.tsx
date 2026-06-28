import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getHoldWindow, cancelAutoAssign, HoldWindowItem } from '../../api/invoicing';
import './HoldWindowStrip.css';

const POLL_MS = 30_000;

function timeLeft(holdUntil: string): string {
  const diff = new Date(holdUntil).getTime() - Date.now();
  if (diff <= 0) return 'Sending soon…';
  const mins = Math.ceil(diff / 60_000);
  return `${mins}m`;
}

interface Props {
  onCancelled?: () => void;
}

const HoldWindowStrip: React.FC<Props> = ({ onCancelled }) => {
  const [items, setItems] = useState<HoldWindowItem[]>([]);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await getHoldWindow();
      setItems(data);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => {
      load();
      setTick(t => t + 1); // force re-render to update countdown
    }, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // Re-render every 30s to update time-left display
  useEffect(() => { /* tick triggers re-render */ }, [tick]);

  if (items.length === 0) return null;

  async function handleCancel(workorderId: number) {
    setCancelling(workorderId);
    try {
      await cancelAutoAssign(workorderId);
      setItems(prev => prev.filter(i => i.workorderId !== workorderId));
      onCancelled?.();
    } catch {
      // non-fatal
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="hold-window-strip">
      <div className="hold-window-label">
        Auto-assigned — pending notification
      </div>
      <div className="hold-window-items">
        {items.map(item => (
          <div key={item.workorderId} className="hold-window-item">
            <div className="hold-window-item-info">
              <span className="hold-wo-number">{item.workorderNumber}</span>
              {item.projectName && (
                <span className="hold-project"> · {item.projectName}</span>
              )}
              <span className="hold-tech"> → {item.technicianName || 'Tech'}</span>
              {item.scheduledDate && (
                <span className="hold-date">
                  {' · '}
                  {new Date(item.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                </span>
              )}
              <span className="hold-countdown">{timeLeft(item.holdUntil)}</span>
            </div>
            <button
              type="button"
              className="hold-cancel-btn"
              onClick={() => handleCancel(item.workorderId)}
              disabled={cancelling === item.workorderId}
            >
              {cancelling === item.workorderId ? '…' : 'Cancel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HoldWindowStrip;
