import api from './api';

export type WorkPackageStatus = 'Draft' | 'Assigned' | 'In Progress' | 'Submitted' | 'Approved' | 'IN_PROGRESS_TECH' | 'READY_FOR_REVIEW';

export interface WorkPackage {
  id: number;
  projectId: number;
  name: string;
  type: string;
  status: WorkPackageStatus;
  assignedTo?: number;
  assignedTechnicianName?: string;
  assignedTechnicianEmail?: string;
  createdAt: string;
  projectName?: string;
  projectNumber?: string;
  projectSpec?: string;
}

export interface Cylinder {
  cylinderNumber: number;
  age?: string;
  dateTested?: string;
  avgLength?: string;
  avgWidth?: string;
  avgDiameter?: string;
  crossSectionalArea?: string;
  totalLoad?: number;
  compressiveStrength?: number;
  fractureType?: string;
  specimenNo?: string;
  specimenQty?: string;
  specimenType?: string;
}

export interface SpecimenSet {
  setId: number;
  cylinders: Cylinder[];
}

export interface WP1Data {
  id?: number;
  workPackageId?: number;
  taskId?: number;
  assignedTechnicianId?: number;
  updateStatus?: string;
  technician?: string;
  weather?: string;
  placementDate?: string;
  specStrength?: string;
  specStrengthDays?: number;
  structure?: string;
  sampleLocation?: string;
  supplier?: string;
  timeBatched?: string;
  classMixId?: string;
  timeSampled?: string;
  yardsBatched?: string;
  ambientTempMeasured?: string;
  ambientTempSpecs?: string;
  truckNo?: string;
  ticketNo?: string;
  concreteTempMeasured?: string;
  concreteTempSpecs?: string;
  plant?: string;
  slumpMeasured?: string;
  slumpSpecs?: string;
  yardsPlaced?: string;
  totalYards?: string;
  airContentMeasured?: string;
  airContentSpecs?: string;
  waterAdded?: string;
  unitWeight?: string;
  finalCureMethod?: string;
  specimenNo?: string;
  specimenQty?: string;
  specimenType?: string;
  cylinders: Cylinder[];
  remarks?: string;
}

export const workPackagesAPI = {
  getByProject: async (projectId: number): Promise<WorkPackage[]> => {
    const response = await api.get<WorkPackage[]>(`/workpackages/project/${projectId}`);
    return response.data;
  },

  get: async (id: number): Promise<WorkPackage> => {
    const response = await api.get<WorkPackage>(`/workpackages/${id}`);
    return response.data;
  },

  assign: async (id: number, technicianId: number): Promise<WorkPackage> => {
    const response = await api.put<WorkPackage>(`/workpackages/${id}/assign`, { technicianId });
    return response.data;
  },

  updateStatus: async (id: number, status: WorkPackageStatus): Promise<WorkPackage> => {
    const response = await api.put<WorkPackage>(`/workpackages/${id}/status`, { status });
    return response.data;
  },

  getWP1: async (id: number): Promise<WP1Data> => {
    const response = await api.get<WP1Data>(`/workpackages/${id}/wp1`);
    return response.data;
  },

  saveWP1: async (id: number, data: WP1Data, updateStatus?: WorkPackageStatus): Promise<WP1Data> => {
    const payload = updateStatus ? { ...data, updateStatus } : data;
    const response = await api.post<WP1Data>(`/workpackages/${id}/wp1`, payload);
    return response.data;
  },
};

