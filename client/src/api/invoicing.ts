import api from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BillingCadence = 'per_workorder' | 'monthly' | 'on_completion' | 'manual';
export type WorkorderStatus = 'open' | 'complete' | 'approved' | 'could_not_access';
export type BillingStatus  = 'unbilled' | 'claimed' | 'billed';
export type DispatchStatus = 'scheduled' | 'in_progress' | 'complete';
export type InvoiceStatus  = 'draft' | 'approved' | 'pushed' | 'void';

export type InvoiceLineSourceType =
  | 'cylinder' | 'tech_time' | 'tech_ot' | 'trip'
  | 'proctor'  | 'atterberg' | 'sieve200'
  | 'nuclear_day' | 'density_test';

export interface RateSet {
  id: number;
  tenantId: number;
  projectId: number;
  version: number;
  effectiveDate: string;
  technicianRate: number;
  technicianOtRate: number;
  tripFlat: number;
  tripPerMile: number;
  cylinderRate: number;
  nuclearGaugeRate: number;
  densityTestRate: number;
  proctorRate: number;
  atterbergRate: number;
  sieve200Rate: number;
  createdAt: string;
}

export interface RateSetInput {
  projectId: number;
  effectiveDate?: string;
  technicianRate: number;
  technicianOtRate: number;
  tripFlat: number;
  tripPerMile: number;
  cylinderRate: number;
  nuclearGaugeRate: number;
  densityTestRate: number;
  proctorRate: number;
  atterbergRate: number;
  sieve200Rate: number;
}

export interface Workorder {
  id: number;
  tenantId: number;
  projectId: number;
  workorderNumber: string;
  description?: string;
  status: WorkorderStatus;
  billingStatus: BillingStatus;
  invoicedOnInvoiceId?: number;
  assignedTechnicianId?: number;
  assignedTechnicianName?: string;
  scheduledDate?: string;
  scheduledTime?: string | null;
  siteLocation?: string;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes: number;
  miles?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkorderWithTasks extends Workorder {
  tasks: Array<{
    id: number;
    taskType: string;
    status: string;
    projectId: number;
    projectNumber: string;
    projectName: string;
    locationName?: string;
    engagementNotes?: string;
  }>;
}

export interface Dispatch {
  id: number;
  tenantId: number;
  projectId: number;
  workorderId: number;
  technicianId: number;
  dispatchDate: string;
  siteLocation?: string;
  clockIn?: string;
  clockOut?: string;
  breakMinutes: number;
  miles: number;
  status: DispatchStatus;
  users?: { name: string; email: string };
  tasks?: Array<{ id: number; taskType: string; status: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: number;
  invoiceId: number;
  sourceType: InvoiceLineSourceType;
  sourceRefId?: number;
  description?: string;
  qty: number;
  unitRateCents: number;
  amountCents: number;
  createdAt: string;
}

export interface Invoice {
  id: number;
  tenantId: number;
  projectId: number;
  workorderId?: number;
  status: InvoiceStatus;
  rateSetVersion: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  generatedAt?: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  idempotencyKey?: string;
  notes?: string;
  invoiceLines?: InvoiceLine[];
  qboInvoiceId?: string;
  qboInvoiceNumber?: string;
  pushedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialSummary {
  billedCents: number;
  wipCents: number;
  rateSetVersion?: number;
  unbilledWorkorders: Workorder[];
  wipLines: InvoiceLine[];
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Rate Sets
// ---------------------------------------------------------------------------

export async function getRateSets(projectId: number): Promise<RateSet[]> {
  const { data } = await api.get('/rate-sets', { params: { projectId } });
  return data;
}

export async function getCurrentRateSet(projectId: number): Promise<RateSet | null> {
  const { data } = await api.get('/rate-sets/current', { params: { projectId } });
  return data;
}

export async function createRateSet(input: RateSetInput): Promise<RateSet> {
  const { data } = await api.post('/rate-sets', input);
  return data;
}

// ---------------------------------------------------------------------------
// Workorders
// ---------------------------------------------------------------------------

export async function getWorkorders(projectId: number): Promise<Workorder[]> {
  const { data } = await api.get('/workorders', { params: { projectId } });
  return data;
}

export async function getWorkorder(id: number): Promise<Workorder> {
  const { data } = await api.get(`/workorders/${id}`);
  return data;
}

export async function createWorkorder(payload: {
  projectId: number;
  workorderNumber: string;
  description?: string;
  assignedTechnicianId?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  siteLocation?: string;
}): Promise<Workorder> {
  const { data } = await api.post('/workorders', payload);
  return data;
}

export async function updateWorkorder(id: number, payload: {
  workorderNumber?: string;
  description?: string;
  status?: WorkorderStatus;
  assignedTechnicianId?: number;
  scheduledDate?: string;
  siteLocation?: string;
  clockIn?: string | null;
  clockOut?: string | null;
  breakMinutes?: number;
  miles?: number;
}): Promise<Workorder> {
  const { data } = await api.put(`/workorders/${id}`, payload);
  return data;
}

export async function deleteWorkorder(id: number): Promise<void> {
  await api.delete(`/workorders/${id}`);
}

export async function clockInWorkorder(id: number): Promise<Workorder> {
  const { data } = await api.post(`/workorders/${id}/clock-in`);
  return data;
}

export async function clockOutWorkorder(id: number, payload: { breakMinutes: number; miles: number }): Promise<Workorder> {
  const { data } = await api.post(`/workorders/${id}/clock-out`, payload);
  return data;
}

export async function couldNotAccessWorkorder(id: number): Promise<Workorder> {
  const { data } = await api.post(`/workorders/${id}/could-not-access`);
  return data;
}

export async function getMySchedule(): Promise<{ workorders: WorkorderWithTasks[] }> {
  const { data } = await api.get('/workorders/my-schedule');
  return data;
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

export async function getDispatches(workorderId: number): Promise<Dispatch[]> {
  const { data } = await api.get('/dispatches', { params: { workorderId } });
  return data;
}

export async function getProjectDispatches(projectId: number): Promise<Dispatch[]> {
  const { data } = await api.get(`/dispatches/project/${projectId}`);
  return data;
}

export async function createDispatch(payload: {
  workorderId: number;
  technicianId: number;
  dispatchDate: string;
  siteLocation?: string;
  clockIn?: string;
  clockOut?: string;
  breakMinutes?: number;
  miles?: number;
}): Promise<Dispatch> {
  const { data } = await api.post('/dispatches', payload);
  return data;
}

export async function updateDispatch(id: number, payload: Partial<{
  siteLocation: string;
  clockIn: string | null;
  clockOut: string | null;
  breakMinutes: number;
  miles: number;
  status: DispatchStatus;
  technicianId: number;
  dispatchDate: string;
}>): Promise<Dispatch> {
  const { data } = await api.put(`/dispatches/${id}`, payload);
  return data;
}

export async function deleteDispatch(id: number): Promise<void> {
  await api.delete(`/dispatches/${id}`);
}

export async function linkTaskToDispatch(dispatchId: number, taskId: number): Promise<void> {
  await api.post(`/dispatches/${dispatchId}/link-task`, { taskId });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function getInvoices(projectId: number): Promise<Invoice[]> {
  const { data } = await api.get('/invoices', { params: { projectId } });
  return data;
}

export async function getInvoice(id: number): Promise<Invoice> {
  const { data } = await api.get(`/invoices/${id}`);
  return data;
}

export interface InvoicePreview {
  lines: InvoiceLine[];
  subtotalCents: number;
  rateSetVersion: number;
  warnings: string[];
}

export async function previewInvoice(payload: {
  projectId: number;
  workorderIds: number[];
}): Promise<InvoicePreview> {
  const { data } = await api.post('/invoices/preview', payload);
  return data;
}

export async function generateInvoice(payload: {
  projectId: number;
  workorderIds: number[];
  notes?: string;
}): Promise<{ invoice: Invoice; warnings: string[] }> {
  const { data } = await api.post('/invoices/generate', payload);
  return data;
}

export async function approveInvoice(id: number): Promise<Invoice> {
  const { data } = await api.post(`/invoices/${id}/approve`);
  return data;
}

export async function voidInvoice(id: number): Promise<Invoice> {
  const { data } = await api.post(`/invoices/${id}/void`);
  return data;
}

export async function regenerateInvoice(id: number): Promise<{ invoice: Invoice; warnings: string[] }> {
  const { data } = await api.post(`/invoices/${id}/regenerate`);
  return data;
}

export async function updateInvoiceLine(invoiceId: number, lineId: number, description: string): Promise<InvoiceLine> {
  const { data } = await api.patch(`/invoices/${invoiceId}/lines/${lineId}`, { description });
  return data;
}

// ---------------------------------------------------------------------------
// Financials dashboard
// ---------------------------------------------------------------------------

export async function getProjectFinancials(projectId: number): Promise<FinancialSummary> {
  const { data } = await api.get(`/invoices/financials/${projectId}`);
  return data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function sourceTypeLabel(type: InvoiceLineSourceType): string {
  const map: Record<InvoiceLineSourceType, string> = {
    cylinder:     'Cylinder Breaks',
    tech_time:    'Technician Time',
    tech_ot:      'Technician OT',
    trip:         'Trip Charge',
    proctor:      'Proctor Test',
    atterberg:    'Atterberg Limits (PI)',
    sieve200:     '#200 Sieve Wash',
    nuclear_day:  'Nuclear Gauge Day',
    density_test: 'Density Tests',
  };
  return map[type] || type;
}
