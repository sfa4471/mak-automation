import api from './api';

export type GaugeModel = 'Troxler 3430' | 'Troxler 3440' | 'CPN MC-3' | 'Instrotek 3500';

export const GAUGE_MODELS: GaugeModel[] = [
  'Troxler 3430',
  'Troxler 3440',
  'CPN MC-3',
  'Instrotek 3500',
];

export interface NuclearGauge {
  id: number;
  tenantId: number;
  serialNumber: string;
  model: GaugeModel;
  nickname: string | null;
  active: boolean;
  createdAt: string;
  status?: 'in_lab' | 'in_field';
  currentCheckout?: GaugeCheckout | null;
}

export interface GaugeCheckout {
  id: number;
  gaugeId: number;
  technicianId: number | null;
  technicianName: string | null;
  projectId: number | null;
  projectName: string | null;
  destination: string;
  timeOut: string;
  timeIn: string | null;
  blockClosed: boolean | null;
  chd: string | null;
  notes: string | null;
  logDate: string;
  users?: { name: string };
}

export interface CheckoutPayload {
  destination: string;
  blockClosed: boolean | null;
  technicianName?: string;
  projectId?: number | null;
  projectName?: string | null;
  chd?: string;
  notes?: string;
}

export interface LogResponse {
  gauge: NuclearGauge;
  month: number;
  year: number;
  entries: GaugeCheckout[];
}

export interface AllLogResponse {
  month: number;
  year: number;
  entries: (GaugeCheckout & { nuclear_gauges: { serialNumber: string; model: string; nickname: string | null } })[];
}

const gaugesApi = {
  list: () =>
    api.get<NuclearGauge[]>('/gauges').then((r) => r.data),

  getStatus: (gaugeId: number) =>
    api.get<{ gauge: NuclearGauge; status: string; currentCheckout: GaugeCheckout | null }>(
      `/gauges/${gaugeId}/status`
    ).then((r) => r.data),

  create: (payload: { serialNumber: string; model: string; nickname?: string }) =>
    api.post<NuclearGauge>('/gauges', payload).then((r) => r.data),

  update: (gaugeId: number, payload: Partial<{ serialNumber: string; model: string; nickname: string; active: boolean }>) =>
    api.put<NuclearGauge>(`/gauges/${gaugeId}`, payload).then((r) => r.data),

  deactivate: (gaugeId: number) =>
    api.delete(`/gauges/${gaugeId}`).then((r) => r.data),

  permanentDelete: (gaugeId: number) =>
    api.delete(`/gauges/${gaugeId}/permanent`).then((r) => r.data),

  downloadQr: (gaugeId: number) =>
    api
      .get(`/gauges/${gaugeId}/qr`, { responseType: 'text' })
      .then((r) => {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(r.data);
          win.document.close();
        }
      }),

  checkout: (gaugeId: number, payload: CheckoutPayload) =>
    api.post<GaugeCheckout>(`/gauges/${gaugeId}/checkout`, payload).then((r) => r.data),

  checkin: (gaugeId: number, payload?: { notes?: string; chd?: string }) =>
    api.post<GaugeCheckout>(`/gauges/${gaugeId}/checkin`, payload || {}).then((r) => r.data),

  getLog: (gaugeId: number, month: number, year: number) =>
    api.get<LogResponse>(`/gauges/${gaugeId}/log`, { params: { month, year } }).then((r) => r.data),

  getAllLog: (month: number, year: number) =>
    api.get<AllLogResponse>('/gauges/log/all', { params: { month, year } }).then((r) => r.data),

  manualLogEntry: (payload: {
    gaugeId: number;
    date: string;
    timeOut: string;
    timeIn?: string;
    blockClosed: boolean;
    destination: string;
    technicianId?: number;
    projectName?: string;
    chd?: string;
    notes?: string;
  }) => api.post<GaugeCheckout>('/gauges/log/manual', payload).then((r) => r.data),

  listTechnicians: () =>
    api.get<{ id: number; name: string }[]>('/auth/technicians').then((r) => r.data),

  updateLogEntry: (entryId: number, payload: {
    date?: string;
    timeOut?: string;
    timeIn?: string;
    blockClosed?: boolean | null;
    destination?: string;
    technicianId?: number | null;
    technicianName?: string;
    projectName?: string;
    chd?: string;
    notes?: string;
  }) => api.put<GaugeCheckout>(`/gauges/log/${entryId}`, payload).then((r) => r.data),
};

export default gaugesApi;
