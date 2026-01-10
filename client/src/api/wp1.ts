import api from './api';
import { WP1Data } from './workpackages';

export const wp1API = {
  getByTask: async (taskId: number): Promise<WP1Data> => {
    const response = await api.get<WP1Data>(`/wp1/task/${taskId}`);
    return response.data;
  },

  saveByTask: async (taskId: number, data: WP1Data & { updateStatus?: string; assignedTechnicianId?: number }): Promise<WP1Data> => {
    const response = await api.post<WP1Data>(`/wp1/task/${taskId}`, data);
    return response.data;
  },
};

