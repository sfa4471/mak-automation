import api from './api';

export type DraftStatus = 'pending_review' | 'accepted' | 'rejected';

export interface SpecConflict {
  structureType: string;
  field: string;
  values: string[];
}

export interface DraftWorkorder {
  id: number;
  tenant_id: number;
  status: DraftStatus;
  raw_source?: string;
  source_type?: string;
  parsed_project_id?: number | null;
  parsed_project_name_raw?: string | null;
  parsed_scheduled_date?: string | null;
  parsed_test_types?: string[];
  parsed_site_location?: string | null;
  parsed_requester_email?: string | null;
  extraction_json?: Record<string, unknown> | null;
  project_match_score?: number | null;
  parsed_soil_specs?: Record<string, unknown> | null;
  parsed_concrete_specs?: Record<string, unknown> | null;
  spec_extraction_json?: {
    confidence?: { soilSpecs?: string; concreteSpecs?: string };
    docTypes?: string[];
    conflicts?: SpecConflict[];
  } | null;
  attached_doc_types?: string[];
  spec_conflicts?: SpecConflict[] | null;
  created_workorder_id?: number | null;
  specs_applied?: boolean;
  created_at: string;
}

export interface AcceptDraftResponse {
  ok: boolean;
  workorderId: number;
  workorderNumber: string;
  specsApplied: boolean;
}

export interface OutcomeStats {
  total: number;
  matched: number;
  matchRate: number;
  dormant: boolean;
  minSamples: number;
}

export interface CalibrationStats {
  total: number;
  accepted: number;
  rejected: number;
  pendingReview: number;
  autoAccepted: number;
  humanReviewed: number;
  projectMatchAccuracy: number | null;
  dateMatchAccuracy: number | null;
  avgMatchScore: number | null;
  // Phase 8
  correctionRate: number | null;
  circuitBreakerActive: boolean;
  // Phase 9
  outcomeStats: OutcomeStats | null;
}

export const intakeAPI = {
  listDrafts: async (): Promise<DraftWorkorder[]> => {
    const res = await api.get<DraftWorkorder[]>('/intake/drafts');
    return res.data;
  },

  updateDraft: async (id: number, updates: Partial<DraftWorkorder>): Promise<DraftWorkorder> => {
    const res = await api.put<DraftWorkorder>(`/intake/drafts/${id}`, updates);
    return res.data;
  },

  acceptDraft: async (id: number, applySpecs: boolean): Promise<AcceptDraftResponse> => {
    const res = await api.post<AcceptDraftResponse>(`/intake/drafts/${id}/accept`, { applySpecs });
    return res.data;
  },

  rejectDraft: async (id: number): Promise<void> => {
    await api.post(`/intake/drafts/${id}/reject`);
  },

  getCalibration: async (): Promise<CalibrationStats> => {
    const res = await api.get<CalibrationStats>('/intake/calibration');
    return res.data;
  },
};
