import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDialog } from '../../context/AppDialogContext';
import api from '../../api/api';
import {
  getRateSets, createRateSet,
  getWorkorders, createWorkorder, updateWorkorder, deleteWorkorder,
  getInvoices, generateInvoice, approveInvoice, voidInvoice, regenerateInvoice,
  getProjectFinancials, previewInvoice, updateInvoiceLine,
  formatCents, sourceTypeLabel,
  RateSet, RateSetInput, Workorder, Invoice, InvoiceLine, FinancialSummary, InvoicePreview,
} from '../../api/invoicing';
import { pushInvoiceToQbo } from '../../api/qbo';
import { tasksAPI, Task, taskTypeLabel } from '../../api/tasks';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'rates';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  unbilled: '#6b7280',
  claimed:  '#d97706',
  billed:   '#059669',
  draft:    '#6b7280',
  approved: '#2563eb',
  pushed:   '#059669',
  void:     '#dc2626',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      color: '#fff',
      background: STATUS_COLORS[status] || '#6b7280',
      textTransform: 'capitalize',
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empty rate form
// ---------------------------------------------------------------------------
const emptyRateForm = (): RateSetInput => ({
  projectId: 0,
  effectiveDate: new Date().toISOString().slice(0, 10),
  technicianRate: 0,
  technicianOtRate: 0,
  tripFlat: 0,
  tripPerMile: 0,
  cylinderRate: 0,
  nuclearGaugeRate: 0,
  densityTestRate: 0,
  proctorRate: 0,
  atterbergRate: 0,
  sieve200Rate: 0,
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProjectFinancials() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useAppDialog();

  const [tab, setTab] = useState<Tab>('overview');
  const [projectName, setProjectName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');

  // Overview
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Workorders
  const [workorders, setWorkorders] = useState<Workorder[]>([]);
  const [woLoading, setWoLoading] = useState(false);
  const [expandedWo, setExpandedWo] = useState<number | null>(null);
  const [woForm, setWoForm] = useState({ workorderNumber: '', description: '' });
  const [showWoForm, setShowWoForm] = useState(false);
  const [woSaving, setWoSaving] = useState(false);

  // Tasks per workorder (loaded on expand)
  const [tasksByWo, setTasksByWo] = useState<Record<number, Task[]>>({});

  // Rates
  const [rateSets, setRateSets] = useState<RateSet[]>([]);
  const [rateForm, setRateForm] = useState<RateSetInput>(emptyRateForm());
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);

  // Invoice generation
  const [selectedWoIds, setSelectedWoIds] = useState<number[]>([]);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<InvoicePreview | null>(null);

  // Admin workorder time editing
  const [editWoId, setEditWoId] = useState<number | null>(null);
  const [editWoForm, setEditWoForm] = useState({ clockIn: '', clockOut: '', breakMinutes: '0', miles: '0' });
  const [woTimeSaving, setWoTimeSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const loadProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      setProjectName(data.projectName || data.project_name || '');
      setProjectNumber(data.projectNumber || data.project_number || '');
    } catch (_) {}
  }, [projectId]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const [s, inv] = await Promise.all([
        getProjectFinancials(projectId),
        getInvoices(projectId),
      ]);
      setSummary(s);
      setInvoices(inv);
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setSummaryLoading(false);
    }
  }, [projectId, showAlert]);

  const loadWorkorders = useCallback(async () => {
    setWoLoading(true);
    try {
      const wos = await getWorkorders(projectId);
      setWorkorders(wos);
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setWoLoading(false);
    }
  }, [projectId, showAlert]);

  const loadTasksForWo = useCallback(async (workorderId: number) => {
    try {
      const { data } = await api.get(`/tasks/project/${projectId}`);
      const all: Task[] = Array.isArray(data) ? data : (data.tasks || []);
      const woTasks = all.filter((t: Task) => (t as any).workorder_id === workorderId || t.workorderId === workorderId);
      setTasksByWo(prev => ({ ...prev, [workorderId]: woTasks }));
    } catch (_) {}
  }, [projectId]);

  const loadRateSets = useCallback(async () => {
    try {
      const rs = await getRateSets(projectId);
      setRateSets(rs);
    } catch (_) {}
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (tab === 'overview') { loadSummary(); loadWorkorders(); }
    if (tab === 'rates') loadRateSets();
  }, [tab, loadSummary, loadRateSets, loadWorkorders]);

  // Load tasks when workorder expands
  useEffect(() => {
    if (expandedWo !== null) loadTasksForWo(expandedWo);
  }, [expandedWo, loadTasksForWo]);

  // ---------------------------------------------------------------------------
  // Workorder actions
  // ---------------------------------------------------------------------------

  async function handleCreateWorkorder() {
    if (!woForm.workorderNumber.trim()) return;
    setWoSaving(true);
    try {
      await createWorkorder({ projectId, ...woForm });
      setWoForm({ workorderNumber: '', description: '' });
      setShowWoForm(false);
      loadWorkorders();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setWoSaving(false);
    }
  }

  async function handleDeleteWorkorder(wo: Workorder) {
    const ok = await showConfirm(`Delete workorder "${wo.workorderNumber}"?`);
    if (!ok) return;
    try {
      await deleteWorkorder(wo.id);
      loadWorkorders();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  async function handleMarkWoComplete(wo: Workorder) {
    const tasks = tasksByWo[wo.id] || [];
    const openTasks = tasks.filter(t => !['APPROVED', 'COULD_NOT_ACCESS'].includes(t.status));
    if (openTasks.length > 0) {
      const taskList = openTasks.map(t => `• ${taskTypeLabel(t)} (${t.status.replace(/_/g, ' ')})`).join('\n');
      const ok = await showConfirm(
        `This workorder has ${openTasks.length} incomplete task(s):\n\n${taskList}\n\nMark complete anyway?`,
      );
      if (!ok) return;
    }
    try {
      await updateWorkorder(wo.id, { status: 'complete' });
      loadWorkorders();
      loadSummary();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  // ---------------------------------------------------------------------------
  // Admin workorder time edit
  // ---------------------------------------------------------------------------

  function openWoTimeEdit(wo: Workorder) {
    const toLocalDatetime = (iso?: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditWoForm({
      clockIn:      toLocalDatetime(wo.clockIn),
      clockOut:     toLocalDatetime(wo.clockOut),
      breakMinutes: String(wo.breakMinutes ?? 0),
      miles:        String(wo.miles ?? 0),
    });
    setEditWoId(wo.id);
  }

  async function handleSaveWoTime() {
    if (editWoId == null) return;
    setWoTimeSaving(true);
    try {
      const toISO = (local: string) => local ? new Date(local).toISOString() : undefined;
      await updateWorkorder(editWoId, {
        clockIn:      toISO(editWoForm.clockIn) ?? null,
        clockOut:     toISO(editWoForm.clockOut) ?? null,
        breakMinutes: parseInt(editWoForm.breakMinutes || '0', 10),
        miles:        parseFloat(editWoForm.miles || '0'),
      });
      setEditWoId(null);
      loadWorkorders();
      loadSummary();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setWoTimeSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Rate set actions
  // ---------------------------------------------------------------------------

  function prefillRateForm(rs: RateSet) {
    setRateForm({
      projectId,
      effectiveDate: new Date().toISOString().slice(0, 10),
      technicianRate:   Number(rs.technicianRate),
      technicianOtRate: Number(rs.technicianOtRate),
      tripFlat:         Number(rs.tripFlat),
      tripPerMile:      Number(rs.tripPerMile),
      cylinderRate:     Number(rs.cylinderRate),
      nuclearGaugeRate: Number(rs.nuclearGaugeRate),
      densityTestRate:  Number(rs.densityTestRate),
      proctorRate:      Number(rs.proctorRate),
      atterbergRate:    Number(rs.atterbergRate),
      sieve200Rate:     Number(rs.sieve200Rate),
    });
    setShowRateForm(true);
  }

  async function handleSaveRateSet() {
    if (rateForm.tripFlat > 0 && rateForm.tripPerMile > 0) {
      showAlert('Set either Trip Flat or Trip Per Mile — not both.', 'Validation Error');
      return;
    }
    if (rateForm.nuclearGaugeRate > 0 && rateForm.densityTestRate > 0) {
      showAlert('Set either Nuclear Gauge Rate or Density Test Rate — not both.', 'Validation Error');
      return;
    }
    setRateSaving(true);
    try {
      await createRateSet({ ...rateForm, projectId });
      setShowRateForm(false);
      setRateForm({ ...emptyRateForm(), projectId });
      loadRateSets();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setRateSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Invoice actions
  // ---------------------------------------------------------------------------

  async function handlePreview() {
    if (!selectedWoIds.length) {
      showAlert('Select at least one workorder.', 'Required');
      return;
    }
    setPreviewing(true);
    try {
      const data = await previewInvoice({ projectId, workorderIds: selectedWoIds });
      setPreviewData(data);
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Preview Error');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleGenerate() {
    if (!selectedWoIds.length) {
      showAlert('Select at least one workorder.', 'Required');
      return;
    }
    setGenerating(true);
    try {
      const { invoice: _invoice, warnings } = await generateInvoice({
        projectId,
        workorderIds: selectedWoIds,
        notes: invoiceNotes || undefined,
      });
      setShowGenerateForm(false);
      setSelectedWoIds([]);
      setInvoiceNotes('');
      setPreviewData(null);
      loadSummary();
      loadWorkorders();
      if (warnings.length) {
        showAlert(`Invoice created with warnings:\n\n${warnings.join('\n')}`, 'Invoice Created');
      }
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(inv: Invoice) {
    const ok = await showConfirm(`Approve invoice #${inv.id} for ${formatCents(inv.totalCents)}?`);
    if (!ok) return;
    try {
      await approveInvoice(inv.id);
      loadSummary();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  async function handleVoid(inv: Invoice) {
    const ok = await showConfirm(`Void invoice #${inv.id}? The workorders will return to the unbilled pool.`);
    if (!ok) return;
    try {
      await voidInvoice(inv.id);
      loadSummary();
      loadWorkorders();
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  async function handlePush(inv: Invoice) {
    const ok = await showConfirm(
      `Push invoice #${inv.id} (${formatCents(inv.totalCents)}) to QuickBooks?\n\n` +
      `This creates a QBO invoice and marks the workorders as Billed. This cannot be undone from here.`
    );
    if (!ok) return;
    try {
      const { qboInvoiceNumber } = await pushInvoiceToQbo(inv.id);
      await loadSummary();
      await loadWorkorders();
      showAlert(`Invoice pushed to QuickBooks as ${qboInvoiceNumber}.`, 'Pushed to QuickBooks');
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  async function handleRegenerate(inv: Invoice) {
    const ok = await showConfirm(`Regenerate draft invoice #${inv.id}? This re-calculates line items against the current rate set.`);
    if (!ok) return;
    try {
      const { warnings } = await regenerateInvoice(inv.id);
      loadSummary();
      if (warnings.length) showAlert(`Regenerated with warnings:\n\n${warnings.join('\n')}`, 'Done');
    } catch (e: any) {
      showAlert(e?.response?.data?.error || e.message, 'Error');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const unbilledComplete = workorders.filter(w => w.billingStatus === 'unbilled');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate(`/admin/projects/${projectId}/details`)}
          style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}
        >
          ← Project Details
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Financials</h1>
          {projectNumber && <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{projectNumber} — {projectName}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {(['overview', 'rates'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#2563eb' : '#374151',
              fontSize: 15,
              textTransform: 'capitalize',
            }}
          >
            {t === 'overview' ? 'Overview & Invoices' : 'Rate Sets'}
          </button>
        ))}
      </div>

      {/* ================================================================ OVERVIEW */}
      {tab === 'overview' && (
        <div>
          {summaryLoading ? (
            <p style={{ color: '#6b7280' }}>Loading financials…</p>
          ) : (
            <>
              {/* Summary cards */}
              {summary && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                    <SummaryCard label="Billed to Date" value={formatCents(summary.billedCents)} color="#059669" />
                    <SummaryCard label="Unbilled WIP" value={formatCents(summary.wipCents)} color="#d97706" />
                    <SummaryCard label="Total (Billed + WIP)" value={formatCents(summary.billedCents + summary.wipCents)} color="#2563eb" />
                  </div>
                </>
              )}

              {/* ── Workorder time & mileage (admin edit) ── */}
              {workorders.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 15, color: '#111827' }}>Workorder Time &amp; Mileage</h3>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f3f4f6' }}>
                          <th style={th}>WO #</th>
                          <th style={th}>Date</th>
                          <th style={th}>Technician</th>
                          <th style={th}>Clock In</th>
                          <th style={th}>Clock Out</th>
                          <th style={th}>Break</th>
                          <th style={th}>Miles</th>
                          <th style={th}>Status</th>
                          <th style={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {workorders.map(wo => (
                          <React.Fragment key={wo.id}>
                            <tr style={{ borderBottom: editWoId === wo.id ? 'none' : '1px solid #f3f4f6' }}>
                              <td style={td}><strong>{wo.workorderNumber}</strong></td>
                              <td style={td}>{fmtDate(wo.scheduledDate)}</td>
                              <td style={td}>{wo.assignedTechnicianName || '—'}</td>
                              <td style={td}>{wo.clockIn ? new Date(wo.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                              <td style={td}>{wo.clockOut ? new Date(wo.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                              <td style={td}>{wo.breakMinutes != null ? `${wo.breakMinutes}m` : '—'}</td>
                              <td style={td}>{wo.miles != null ? wo.miles : '—'}</td>
                              <td style={td}><StatusBadge status={wo.status} /></td>
                              <td style={td}>
                                {editWoId === wo.id ? (
                                  <button onClick={() => setEditWoId(null)} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                ) : (
                                  <button onClick={() => openWoTimeEdit(wo)} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: '1px solid #bfdbfe', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>✏️ Edit</button>
                                )}
                              </td>
                            </tr>
                            {editWoId === wo.id && (
                              <tr style={{ background: '#f0f9ff', borderBottom: '1px solid #e5e7eb' }}>
                                <td colSpan={9} style={{ padding: '12px 16px' }}>
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Clock In</label>
                                      <input type="datetime-local" value={editWoForm.clockIn}
                                        onChange={e => setEditWoForm(f => ({ ...f, clockIn: e.target.value }))}
                                        style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Clock Out</label>
                                      <input type="datetime-local" value={editWoForm.clockOut}
                                        onChange={e => setEditWoForm(f => ({ ...f, clockOut: e.target.value }))}
                                        style={{ fontSize: 13, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Break (min)</label>
                                      <input type="number" min="0" value={editWoForm.breakMinutes}
                                        onChange={e => setEditWoForm(f => ({ ...f, breakMinutes: e.target.value }))}
                                        style={{ width: 80, fontSize: 13, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>Miles</label>
                                      <input type="number" min="0" step="0.1" value={editWoForm.miles}
                                        onChange={e => setEditWoForm(f => ({ ...f, miles: e.target.value }))}
                                        style={{ width: 90, fontSize: 13, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4 }} />
                                    </div>
                                    <button onClick={handleSaveWoTime} disabled={woTimeSaving}
                                      style={{ padding: '6px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                                      {woTimeSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button onClick={() => setEditWoId(null)}
                                      style={{ padding: '6px 12px', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Generate invoice */}
              {woLoading ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>Loading workorders…</p>
              ) : unbilledComplete.length > 0 ? (
                <div style={{ marginBottom: 20, padding: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>
                      {unbilledComplete.length} unbilled workorder{unbilledComplete.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => setShowGenerateForm(true)}
                      style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Generate Invoice
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 20, padding: 14, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#6b7280', fontSize: 13 }}>
                  No unbilled workorders. Create a workorder from the project page to start billing.
                </div>
              )}

              {/* Generate form */}
              {showGenerateForm && (
                <div style={{ marginBottom: 20, padding: 16, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8 }}>
                  <h3 style={{ margin: '0 0 12px 0' }}>New Invoice</h3>
                  <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#6b7280' }}>Select workorders to include:</p>
                  {unbilledComplete.map(wo => (
                    <label key={wo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: selectedWoIds.includes(wo.id) ? '#f0fdf4' : '#fff' }}>
                      <input
                        type="checkbox"
                        checked={selectedWoIds.includes(wo.id)}
                        onChange={e => setSelectedWoIds(prev =>
                          e.target.checked ? [...prev, wo.id] : prev.filter(x => x !== wo.id)
                        )}
                      />
                      <strong style={{ fontSize: 14 }}>{wo.workorderNumber}</strong>
                      {wo.description && <span style={{ color: '#6b7280', fontSize: 13 }}>{wo.description}</span>}
                      {wo.scheduledDate && <span style={{ color: '#6b7280', fontSize: 12 }}>· {fmtDate(wo.scheduledDate)}</span>}
                      {wo.assignedTechnicianName && <span style={{ color: '#6b7280', fontSize: 12 }}>· {wo.assignedTechnicianName}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 11, padding: '1px 7px', borderRadius: 8, fontWeight: 600, background: wo.status === 'approved' ? '#d1fae5' : wo.status === 'complete' ? '#dbeafe' : '#f3f4f6', color: wo.status === 'approved' ? '#065f46' : wo.status === 'complete' ? '#1e40af' : '#6b7280', textTransform: 'capitalize' }}>
                        {wo.status.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Notes (optional)</label>
                    <textarea
                      value={invoiceNotes}
                      onChange={e => setInvoiceNotes(e.target.value)}
                      rows={2}
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Preview line items */}
                  {previewData && (
                    <div style={{ marginTop: 16, padding: 14, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <strong style={{ fontSize: 14 }}>Preview (Rate Set v{previewData.rateSetVersion})</strong>
                        <button onClick={() => setPreviewData(null)} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                      </div>
                      {previewData.warnings.length > 0 && (
                        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#92400e' }}>
                          {previewData.warnings.map((w, i) => <div key={i}>{w}</div>)}
                        </div>
                      )}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #bae6fd' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Qty</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Rate</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.lines.map((l, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #e0f2fe' }}>
                              <td style={{ padding: '4px 8px' }}>{sourceTypeLabel(l.sourceType)}</td>
                              <td style={{ padding: '4px 8px', color: '#6b7280' }}>{l.description || '—'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{l.qty}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{formatCents(l.unitRateCents)}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{formatCents(l.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid #bae6fd' }}>
                            <td colSpan={4} style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Subtotal</td>
                            <td style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>{formatCents(previewData.subtotalCents)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {previewData ? (
                      <button
                        onClick={handleGenerate}
                        disabled={generating || !selectedWoIds.length}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {generating ? 'Generating…' : 'Confirm & Generate Draft'}
                      </button>
                    ) : (
                      <button
                        onClick={handlePreview}
                        disabled={previewing || !selectedWoIds.length}
                        style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {previewing ? 'Loading Preview…' : 'Preview Line Items'}
                      </button>
                    )}
                    <button
                      onClick={() => { setShowGenerateForm(false); setSelectedWoIds([]); setPreviewData(null); }}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Invoice list */}
              <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Invoices</h2>
              {invoices.length === 0 ? (
                <p style={{ color: '#6b7280' }}>No invoices yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {invoices.map(inv => (
                    <InvoiceCard
                      key={inv.id}
                      invoice={inv}
                      onApprove={() => handleApprove(inv)}
                      onVoid={() => handleVoid(inv)}
                      onRegenerate={() => handleRegenerate(inv)}
                      onPush={() => handlePush(inv)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}



      {/* ================================================================= RATES */}
      {tab === 'rates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Rate Sets</h2>
            <button
              onClick={() => {
                const latest = rateSets[0];
                if (latest) prefillRateForm(latest);
                else { setRateForm({ ...emptyRateForm(), projectId }); setShowRateForm(true); }
              }}
              style={btnPrimary}
            >
              {rateSets.length > 0 ? 'New Version (copy latest)' : 'Create First Rate Set'}
            </button>
          </div>

          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            Rate sets are versioned — editing rates always creates a new version. Existing invoices are never affected by rate changes.
          </p>

          {/* Rate create form */}
          {showRateForm && (
            <div style={{ marginBottom: 24, padding: 20, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>
                {rateSets.length > 0 ? `New Version (v${(rateSets[0]?.version || 0) + 1})` : 'Version 1'}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <RateField label="Effective Date" value={rateForm.effectiveDate || ''} type="date"
                  onChange={v => setRateForm(f => ({ ...f, effectiveDate: v }))} />
                <RateField label="Technician Rate ($/hr)" value={String(rateForm.technicianRate)}
                  onChange={v => setRateForm(f => ({ ...f, technicianRate: Number(v) }))} />
                <RateField label="OT Rate ($/hr)" value={String(rateForm.technicianOtRate)}
                  onChange={v => setRateForm(f => ({ ...f, technicianOtRate: Number(v) }))} />
                <RateField label="Trip Flat ($/trip)" value={String(rateForm.tripFlat)}
                  onChange={v => setRateForm(f => ({ ...f, tripFlat: Number(v) }))} hint="Use 0 if billing per mile" />
                <RateField label="Trip Per Mile ($/mi)" value={String(rateForm.tripPerMile)}
                  onChange={v => setRateForm(f => ({ ...f, tripPerMile: Number(v) }))} hint="Use 0 if billing flat" />
                <RateField label="Cylinder Rate ($/each)" value={String(rateForm.cylinderRate)}
                  onChange={v => setRateForm(f => ({ ...f, cylinderRate: Number(v) }))} />
                <RateField label="Nuclear Gauge ($/day)" value={String(rateForm.nuclearGaugeRate)}
                  onChange={v => setRateForm(f => ({ ...f, nuclearGaugeRate: Number(v) }))} hint="Set 0 if billing per-test" />
                <RateField label="Density Test ($/test)" value={String(rateForm.densityTestRate)}
                  onChange={v => setRateForm(f => ({ ...f, densityTestRate: Number(v) }))} hint="Set 0 if billing per-gauge-day" />
                <RateField label="Proctor Rate ($/test)" value={String(rateForm.proctorRate)}
                  onChange={v => setRateForm(f => ({ ...f, proctorRate: Number(v) }))} />
                <RateField label="Atterberg Rate ($/PI)" value={String(rateForm.atterbergRate)}
                  onChange={v => setRateForm(f => ({ ...f, atterbergRate: Number(v) }))} />
                <RateField label="#200 Wash Rate ($/test)" value={String(rateForm.sieve200Rate)}
                  onChange={v => setRateForm(f => ({ ...f, sieve200Rate: Number(v) }))} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSaveRateSet} disabled={rateSaving} style={btnPrimary}>
                  {rateSaving ? 'Saving…' : 'Save Rate Set'}
                </button>
                <button onClick={() => setShowRateForm(false)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          )}

          {/* Rate set history */}
          {rateSets.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No rate sets yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rateSets.map(rs => (
                <div key={rs.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>Version {rs.version}</span>
                      <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 12 }}>Effective {fmtDate(rs.effectiveDate)}</span>
                    </div>
                    {rateSets[0].id === rs.id && (
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Current</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 13 }}>
                    <RateRow label="Tech Rate" value={`$${rs.technicianRate}/hr`} />
                    <RateRow label="OT Rate" value={`$${rs.technicianOtRate}/hr`} />
                    <RateRow label="Trip" value={Number(rs.tripFlat) > 0 ? `$${rs.tripFlat}/trip` : Number(rs.tripPerMile) > 0 ? `$${rs.tripPerMile}/mi` : '—'} />
                    <RateRow label="Cylinder" value={Number(rs.cylinderRate) > 0 ? `$${rs.cylinderRate}/ea` : '—'} />
                    <RateRow label="Nuclear Gauge" value={Number(rs.nuclearGaugeRate) > 0 ? `$${rs.nuclearGaugeRate}/day` : '—'} />
                    <RateRow label="Density Test" value={Number(rs.densityTestRate) > 0 ? `$${rs.densityTestRate}/test` : '—'} />
                    <RateRow label="Proctor" value={Number(rs.proctorRate) > 0 ? `$${rs.proctorRate}/test` : '—'} />
                    <RateRow label="Atterberg" value={Number(rs.atterbergRate) > 0 ? `$${rs.atterbergRate}/PI` : '—'} />
                    <RateRow label="#200 Wash" value={Number(rs.sieve200Rate) > 0 ? `$${rs.sieve200Rate}/test` : '—'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: 20, borderRadius: 10, border: `2px solid ${color}20`, background: `${color}08` }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function InvoiceCard({ invoice, onApprove, onVoid, onRegenerate, onPush }: {
  invoice: Invoice;
  onApprove: () => void;
  onVoid: () => void;
  onRegenerate: () => void;
  onPush: () => void;
}) {
  const isDraft = invoice.status === 'draft';
  const [expanded, setExpanded] = useState(isDraft);
  const [lines, setLines] = useState<InvoiceLine[]>(invoice.invoiceLines || []);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [descSaving, setDescSaving] = useState(false);

  function startEditLine(line: InvoiceLine) {
    setEditingLineId(line.id);
    setEditDesc(line.description || sourceTypeLabel(line.sourceType));
  }

  async function saveLineDesc(lineId: number) {
    setDescSaving(true);
    try {
      const updated = await updateInvoiceLine(invoice.id, lineId, editDesc.trim());
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, description: updated.description } : l));
      setEditingLineId(null);
    } catch (_) {}
    finally { setDescSaving(false); }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', cursor: 'pointer' }}
        onClick={() => setExpanded(x => !x)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700 }}>Invoice #{invoice.id}</span>
          <StatusBadge status={invoice.status} />
          <span style={{ fontSize: 14, color: '#6b7280' }}>v{invoice.rateSetVersion} rates</span>
          {isDraft && <span style={{ fontSize: 12, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '2px 8px' }}>Draft — descriptions editable</span>}
          {invoice.status === 'pushed' && invoice.qboInvoiceNumber && (
            <span style={{ fontSize: 12, color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
              QB: {invoice.qboInvoiceNumber}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{formatCents(invoice.totalCents)}</span>
          {isDraft && (
            <>
              <button onClick={e => { e.stopPropagation(); onApprove(); }} style={btnPrimary}>Approve</button>
              <button onClick={e => { e.stopPropagation(); onRegenerate(); }} style={btnSecondary}>Regenerate</button>
            </>
          )}
          {invoice.status === 'approved' && (
            <button
              onClick={e => { e.stopPropagation(); onPush(); }}
              style={{ background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Push to QuickBooks
            </button>
          )}
          {(invoice.status === 'draft' || invoice.status === 'approved') && (
            <button onClick={e => { e.stopPropagation(); onVoid(); }} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: '#dc2626', fontSize: 13 }}>Void</button>
          )}
          <span style={{ color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: 16, overflowX: 'auto' }}>
          {invoice.notes && <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{invoice.notes}</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                <th style={{ ...th, textAlign: 'right' }}>Unit Rate</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    {isDraft && editingLineId === line.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLineDesc(line.id); if (e.key === 'Escape') setEditingLineId(null); }}
                          autoFocus
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #2563eb', borderRadius: 4, fontSize: 13 }}
                        />
                        <button onClick={() => saveLineDesc(line.id)} disabled={descSaving}
                          style={{ padding: '4px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {descSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingLineId(null)}
                          style={{ padding: '4px 8px', background: 'none', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          onClick={isDraft ? () => startEditLine(line) : undefined}
                          style={{ cursor: isDraft ? 'pointer' : 'default', borderBottom: isDraft ? '1px dashed #9ca3af' : 'none' }}
                          title={isDraft ? 'Click to edit description' : undefined}
                        >
                          {line.description || sourceTypeLabel(line.sourceType)}
                        </span>
                        {isDraft && (
                          <button onClick={() => startEditLine(line)}
                            style={{ background: '#eff6ff', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#2563eb', padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            ✏️ Edit
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{Number(line.qty).toFixed(2)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{formatCents(line.unitRateCents)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatCents(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                <td colSpan={3} style={{ ...td, textAlign: 'right' }}>Total</td>
                <td style={{ ...td, textAlign: 'right', fontSize: 16 }}>{formatCents(invoice.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 600, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RateField({ label, value, onChange, hint, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 0.01 : undefined}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
      {hint && <small style={{ color: '#9ca3af', fontSize: 11 }}>{hint}</small>}
    </div>
  );
}

function RateRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  marginBottom: 4,
  color: '#374151',
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '7px 16px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  background: 'none',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '7px 14px',
  cursor: 'pointer',
  fontSize: 14,
};

const th: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  borderBottom: '1px solid #e5e7eb',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: '#374151',
  verticalAlign: 'middle',
};
