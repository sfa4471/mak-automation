import api from './api';

export interface User {
  id: number;
  email: string;
  role: 'ADMIN' | 'TECHNICIAN';
  name?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const authAPI = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  createTechnician: async (email: string, password: string, name: string): Promise<User> => {
    const response = await api.post<User>('/auth/technicians', { email, password, name });
    return response.data;
  },

  listTechnicians: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/auth/technicians');
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.put('/auth/me/password', { currentPassword, newPassword });
  },

  updateTechnician: async (id: number, data: { email?: string; name?: string; password?: string }): Promise<User> => {
    const response = await api.put<User>(`/auth/technicians/${id}`, data);
    return response.data;
  },

  deleteTechnician: async (id: number): Promise<void> => {
    await api.delete(`/auth/technicians/${id}`);
  },
};

