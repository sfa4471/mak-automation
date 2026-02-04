import api from './api';
import { ConcreteSpecs, SoilSpecs } from './projects';

export interface TestRow {
  testNo: number;
  testLocation: string;
  depthLiftType: 'DEPTH' | 'LIFT';
  depthLiftValue: string;
  wetDensity: string;
  fieldMoisture: string;
  dryDensity: string; // Auto-calculated
  proctorNo: string;
  percentProctorDensity: string; // Auto-calculated
}

export interface ProctorRow {
  proctorNo: number;
  description: string;
  optMoisture: string;
  maxDensity: string;
}

export interface DensityReport {
  id?: number;
  taskId: number;
  projectName?: string;
  projectNumber?: string;
  projectConcreteSpecs?: ConcreteSpecs;
  projectSoilSpecs?: SoilSpecs;
  clientName: string;
  datePerformed: string;
  structure: string;
  structureType?: string;
  testRows: TestRow[];
  proctors: ProctorRow[];
  densSpecPercent: string;
  moistSpecMin: string;
  moistSpecMax: string;
  gaugeNo: string;
  stdDensityCount: string;
  stdMoistCount: string;
  transDepthIn: string;
  methodD2922: boolean;
  methodD3017: boolean;
  methodD698: boolean;
  remarks: string;
  techName: string;
  technicianId?: number; // Preferred: store technician ID
  timeStr: string;
  lastEditedByRole?: string;
  lastEditedByName?: string;
  lastEditedByUserId?: number;
  updatedAt?: string;
  specDensityPct?: string;
  proctorTaskId?: number;
  proctorOptMoisture?: string;
  proctorMaxDensity?: string;
  proctorSoilClassification?: string;
  proctorSoilClassificationText?: string;
  proctorDescriptionLabel?: string;
}

export const densityAPI = {
  getByTask: async (taskId: number): Promise<DensityReport> => {
    const response = await api.get<DensityReport>(`/density/task/${taskId}`);
    return response.data;
  },

  saveByTask: async (
    taskId: number,
    data: DensityReport,
    updateStatus?: string,
    assignedTechnicianId?: number
  ): Promise<DensityReport> => {
    const payload = { ...data, updateStatus, assignedTechnicianId };
    
    // Debug: Log what's being sent
    console.log('API saveByTask - Header fields in payload:', {
      clientName: payload.clientName,
      datePerformed: payload.datePerformed,
      structure: payload.structure,
      structureType: payload.structureType
    });
    
    const response = await api.post<DensityReport>(`/density/task/${taskId}`, payload);
    
    // Debug: Log what's returned
    console.log('API saveByTask - Header fields in response:', {
      clientName: response.data.clientName,
      datePerformed: response.data.datePerformed,
      structure: response.data.structure,
      structureType: response.data.structureType
    });
    
    return response.data;
  },
};

