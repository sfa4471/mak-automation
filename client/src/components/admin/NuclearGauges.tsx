import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gaugesApi, { GAUGE_MODELS, GaugeModel, NuclearGauge } from '../../api/gauges';
import { useAppDialog } from '../../context/AppDialogContext';
import { useTenant } from '../../context/TenantContext';
import './NuclearGauges.css';

type Tab = 'status' | 'manage' | 'log';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function isoToTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NuclearGauges() {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useAppDialog();
  const { tenant } = useTenant();

  const [tab, setTab] = useState<Tab>('status');
  const [gauges, setGauges] = useState<NuclearGauge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Manage tab
  const [showAddModal, setShowAddModal] = useState(false);
  const [editGauge, setEditGauge] = useState<NuclearGauge | null>(null);
  const [addForm, setAddForm] = useState({ serialNumber: '', model: GAUGE_MODELS[0] as string, nickname: '' });
  const [customModel, setCustomModel] = useState('');
  const isCustomModel = !GAUGE_MODELS.includes(addForm.model as GaugeModel);
  const [saving, setSaving] = useState(false);

  // Log tab
  const now = new Date();
  const [logMonth, setLogMonth] = useState(now.getMonth() + 1);
  const [logYear, setLogYear] = useState(now.getFullYear());
  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Manual entry modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [technicians, setTechnicians] = useState<{ id: number; name: string }[]>([]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [manualForm, setManualForm] = useState({
    gaugeId: '' as number | '',
    date: todayStr,
    timeOut: '',
    timeIn: '',
    blockClosed: null as boolean | null,
    destination: '',
    technicianId: '' as number | '',
    projectName: '',
    chd: '',
    notes: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // Edit log entry modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [editGaugeName, setEditGaugeName] = useState('');
  const [editIsGuest, setEditIsGuest] = useState(false);
  const [editForm, setEditForm] = useState({
    date: '',
    timeOut: '',
    timeIn: '',
    blockClosed: null as boolean | null,
    destination: '',
    technicianId: '' as number | '',
    technicianName: '',
    projectName: '',
    chd: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadGauges = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await gaugesApi.list();
      setGauges(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load gauges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGauges(); }, [loadGauges]);

  const loadLog = useCallback(async () => {
    try {
      setLogLoading(true);
      const data = await gaugesApi.getAllLog(logMonth, logYear);
      setLogEntries(data.entries);
    } catch {
      setLogEntries([]);
    } finally {
      setLogLoading(false);
    }
  }, [logMonth, logYear]);

  useEffect(() => {
    if (tab === 'log') {
      loadLog();
      if (technicians.length === 0) {
        gaugesApi.listTechnicians().then(setTechnicians).catch(() => {});
      }
    }
  }, [tab, loadLog]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Print monthly log ----
  function handlePrint() {
    const monthName = MONTHS[logMonth - 1];
    const companyName = tenant?.name || '';
    const addr = [tenant?.companyAddress, tenant?.companyCity, tenant?.companyState, tenant?.companyZip]
      .filter(Boolean).join(', ');
    const phone = tenant?.companyPhone || '';
    const email = tenant?.companyEmail || '';

    const rows = logEntries.map(e => {
      const gaugeName = e.nuclearGauges
        ? `${e.nuclearGauges.model} · ${e.nuclearGauges.serialNumber}`
        : '—';
      const tech = e.users?.name || e.technicianName || '—';
      const dateStr = e.logDate ? new Date(e.logDate).toLocaleDateString() : '—';
      const tOut = e.timeOut ? new Date(e.timeOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
      const tIn  = e.timeIn  ? new Date(e.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
      const blk  = e.blockClosed === true ? 'Yes' : e.blockClosed === false ? 'No' : '—';
      return `<tr>
        <td>${dateStr}</td>
        <td>${gaugeName}</td>
        <td>${tech}</td>
        <td>${tOut}</td>
        <td>${tIn}</td>
        <td style="color:${e.blockClosed ? '#15803d' : '#dc2626'};font-weight:600">${blk}</td>
        <td>${e.projectName || '—'}</td>
        <td>${e.destination || '—'}</td>
        <td>${e.chd || '—'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Nuclear Gauge Log — ${monthName} ${logYear}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 9pt; padding: 16px 20px; background: white; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 14px; }
  .company-name { font-size: 11pt; font-weight: bold; margin-bottom: 3px; }
  .company-info { font-size: 9pt; line-height: 1.6; color: #444; }
  .report-label { font-size: 9pt; color: #888; text-align: right; }
  .report-title { text-align: center; font-size: 14pt; font-weight: bold; text-decoration: underline; margin: 12px 0 4px; }
  .report-period { text-align: center; font-size: 10pt; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
  td { border: 1px solid #d1d5db; padding: 5px 8px; }
  tr:nth-child(even) td { background: #f9fafb; }
  .print-btn { margin: 14px 0; padding: 8px 22px; background: #1a1a2e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
      <div class="company-info">
        ${addr   ? `<div>${addr}</div>` : ''}
        ${phone  ? `<div>Phone: ${phone}</div>` : ''}
        ${email  ? `<div>Email: ${email}</div>` : ''}
      </div>
    </div>
    <div class="report-label">Nuclear Gauge Log</div>
  </div>
  <div class="report-title">Nuclear Gauge Monthly Log</div>
  <div class="report-period">Period: ${monthName} ${logYear}</div>
  <table>
    <thead>
      <tr>
        <th>Date</th><th>Gauge</th><th>Technician</th>
        <th>Time Out</th><th>Time In</th><th>Block Std.</th>
        <th>Project</th><th>Destination</th><th>CHD</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="9" style="text-align:center;color:#999;padding:14px">No entries for this period</td></tr>'}
    </tbody>
  </table>
  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  // ---- Edit log entry ----
  function openEditEntry(e: any) {
    setEditEntryId(e.id);
    const gaugeName = e.nuclearGauges
      ? `${e.nuclearGauges.model} · S/N ${e.nuclearGauges.serialNumber}`
      : `Gauge #${e.gaugeId}`;
    setEditGaugeName(gaugeName);
    setEditIsGuest(!e.technicianId && !!e.technicianName);
    setEditForm({
      date: e.logDate || '',
      timeOut: isoToTimeInput(e.timeOut),
      timeIn: isoToTimeInput(e.timeIn),
      blockClosed: e.blockClosed,
      destination: e.destination || '',
      technicianId: e.technicianId || '',
      technicianName: e.technicianName || '',
      projectName: e.projectName || '',
      chd: e.chd || '',
      notes: e.notes || '',
    });
    setEditError('');
    setShowEditModal(true);
  }

  async function handleSaveEditEntry() {
    setEditError('');
    if (!editForm.date) return setEditError('Date is required.');
    if (!editForm.timeOut) return setEditError('Time out is required.');
    setEditSaving(true);
    try {
      await gaugesApi.updateLogEntry(editEntryId!, {
        date: editForm.date,
        timeOut: editForm.timeOut,
        timeIn: editForm.timeIn || undefined,
        blockClosed: editForm.blockClosed,
        destination: editForm.destination.trim() || undefined,
        technicianId: editIsGuest ? undefined : (editForm.technicianId ? (editForm.technicianId as number) : null),
        technicianName: editIsGuest ? (editForm.technicianName || undefined) : undefined,
        projectName: editForm.projectName.trim() || undefined,
        chd: editForm.chd.trim() || undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setShowEditModal(false);
      loadLog();
    } catch (e: any) {
      setEditError(e?.response?.data?.error || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  // ---- Manual entry ----
  async function handleSaveManualEntry() {
    setManualError('');
    if (!manualForm.gaugeId) return setManualError('Select a gauge.');
    if (!manualForm.date) return setManualError('Date is required.');
    if (!manualForm.timeOut) return setManualError('Time out is required.');
    if (manualForm.blockClosed === null) return setManualError('Block standardization confirmation is required.');
    if (!manualForm.destination.trim()) return setManualError('Destination is required.');
    setManualSaving(true);
    try {
      await gaugesApi.manualLogEntry({
        gaugeId: manualForm.gaugeId as number,
        date: manualForm.date,
        timeOut: manualForm.timeOut,
        timeIn: manualForm.timeIn || undefined,
        blockClosed: manualForm.blockClosed,
        destination: manualForm.destination.trim(),
        technicianId: manualForm.technicianId ? (manualForm.technicianId as number) : undefined,
        projectName: manualForm.projectName.trim() || undefined,
        chd: manualForm.chd.trim() || undefined,
        notes: manualForm.notes.trim() || undefined,
      });
      setShowManualModal(false);
      setManualForm({ gaugeId: '', date: todayStr, timeOut: '', timeIn: '', blockClosed: null, destination: '', technicianId: '', projectName: '', chd: '', notes: '' });
      loadLog();
    } catch (e: any) {
      setManualError(e?.response?.data?.errors?.[0]?.msg || e?.response?.data?.error || 'Failed to save entry.');
    } finally {
      setManualSaving(false);
    }
  }

  // ---- Add / Edit gauge ----
  async function handleSaveGauge() {
    if (!addForm.serialNumber.trim()) return showAlert('Serial number is required.');
    const resolvedModel = addForm.model === 'Other' ? customModel.trim() : addForm.model;
    if (!resolvedModel) return showAlert('Please enter a model name.');
    setSaving(true);
    try {
      if (editGauge) {
        await gaugesApi.update(editGauge.id, {
          serialNumber: addForm.serialNumber,
          model: resolvedModel,
          nickname: addForm.nickname || undefined,
        });
      } else {
        await gaugesApi.create({ ...addForm, model: resolvedModel });
      }
      setShowAddModal(false);
      setEditGauge(null);
      setAddForm({ serialNumber: '', model: GAUGE_MODELS[0], nickname: '' });
      setCustomModel('');
      loadGauges();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || 'Failed to save gauge');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(g: NuclearGauge) {
    setEditGauge(g);
    const isPreset = GAUGE_MODELS.includes(g.model as GaugeModel);
    setAddForm({ serialNumber: g.serialNumber, model: isPreset ? g.model : 'Other', nickname: g.nickname || '' });
    setCustomModel(isPreset ? '' : g.model);
    setShowAddModal(true);
  }

  async function handleDeactivate(g: NuclearGauge) {
    const confirmed = await showConfirm(`Deactivate gauge ${g.serialNumber}? It will be hidden from the status board.`);
    if (!confirmed) return;
    try {
      await gaugesApi.deactivate(g.id);
      loadGauges();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || 'Failed to deactivate gauge');
    }
  }

  async function handleDownloadQr(g: NuclearGauge) {
    try {
      await gaugesApi.downloadQr(g.id);
    } catch {
      showAlert('Failed to generate QR code. Please try again.');
    }
  }

  async function handlePermanentDelete(g: NuclearGauge) {
    const confirmed = await showConfirm(
      `Permanently delete gauge ${g.serialNumber}? This cannot be undone. Only allowed if the gauge has no checkout history.`
    );
    if (!confirmed) return;
    try {
      await gaugesApi.permanentDelete(g.id);
      loadGauges();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || 'Failed to delete gauge');
    }
  }

  const activeGauges = gauges.filter((g) => g.active);
  const inLab = activeGauges.filter((g) => g.status === 'in_lab');
  const inField = activeGauges.filter((g) => g.status === 'in_field');

  return (
    <div className="ng-container">
      <div className="ng-header">
        <button className="secondary-button" onClick={() => navigate('/dashboard')}>← Back</button>
        <h1 className="ng-title">Nuclear Gauge Log</h1>
      </div>

      <div className="ng-tabs">
        <button className={`ng-tab ${tab === 'status' ? 'active' : ''}`} onClick={() => setTab('status')}>
          Status Board
        </button>
        <button className={`ng-tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
          Monthly Log
        </button>
        <button className={`ng-tab ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>
          Manage Gauges
        </button>
      </div>

      {error && <div className="ng-error">{error}</div>}
      {loading && <div className="ng-loading">Loading gauges…</div>}

      {/* ---- STATUS BOARD ---- */}
      {tab === 'status' && !loading && (
        <div className="ng-status-board">
          <div className="ng-section-label">
            In Lab <span className="ng-count in-lab">{inLab.length}</span>
          </div>
          <div className="ng-cards">
            {inLab.length === 0 && <div className="ng-empty">All gauges are currently in the field</div>}
            {inLab.map((g) => (
              <div key={g.id} className="ng-card in-lab" onClick={() => navigate(`/gauges/${g.id}`)}>
                <div className="ng-card-dot in-lab" />
                <div className="ng-card-body">
                  <div className="ng-card-name">{g.nickname || g.serialNumber}</div>
                  <div className="ng-card-sub">{g.model} · S/N {g.serialNumber}</div>
                  <div className="ng-card-status">Available</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ng-section-label" style={{ marginTop: 28 }}>
            In Field <span className="ng-count in-field">{inField.length}</span>
          </div>
          <div className="ng-cards">
            {inField.length === 0 && <div className="ng-empty">No gauges currently in the field</div>}
            {inField.map((g) => {
              const co = g.currentCheckout;
              const hoursOut = co
                ? Math.round((Date.now() - new Date(co.timeOut).getTime()) / 36e5 * 10) / 10
                : 0;
              const overdue = hoursOut > 10;
              return (
                <div key={g.id} className={`ng-card in-field ${overdue ? 'overdue' : ''}`} onClick={() => navigate(`/gauges/${g.id}`)}>
                  <div className="ng-card-dot in-field" />
                  <div className="ng-card-body">
                    <div className="ng-card-name">{g.nickname || g.serialNumber}</div>
                    <div className="ng-card-sub">{g.model} · S/N {g.serialNumber}</div>
                    {co && (
                      <>
                        <div className="ng-card-tech">
                          {co.users?.name || (co as any).technicianName || 'Unknown technician'}
                        </div>
                        <div className="ng-card-project">{co.projectName || (co.projectId ? `Project #${co.projectId}` : '')}</div>
                        <div className="ng-card-destination">{co.destination}</div>
                        <div className={`ng-card-time ${overdue ? 'overdue' : ''}`}>
                          Out since {formatTime(co.timeOut)} · {hoursOut}h ago {overdue ? '⚠️ Overdue' : ''}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- MONTHLY LOG ---- */}
      {tab === 'log' && (
        <div className="ng-log">
          <div className="ng-log-controls">
            <select value={logMonth} onChange={(e) => setLogMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={logYear} onChange={(e) => setLogYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="ng-log-actions">
              <button className="ng-print-btn" onClick={handlePrint} disabled={logEntries.length === 0}>
                Print Report
              </button>
              <button className="primary-button ng-manual-btn" onClick={() => { setManualError(''); setShowManualModal(true); }}>
                + Manual Entry
              </button>
            </div>
          </div>

          {logLoading && <div className="ng-loading">Loading log…</div>}
          {!logLoading && (
            <div className="ng-log-table-wrap">
              <table className="ng-log-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Gauge</th>
                    <th>Technician</th>
                    <th>Time Out</th>
                    <th>Time In</th>
                    <th>Block Std.</th>
                    <th>Project</th>
                    <th>Destination</th>
                    <th>CHD</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logEntries.length === 0 && (
                    <tr><td colSpan={11} className="ng-empty-row">No entries for {MONTHS[logMonth - 1]} {logYear}</td></tr>
                  )}
                  {logEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.logDate)}</td>
                      <td>
                        {e.nuclearGauges
                          ? `${e.nuclearGauges.model} · ${e.nuclearGauges.serialNumber}`
                          : '—'}
                      </td>
                      <td>{e.users?.name || e.technicianName || '—'}</td>
                      <td>{formatTime(e.timeOut)}</td>
                      <td>{formatTime(e.timeIn)}</td>
                      <td className={e.blockClosed ? 'ng-yes' : 'ng-no'}>{e.blockClosed ? 'Yes' : 'No'}</td>
                      <td>{e.projectName || '—'}</td>
                      <td>{e.destination || '—'}</td>
                      <td>{e.chd || '—'}</td>
                      <td className="ng-notes-cell">{e.notes || '—'}</td>
                      <td>
                        <button className="ng-action-btn" onClick={() => openEditEntry(e)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- MANAGE GAUGES ---- */}
      {tab === 'manage' && !loading && (
        <div className="ng-manage">
          <div className="ng-manage-toolbar">
            <button className="primary-button" onClick={() => { setEditGauge(null); setAddForm({ serialNumber: '', model: GAUGE_MODELS[0], nickname: '' }); setShowAddModal(true); }}>
              + Add Gauge
            </button>
          </div>
          <table className="ng-manage-table">
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Model</th>
                <th>Nickname</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gauges.length === 0 && (
                <tr><td colSpan={5} className="ng-empty-row">No gauges added yet</td></tr>
              )}
              {gauges.map((g) => (
                <tr key={g.id} className={!g.active ? 'ng-inactive-row' : ''}>
                  <td>{g.serialNumber}</td>
                  <td>{g.model}</td>
                  <td>{g.nickname || '—'}</td>
                  <td>
                    <span className={`ng-badge ${g.active ? (g.status === 'in_field' ? 'in-field' : 'in-lab') : 'inactive'}`}>
                      {!g.active ? 'Inactive' : g.status === 'in_field' ? 'In Field' : 'In Lab'}
                    </span>
                  </td>
                  <td className="ng-actions">
                    <button className="ng-action-btn" onClick={() => handleDownloadQr(g)}>QR Code</button>
                    <button className="ng-action-btn" onClick={() => openEdit(g)}>Edit</button>
                    {g.active && (
                      <button className="ng-action-btn danger" onClick={() => handleDeactivate(g)}>Deactivate</button>
                    )}
                    <button className="ng-action-btn danger" onClick={() => handlePermanentDelete(g)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- ADD / EDIT GAUGE MODAL ---- */}
      {showAddModal && (
        <div className="ng-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="ng-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editGauge ? 'Edit Gauge' : 'Add Gauge'}</h2>
            <div className="ng-form-group">
              <label>Serial Number</label>
              <input
                value={addForm.serialNumber}
                onChange={(e) => setAddForm((f) => ({ ...f, serialNumber: e.target.value }))}
                placeholder="e.g. 30303"
              />
            </div>
            <div className="ng-form-group">
              <label>Model</label>
              <select
                value={isCustomModel ? 'Other' : addForm.model}
                onChange={(e) => {
                  setAddForm((f) => ({ ...f, model: e.target.value }));
                  if (e.target.value !== 'Other') setCustomModel('');
                }}
              >
                {GAUGE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value="Other">Other (enter manually)</option>
              </select>
              {(addForm.model === 'Other' || isCustomModel) && (
                <input
                  style={{ marginTop: 8 }}
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="e.g. Instrotek Chek-It 5001"
                  autoFocus
                />
              )}
            </div>
            <div className="ng-form-group">
              <label>Nickname <span className="ng-optional">(optional)</span></label>
              <input
                value={addForm.nickname}
                onChange={(e) => setAddForm((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="e.g. Gauge 1"
              />
            </div>
            <div className="ng-modal-actions">
              <button className="secondary-button" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="primary-button" onClick={handleSaveGauge} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- MANUAL LOG ENTRY MODAL ---- */}
      {showManualModal && (
        <div className="ng-modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="ng-modal ng-modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Manual Log Entry</h2>
            {manualError && <div className="ng-modal-error">{manualError}</div>}

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Gauge <span className="ng-req">*</span></label>
                <select value={manualForm.gaugeId} onChange={(e) => setManualForm((f) => ({ ...f, gaugeId: e.target.value ? Number(e.target.value) : '' }))}>
                  <option value="">Select gauge…</option>
                  {gauges.filter(g => g.active).map((g) => (
                    <option key={g.id} value={g.id}>{g.model} · {g.serialNumber}{g.nickname ? ` (${g.nickname})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="ng-form-group">
                <label>Date <span className="ng-req">*</span></label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Time Out <span className="ng-req">*</span></label>
                <input type="time" value={manualForm.timeOut} onChange={(e) => setManualForm((f) => ({ ...f, timeOut: e.target.value }))} />
              </div>
              <div className="ng-form-group">
                <label>Time In <span className="ng-opt">(optional)</span></label>
                <input type="time" value={manualForm.timeIn} onChange={(e) => setManualForm((f) => ({ ...f, timeIn: e.target.value }))} />
              </div>
            </div>

            <div className="ng-form-group">
              <label>Technician <span className="ng-opt">(optional — defaults to you)</span></label>
              <select value={manualForm.technicianId} onChange={(e) => setManualForm((f) => ({ ...f, technicianId: e.target.value ? Number(e.target.value) : '' }))}>
                <option value="">Select technician…</option>
                {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            <div className="ng-form-group">
              <label>Block Standardization Check <span className="ng-req">*</span></label>
              <div className="ng-toggle-row">
                <button type="button" className={`ng-toggle-btn ${manualForm.blockClosed === true ? 'active-yes' : ''}`} onClick={() => setManualForm((f) => ({ ...f, blockClosed: true }))}>Yes — completed</button>
                <button type="button" className={`ng-toggle-btn ${manualForm.blockClosed === false ? 'active-no' : ''}`} onClick={() => setManualForm((f) => ({ ...f, blockClosed: false }))}>No</button>
              </div>
            </div>

            <div className="ng-form-group">
              <label>Destination <span className="ng-req">*</span></label>
              <input value={manualForm.destination} onChange={(e) => setManualForm((f) => ({ ...f, destination: e.target.value }))} placeholder="Job site address or name" />
            </div>

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Project <span className="ng-opt">(optional)</span></label>
                <input value={manualForm.projectName} onChange={(e) => setManualForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="Project name" />
              </div>
              <div className="ng-form-group">
                <label>CHD <span className="ng-opt">(optional)</span></label>
                <input value={manualForm.chd} onChange={(e) => setManualForm((f) => ({ ...f, chd: e.target.value }))} placeholder="Count history data" />
              </div>
            </div>

            <div className="ng-form-group">
              <label>Notes <span className="ng-opt">(optional)</span></label>
              <textarea rows={2} value={manualForm.notes} onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any observations" />
            </div>

            <div className="ng-modal-actions">
              <button className="secondary-button" onClick={() => setShowManualModal(false)}>Cancel</button>
              <button className="primary-button" onClick={handleSaveManualEntry} disabled={manualSaving}>
                {manualSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- EDIT LOG ENTRY MODAL ---- */}
      {showEditModal && (
        <div className="ng-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="ng-modal ng-modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Log Entry</h2>
            <p className="ng-modal-subtitle">{editGaugeName}</p>
            {editError && <div className="ng-modal-error">{editError}</div>}

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Date <span className="ng-req">*</span></label>
                <input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="ng-form-group">
                {editIsGuest ? (
                  <>
                    <label>Guest Name</label>
                    <input
                      value={editForm.technicianName}
                      onChange={(e) => setEditForm((f) => ({ ...f, technicianName: e.target.value }))}
                      placeholder="Technician name"
                    />
                  </>
                ) : (
                  <>
                    <label>Technician</label>
                    <select value={editForm.technicianId} onChange={(e) => setEditForm((f) => ({ ...f, technicianId: e.target.value ? Number(e.target.value) : '' }))}>
                      <option value="">— Unassigned —</option>
                      {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Time Out <span className="ng-req">*</span></label>
                <input type="time" value={editForm.timeOut} onChange={(e) => setEditForm((f) => ({ ...f, timeOut: e.target.value }))} />
              </div>
              <div className="ng-form-group">
                <label>Time In <span className="ng-opt">(optional)</span></label>
                <input type="time" value={editForm.timeIn} onChange={(e) => setEditForm((f) => ({ ...f, timeIn: e.target.value }))} />
              </div>
            </div>

            <div className="ng-form-group">
              <label>Block Standardization Check</label>
              <div className="ng-toggle-row">
                <button type="button" className={`ng-toggle-btn ${editForm.blockClosed === true ? 'active-yes' : ''}`} onClick={() => setEditForm((f) => ({ ...f, blockClosed: true }))}>Yes — completed</button>
                <button type="button" className={`ng-toggle-btn ${editForm.blockClosed === false ? 'active-no' : ''}`} onClick={() => setEditForm((f) => ({ ...f, blockClosed: false }))}>No</button>
                <button type="button" className={`ng-toggle-btn ${editForm.blockClosed === null ? 'active-neutral' : ''}`} onClick={() => setEditForm((f) => ({ ...f, blockClosed: null }))}>N/A</button>
              </div>
            </div>

            <div className="ng-form-group">
              <label>Destination</label>
              <input value={editForm.destination} onChange={(e) => setEditForm((f) => ({ ...f, destination: e.target.value }))} placeholder="Job site address or name" />
            </div>

            <div className="ng-form-row">
              <div className="ng-form-group">
                <label>Project</label>
                <input value={editForm.projectName} onChange={(e) => setEditForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="Project name" />
              </div>
              <div className="ng-form-group">
                <label>CHD</label>
                <input value={editForm.chd} onChange={(e) => setEditForm((f) => ({ ...f, chd: e.target.value }))} placeholder="Count history data" />
              </div>
            </div>

            <div className="ng-form-group">
              <label>Notes</label>
              <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any observations" />
            </div>

            <div className="ng-modal-actions">
              <button className="secondary-button" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="primary-button" onClick={handleSaveEditEntry} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
