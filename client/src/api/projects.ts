import api from './api';

export interface Project {
  id: number;
  projectNumber: string;
  projectName: string;
  projectSpec?: string;
  customerEmail?: string;
  specStrengthPsi?: string;
  specAmbientTempF?: string;
  specConcreteTempF?: string;
  specSlump?: string;
  specAirContentByVolume?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectSpecs {
  specStrengthPsi?: string;
  specAmbientTempF?: string;
  specConcreteTempF?: string;
  specSlump?: string;
  specAirContentByVolume?: string;
}

export const projectsAPI = {
  create: async (
    projectName: string, 
    specs?: ProjectSpecs,
    customerEmail?: string
  ): Promise<Project> => {
    const response = await api.post<Project>('/projects', { 
      projectName, 
      customerEmail,
      ...specs
    });
    return response.data;
  },

  list: async (): Promise<Project[]> => {
    const response = await api.get<Project[]>('/projects');
    return response.data;
  },

  get: async (id: number): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${id}`);
    return response.data;
  },

  update: async (id: number, data: Partial<Project>): Promise<Project> => {
    const response = await api.put<Project>(`/projects/${id}`, data);
    return response.data;
  },
};

