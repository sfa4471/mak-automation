import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { getAvailability, addAvailabilityBlock, deleteAvailabilityBlock, AvailabilityBlock } from '../../api/invoicing';
import './TechAvailability.css';

interface Technician {
  id: number;
  name: string;
  email: string;
}

const TECH_COLORS = [
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
];

const REASON_PRESETS = ['PTO', 'Holiday', 'Training', 'Sick', 'Personal', 'Equipment Hold'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expandDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T12:00:00');
  const last = new Date(end + 'T12:00:00');
  while (cur <= last) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function displayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const TechAvailability: React.FC = () => {
  const navigate = useNavigate();
  const today = toLocalDateStr(new Date());

  const [techs, setTechs] = useState<Technician[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(true);

  // Add-form state
  const [formTechId, setFormTechId] = useState('');
  const [formStart, setFormStart] = useState(today);
  const [formEnd, setFormEnd] = useState(today);
  const [formReason, setFormReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);

  // List state
  const [filterTechId, setFilterTechId] = useState('all');
  const [showPast, setShowPast] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    api.get<Technician[]>('/auth/technicians').then(r => {
      setTechs(r.data);
      if (r.data.length > 0) setFormTechId(String(r.data[0].id));
    }).catch(() => {});
  }, []);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    try {
      // 3-month window so adjacent month navigation feels instant
      const startDate = new Date(viewYear, viewMonth - 1, 1);
      const endDate = new Date(viewYear, viewMonth + 2, 0);
      const data = await getAvailability({
        startDate: toLocalDateStr(startDate),
        endDate: toLocalDateStr(endDate),
      });
      setBlocks(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  // Stable color map — index into TECH_COLORS by tech order
  const colorOf = (techId: number) => {
    const idx = techs.findIndex(t => t.id === techId);
    return idx >= 0 ? TECH_COLORS[idx % TECH_COLORS.length] : TECH_COLORS[0];
  };

  // Calendar geometry
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Index blocks by date for the calendar
  const blocksByDate = new Map<string, AvailabilityBlock[]>();
  blocks.forEach(b => {
    const list = blocksByDate.get(b.date) ?? [];
    list.push(b);
    blocksByDate.set(b.date, list);
  });

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  async function handleAdd() {
    if (!formTechId || !formStart || !formEnd) return;
    if (formEnd < formStart) {
      setSaveMsg({ type: 'warn', text: 'End date must be on or after start date.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);

    const dates = expandDateRange(formStart, formEnd);
    let added = 0;
    let skipped = 0;
    let errored = 0;

    for (const date of dates) {
      try {
        await addAvailabilityBlock(Number(formTechId), date, formReason || undefined);
        added++;
      } catch (err: any) {
        if (err?.response?.status === 409) skipped++;
        else errored++;
      }
    }

    await loadBlocks();
    setSaving(false);

    if (errored > 0) {
      setSaveMsg({ type: 'warn', text: `${added} added, ${skipped} skipped (already existed), ${errored} failed.` });
    } else if (skipped > 0) {
      setSaveMsg({ type: 'warn', text: `${added} block(s) added. ${skipped} date(s) already had a block and were skipped.` });
    } else {
      setSaveMsg({ type: 'ok', text: `${added} block(s) added.` });
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAvailabilityBlock(id);
      setBlocks(prev => prev.filter(b => b.id !== id));
    } catch {
      // non-fatal
    } finally {
      setDeletingId(null);
    }
  }

  const listBlocks = blocks
    .filter(b => filterTechId === 'all' || String(b.technicianId) === filterTechId)
    .filter(b => showPast || b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="ta-page">
      <div className="ta-header">
        <button className="ta-back-btn" onClick={() => navigate('/dashboard')}>
          ← Dashboard
        </button>
        <div className="ta-header-title">
          <h1>Team Availability</h1>
          <p className="ta-subtitle">Block dates when a technician is unavailable for dispatch</p>
        </div>
      </div>

      <div className="ta-body">

        {/* ── Calendar card ── */}
        <div className="ta-card">
          <div className="ta-cal-nav">
            <button className="ta-nav-btn" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
            <span className="ta-month-label">{MONTHS[viewMonth]} {viewYear}</span>
            <button className="ta-nav-btn" onClick={nextMonth} aria-label="Next month">&#8250;</button>
          </div>

          {techs.length > 0 && (
            <div className="ta-legend">
              {techs.map(t => {
                const c = colorOf(t.id);
                return (
                  <span key={t.id} className="ta-legend-chip"
                    style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                    {t.name || t.email}
                  </span>
                );
              })}
            </div>
          )}

          <div className="ta-cal-grid">
            {DAYS.map(d => (
              <div key={d} className="ta-cal-dow">{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} className="ta-cal-cell ta-cal-cell--pad" />;
              const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = ds === today;
              const isPast = ds < today;
              const dayBlocks = blocksByDate.get(ds) ?? [];

              return (
                <div
                  key={ds}
                  className={[
                    'ta-cal-cell',
                    isToday ? 'ta-cal-cell--today' : '',
                    isPast ? 'ta-cal-cell--past' : '',
                  ].join(' ')}
                  onClick={() => { setFormStart(ds); setFormEnd(ds); }}
                  title={isPast ? undefined : 'Click to pre-fill date in Add form'}
                >
                  <span className="ta-cal-day-num">{day}</span>
                  <div className="ta-cal-chips">
                    {dayBlocks.map(b => {
                      const c = colorOf(b.technicianId);
                      const firstName = (b.technicianName || '?').split(' ')[0];
                      return (
                        <span key={b.id} className="ta-cal-chip"
                          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                          title={b.reason ? `${b.technicianName} — ${b.reason}` : (b.technicianName ?? undefined)}>
                          {firstName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Add Block form ── */}
        <div className="ta-card">
          <h2 className="ta-card-title">Add Availability Block</h2>
          <p className="ta-card-hint">Use the date range to block an entire vacation or training period in one step.</p>

          <div className="ta-form-grid">
            <div className="ta-field">
              <label className="ta-label" htmlFor="ta-tech">Technician</label>
              <select id="ta-tech" className="ta-select" value={formTechId}
                onChange={e => setFormTechId(e.target.value)}>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.email}</option>
                ))}
              </select>
            </div>

            <div className="ta-field">
              <label className="ta-label" htmlFor="ta-start">Start Date</label>
              <input id="ta-start" type="date" className="ta-input" value={formStart}
                onChange={e => {
                  setFormStart(e.target.value);
                  if (e.target.value > formEnd) setFormEnd(e.target.value);
                }} />
            </div>

            <div className="ta-field">
              <label className="ta-label" htmlFor="ta-end">End Date</label>
              <input id="ta-end" type="date" className="ta-input" value={formEnd}
                min={formStart}
                onChange={e => setFormEnd(e.target.value)} />
            </div>

            <div className="ta-field ta-field--reason">
              <label className="ta-label" htmlFor="ta-reason">Reason <span className="ta-optional">(optional)</span></label>
              <input id="ta-reason" type="text" className="ta-input" list="ta-reason-list"
                placeholder="PTO, Training, Holiday…"
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
              <datalist id="ta-reason-list">
                {REASON_PRESETS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            <div className="ta-field ta-field--action">
              <label className="ta-label">&nbsp;</label>
              <button className="ta-add-btn" onClick={handleAdd} disabled={saving || !formTechId}>
                {saving ? 'Adding…' : 'Add Block'}
              </button>
            </div>
          </div>

          {formStart !== formEnd && formStart && formEnd && formEnd >= formStart && (
            <div className="ta-range-hint">
              {expandDateRange(formStart, formEnd).length} day(s) will be blocked
            </div>
          )}

          {saveMsg && (
            <div className={`ta-msg ta-msg--${saveMsg.type}`}>{saveMsg.text}</div>
          )}
        </div>

        {/* ── Block List ── */}
        <div className="ta-card">
          <div className="ta-list-header">
            <h2 className="ta-card-title">Scheduled Blocks</h2>
            <div className="ta-list-controls">
              <select className="ta-select ta-select--sm" value={filterTechId}
                onChange={e => setFilterTechId(e.target.value)}>
                <option value="all">All technicians</option>
                {techs.map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.email}</option>
                ))}
              </select>
              <label className="ta-past-toggle">
                <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
                Show past
              </label>
            </div>
          </div>

          {loading ? (
            <p className="ta-empty">Loading…</p>
          ) : listBlocks.length === 0 ? (
            <p className="ta-empty">
              {showPast ? 'No blocks on record.' : 'No upcoming blocks. Add one above.'}
            </p>
          ) : (
            <table className="ta-table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Date</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listBlocks.map(b => {
                  const c = colorOf(b.technicianId);
                  const isPast = b.date < today;
                  return (
                    <tr key={b.id} className={isPast ? 'ta-row--past' : ''}>
                      <td>
                        <span className="ta-tech-pill"
                          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                          {b.technicianName || '—'}
                        </span>
                      </td>
                      <td className="ta-td-date">
                        {displayDate(b.date)}
                        {b.date === today && <span className="ta-today-tag">today</span>}
                      </td>
                      <td className="ta-td-reason">
                        {b.reason || <span className="ta-no-reason">—</span>}
                      </td>
                      <td className="ta-td-action">
                        <button className="ta-remove-btn"
                          onClick={() => handleDelete(b.id)}
                          disabled={deletingId === b.id}>
                          {deletingId === b.id ? '…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
};

export default TechAvailability;
