import api from './api';

/** Single moisture range (min–max). */
export interface MoistureRange {
  min?: string;
  max?: string;
}

export interface SoilSpecRow {
  // Density measurement properties for Soil Specs (legacy: single value)
  densityPct?: string;
  /** Multiple density values per structure type. Normalize from densityPct when only legacy present. */
  densityPcts?: string[];
  // Moisture range (legacy: single range)
  moistureRange?: MoistureRange;
  /** Multiple moisture ranges per structure type. Normalize from moistureRange when only legacy present. */
  moistureRanges?: MoistureRange[];
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

/** Normalize a soil spec row to array form (densityPcts, moistureRanges). Legacy single values become one-element arrays. */
export function normalizeSoilSpecRow(spec: SoilSpecRow | undefined): SoilSpecRow {
  if (!spec) return { densityPcts: [''], moistureRanges: [{ min: '', max: '' }] };
  const densityPcts =
    spec.densityPcts && spec.densityPcts.length > 0
      ? [...spec.densityPcts]
      : spec.densityPct !== undefined && spec.densityPct !== null && String(spec.densityPct).trim() !== ''
        ? [String(spec.densityPct)]
        : [''];
  const moistureRanges =
    spec.moistureRanges && spec.moistureRanges.length > 0
      ? spec.moistureRanges.map(r => ({ ...r }))
      : spec.moistureRange && (spec.moistureRange.min !== undefined || spec.moistureRange.max !== undefined)
        ? [{ min: spec.moistureRange.min ?? '', max: spec.moistureRange.max ?? '' }]
        : [{ min: '', max: '' }];
  return {
    ...spec,
    densityPcts,
    moistureRanges,
    ...(spec.densityPct !== undefined && { densityPct: spec.densityPct }),
    ...(spec.moistureRange && { moistureRange: spec.moistureRange })
  };
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
  clientName?: string;
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
  /** Optional; server auto-generates when not provided (e.g. from tenant counter). */
  projectNumber?: string;
  projectName: string;
  clientName?: string;
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

