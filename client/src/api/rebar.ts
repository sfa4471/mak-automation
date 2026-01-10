import api from './api';

export interface RebarReport {
  id?: number;
  taskId: number;
  projectName?: string;
  projectNumber?: string;
  clientName?: string;
  reportDate?: string;
  inspectionDate?: string;
  generalContractor?: string;
  locationDetail?: string;
  wireMeshSpec?: string;
  drawings?: string;
  technicianId?: number;
  techName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const rebarAPI = {
  getByTask: async (taskId: number): Promise<RebarReport> => {
    const response = await api.get<RebarReport>(`/rebar/task/${taskId}`);
    return response.data;
  },

  saveByTask: async (taskId: number, data: RebarReport, updateStatus?: string, assignedTechnicianId?: number): Promise<RebarReport> => {
    const response = await api.post<RebarReport>(`/rebar/task/${taskId}`, {
      ...data,
      updateStatus,
      assignedTechnicianId
    });
    return response.data;
  },
};

