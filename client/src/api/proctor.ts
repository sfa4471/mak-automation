import api from './api';

export interface ProctorReportData {
  projectName: string;
  projectNumber: string;
  sampledBy: string;
  testMethod: string;
  client: string;
  soilClassification: string;
  // Canonical fields (preferred)
  optMoisturePct?: number | null;
  maxDryDensityPcf?: number | null;
  // Legacy fields (for backward compatibility)
  maximumDryDensityPcf?: string;
  optimumMoisturePercent?: string;
  liquidLimitLL: string;
  plasticLimit?: string; // Plastic Limit for PI calculation
  plasticityIndex: string;
  sampleDate: string;
  calculatedBy: string;
  reviewedBy: string;
  checkedBy: string;
  percentPassing200: string;
  passing200?: Array<{
    dishNo: number;
    dryWtBeforeWash: string;
    dryWtAfterWash: string;
    tareWeight: string;
    passing200Pct: string;
  }>;
  passing200SummaryPct?: string; // Summary from Page 1 (average of valid rows)
  specificGravityG: string;
  proctorPoints: Array<{ x: number; y: number }>;
  zavPoints: Array<{ x: number; y: number }>;
}

export const proctorAPI = {
  getByTask: async (taskId: number): Promise<ProctorReportData> => {
    const response = await api.get<ProctorReportData>(`/proctor/task/${taskId}`);
    return response.data;
  },

  saveByTask: async (taskId: number, reportData: ProctorReportData): Promise<ProctorReportData> => {
    const response = await api.post<ProctorReportData>(`/proctor/task/${taskId}`, reportData);
    return response.data;
  },

  getByProjectAndProctorNo: async (projectId: number, proctorNo: number): Promise<{ proctorNo: number; optMoisturePct: number; maxDryDensityPcf: number; soilClassification?: string | null; soilClassificationText?: string | null }> => {
    const response = await api.get<{ proctorNo: number; optMoisturePct: number; maxDryDensityPcf: number; soilClassification?: string | null; soilClassificationText?: string | null }>(`/proctor/project/${projectId}/proctor/${proctorNo}`);
    return response.data;
  },

  generatePDF: async (taskId: number, reportData: ProctorReportData): Promise<Blob> => {
    try {
      const token = localStorage.getItem('token');
      // Get base URL - REACT_APP_API_URL already includes /api, so we need to extract base
      const apiUrl = process.env.REACT_APP_API_URL || 'http://192.168.4.24:5000/api';
      // Extract base URL (remove /api suffix if present)
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      
      const pdfUrl = `${baseUrl}/api/proctor/${taskId}/pdf`;
      
      console.log('Starting PDF generation request to:', pdfUrl);
      
      const response = await fetch(pdfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(reportData),
      });

      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        ok: response.ok
      });

      // Check for error status
      if (!response.ok) {
        // Try to parse error from response
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to generate PDF (${response.status})`);
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `Failed to generate PDF (status: ${response.status})`);
        }
      }

      // Get blob from response
      const blob = await response.blob();
      
      // Validate blob has content
      if (!blob || blob.size === 0) {
        throw new Error('Received empty PDF file');
      }
      
      // Check content-type header
      const contentType = response.headers.get('content-type') || '';
      console.log('Blob received:', { 
        size: blob.size, 
        type: blob.type,
        contentType: contentType
      });
      
      // If response is JSON (error), parse it
      if (contentType.includes('application/json')) {
        const text = await blob.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || 'Failed to generate PDF');
        } catch (parseError) {
          throw new Error('Failed to generate PDF');
        }
      }
      
      // Return the blob - fetch already creates it with correct type
      return blob;
    } catch (error: any) {
      console.error('Error in generatePDF:', error);
      
      // If it's already an Error object, rethrow it
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error(error.message || 'Failed to generate PDF');
    }
  }
};

