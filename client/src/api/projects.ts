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
  /** When structure type is "Other", free-text description shown in workflow UIs and reports. */
  otherDetails?: string;
}

export interface ConcreteSpecRow {
  // Concrete testing properties for Concrete Specs
  specStrengthPsi?: string;
  ambientTempF?: string;
  concreteTempF?: string;
  slump?: string;
  airContent?: string;
  /** When structure type is "Other", free-text description shown in workflow UIs and reports. */
  otherDetails?: string;
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

/** Title-case words for structure labels (handles keys like building_pad). */
function formatStructureWords(str: string): string {
  return str
    .replace(/^_+/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Display label for a structure type in dropdowns and read-only specs.
 * When type is "Other" and otherDetails is set, shows only the custom text (e.g. "Highway"), not "Other" or "Other: …".
 */
export function structureTypeDisplayLabel(
  structureType: string,
  otherDetails?: string | null
): string {
  if (!structureType) return '';
  const base = formatStructureWords(structureType);
  const detail = String(otherDetails ?? '').trim();
  if (structureType.trim().toLowerCase() === 'other' && detail) {
    return formatStructureWords(detail);
  }
  return base;
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
  /** Present when PDF is stored in Supabase Storage (server-only path; ignored by UI). */
  storagePath?: string;
}

/** Optional lab-reported proctor line items saved on the project; used to pre-fill Density Proctor Summary. */
export interface PresetProctorRow {
  proctorNo: number | null;
  description?: string;
  optMoisture?: string;
  maxDensity?: string;
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
  /** When true, preset proctor rows are applied to new/empty density Proctor Summary cells for this project. */
  presetProctorsDeclared?: boolean;
  presetProctorRows?: PresetProctorRow[];
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
    const assertPdfBlob = async (blob: Blob, headers: { 'content-type'?: string }): Promise<Blob> => {
      const ctype = String(headers['content-type'] ?? '').toLowerCase();
      if (ctype.includes('application/json')) {
        const text = await blob.text();
        let message = 'Failed to load drawing';
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed?.error) message = parsed.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const probe = await blob.slice(0, Math.min(blob.size, 8)).text();
      if (!probe.startsWith('%PDF')) {
        throw new Error(
          'The drawing could not be loaded (missing file or invalid PDF). If this is a new upload, ask your administrator to verify the server workflow path and disk access.'
        );
      }
      if (!blob.type || blob.type === 'application/octet-stream') {
        return new Blob([blob], { type: 'application/pdf' });
      }
      return blob;
    };

    try {
      const response = await api.get(`/projects/${projectId}/drawings/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
      });
      return assertPdfBlob(response.data as Blob, response.headers as { 'content-type'?: string });
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: unknown; headers?: { 'content-type'?: string } } }).response;
      const body = resp?.data;
      if (body instanceof Blob && body.size > 0 && body.size < 65536) {
        const text = await body.text();
        if (text.trimStart().startsWith('{')) {
          let parsed: { error?: string } = {};
          try {
            parsed = JSON.parse(text) as { error?: string };
          } catch {
            /* ignore */
          }
          if (parsed.error) throw new Error(parsed.error);
        }
      }
      if (e instanceof Error) throw e;
      throw new Error('Failed to load drawing');
    }
  },

  deleteDrawing: async (projectId: number, filename: string): Promise<{ drawings: ProjectDrawing[] }> => {
    const response = await api.delete<{ drawings: ProjectDrawing[] }>(
      `/projects/${projectId}/drawings/${encodeURIComponent(filename)}`
    );
    return response.data;
  },
};

