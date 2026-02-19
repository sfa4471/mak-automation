import api from './api';

export interface SoilSpecRow {
  // Density measurement properties for Soil Specs
  densityPct?: string;
  moistureRange?: {
    min?: string;
    max?: string;
  };
}

export interface ConcreteSpecRow {
  // Concrete testing properties for Concrete Specs
  specStrengthPsi?: string;
  ambientTempF?: string;
  concreteTempF?: string;
  slump?: string;
  airContent?: string;
}

export interface SoilSpecs {
  [structureType: string]: SoilSpecRow;
}

export interface ConcreteSpecs {
  [structureType: string]: ConcreteSpecRow;
}

export interface FolderCreationResult {
  success: boolean;
  path: string | null;
  error: string | null;
  warnings: string[];
  onedriveResult?: {
    success: boolean;
    folderPath?: string;
    error?: string;
  } | null;
}

/** Single address block (billing or shipping) */
export interface ProjectAddress {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

/** Customer details and addresses for project information */
export interface CustomerDetails {
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  companyName?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  website?: string;
  nameOnChecks?: string;
  billingAddress?: ProjectAddress;
  shippingAddress?: ProjectAddress;
  shippingSameAsBilling?: boolean;
}

export interface ProjectDrawing {
  filename: string;
  displayName?: string;
}

export interface Project {
  id: number;
  projectNumber: string;
  projectName: string;
  customerEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  customerDetails?: CustomerDetails;
  soilSpecs?: SoilSpecs;
  concreteSpecs?: ConcreteSpecs;
  drawings?: ProjectDrawing[];
  folderCreation?: FolderCreationResult;
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
  projectNumber: string;
  projectName: string;
  customerEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  customerDetails?: CustomerDetails;
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

  retryFolderCreation: async (id: number): Promise<{ success: boolean; folderCreation: FolderCreationResult }> => {
    const response = await api.post<{ success: boolean; folderCreation: FolderCreationResult }>(`/projects/${id}/retry-folder`);
    return response.data;
  },

  uploadDrawings: async (projectId: number, files: File[]): Promise<{ drawings: ProjectDrawing[] }> => {
    const formData = new FormData();
    files.forEach((f) => formData.append('drawings', f));
    const response = await api.post<{ drawings: ProjectDrawing[] }>(`/projects/${projectId}/drawings`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** Fetch drawing PDF as blob (for View/Download with auth). */
  getDrawingBlob: async (projectId: number, filename: string): Promise<Blob> => {
    const response = await api.get(`/projects/${projectId}/drawings/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  deleteDrawing: async (projectId: number, filename: string): Promise<{ drawings: ProjectDrawing[] }> => {
    const response = await api.delete<{ drawings: ProjectDrawing[] }>(
      `/projects/${projectId}/drawings/${encodeURIComponent(filename)}`
    );
    return response.data;
  },
};

