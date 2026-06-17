import api from './api';

export interface DensityLogRow {
  reportDate: string | null;
  taskId: number;
  workorderNumber: string | null;
  structure: string | null;
  testLocation: string | null;
  depthLiftValue: string | null;
  dryDensity: number;
  fieldMoisture: number | null;
  proctorNo: number | null;
  pctCompaction: number | null;
  specDensityPct: number | null;
  moistSpecMin: number | null;
  moistSpecMax: number | null;
  pass: boolean | null;
}

export interface ProctorIndexRow {
  proctorNo: number | null;
  soilClassification: string | null;
  maxDryDensityPcf: number | null;
  optMoisturePct: number | null;
}

export interface CylinderScheduleRow {
  taskId: number;
  workorderNumber: string | null;
  pourDate: string | null;
  structure: string | null;
  sampleLocation: string | null;
  specStrength: number | null;
  specStrengthDays: number;
  cylinderLabel: string | number | null;
  ageDays: number | null;
  breakStrength: number | null;
  isComplianceBreak: boolean;
  belowSpec: boolean | null;
}

export interface ProjectSummaryData {
  densityLog: DensityLogRow[];
  proctorIndex: ProctorIndexRow[];
  cylinderSchedule: CylinderScheduleRow[];
}

export const summaryAPI = {
  getProjectSummary: async (projectId: number): Promise<ProjectSummaryData> => {
    const response = await api.get<ProjectSummaryData>(`/projects/${projectId}/summary`);
    return response.data;
  }
};
