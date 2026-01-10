import api from './api';

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
  clientName: string;
  datePerformed: string;
  structure: string;
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
    const response = await api.post<DensityReport>(`/density/task/${taskId}`, payload);
    return response.data;
  },
};

