import api from './api';

export interface SoilSpecRow {
  specStrengthPsi?: string;
  ambientTempF?: string;
  concreteTempF?: string;
  slump?: string;
  airContent?: string;
  // Density measurement properties
  densityPct?: string;
  moistureRange?: {
    min?: string;
    max?: string;
  };
}

export interface ConcreteSpecRow {
  densityPct?: string;
  moistureRange?: {
    min?: string;
    max?: string;
  };
}

export interface SoilSpecs {
  [structureType: string]: SoilSpecRow;
}

export interface ConcreteSpecs {
  [structureType: string]: ConcreteSpecRow;
}

export interface Project {
  id: number;
  projectNumber: string;
  projectName: string;
  customerEmails?: string[];
  soilSpecs?: SoilSpecs;
  concreteSpecs?: ConcreteSpecs;
  // Legacy fields (kept for backward compatibility, but deprecated)
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

export interface CreateProjectRequest {
  projectName: string;
  customerEmails?: string[];
  soilSpecs?: SoilSpecs;
  concreteSpecs?: ConcreteSpecs;
}

export const projectsAPI = {
  create: async (data: CreateProjectRequest): Promise<Project> => {
    const response = await api.post<Project>('/projects', data);
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

