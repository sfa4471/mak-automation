import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tasksAPI, Task } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { proctorAPI } from '../api/proctor';
import ProctorCurveChart, { ProctorPoint, ZAVPoint } from './ProctorCurveChart';
import './ProctorSummary.css';

interface ProctorSummaryData {
  projectName: string;
  projectNumber: string;
  sampledBy: string;
  testMethod: string;
  client: string;
  soilClassification: string;
  maximumDryDensityPcf: string; // Normalized key
  optimumMoisturePercent: string; // Normalized key
  liquidLimitLL: string; // Normalized key
  plasticityIndex: string;
  sampleDate: string;
  calculatedBy: string;
  reviewedBy: string;
  checkedBy: string;
  percentPassing200: string;
  specificGravityG: string; // Normalized key
  proctorPoints: ProctorPoint[];
  zavPoints: ZAVPoint[];
}

const ProctorSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  const [summaryData, setSummaryData] = useState<ProctorSummaryData>({
    projectName: '',
    projectNumber: '',
    sampledBy: 'MAK Lonestar Consulting, LLC',
    testMethod: 'ASTM D698',
    client: '',
    soilClassification: '',
    maximumDryDensityPcf: '',
    optimumMoisturePercent: '',
    liquidLimitLL: '',
    plasticityIndex: '',
    sampleDate: '',
    calculatedBy: '',
    reviewedBy: '',
    checkedBy: '',
    percentPassing200: '',
    specificGravityG: '',
    proctorPoints: [],
    zavPoints: []
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const taskId = parseInt(id!);
      const taskData = await tasksAPI.get(taskId);
      setTask(taskData);
      
      // TODO: Load saved Proctor data from backend
      // For now, load from localStorage or use default values
      // The actual data should come from Page 1 saved data
      
      // Set project info from task (Task has projectNumber and projectName directly)
      const initialData: ProctorSummaryData = {
        projectName: taskData.projectName || '',
        projectNumber: taskData.projectNumber || '',
        sampledBy: 'MAK Lonestar Consulting, LLC',
        testMethod: 'ASTM D698',
        client: '',
        soilClassification: '',
        maximumDryDensityPcf: '',
        optimumMoisturePercent: '',
        liquidLimitLL: '',
        plasticityIndex: '',
        sampleDate: '',
        calculatedBy: '',
        reviewedBy: '',
        checkedBy: '',
        percentPassing200: '',
        specificGravityG: '',
        proctorPoints: [],
        zavPoints: []
      };

      // Load saved Proctor data - try draft first (most complete), then step1 data
      const draftData = localStorage.getItem(`proctor_draft_${taskId}`);
      const step1Data = localStorage.getItem(`proctor_step1_${taskId}`);
      
      let data: any = null;
      
      // Prefer draft data (from Save Draft) as it's more complete
      if (draftData) {
        try {
          data = JSON.parse(draftData);
          console.log('Proctor report doc (from draft):', data);
        } catch (err) {
          console.error('Error parsing draft data:', err);
        }
      }
      
      // Fallback to step1 data (from Next button)
      if (!data && step1Data) {
        try {
          data = JSON.parse(step1Data);
          console.log('Proctor report doc (from step1):', data);
        } catch (err) {
          console.error('Error parsing step1 data:', err);
        }
      }
      
      if (data) {
        // Backward compatibility: Try normalized keys first, then fallback to old keys
        initialData.maximumDryDensityPcf = 
          data.maximumDryDensityPcf ?? data.maxDryDensity ?? data.maximumDensity ?? data.maxDensity ?? '';
        
        initialData.optimumMoisturePercent = 
          data.optimumMoisturePercent ?? data.optimumMoisture ?? data.omc ?? data.optimumMoistureContent ?? '';
        
        initialData.specificGravityG = 
          data.specificGravityG ?? data.specificGravity ?? data.sg ?? data.specificGravityEstimated ?? '';
        
        initialData.liquidLimitLL = 
          data.liquidLimitLL ?? data.liquidLimit ?? data.LL ?? '';
        
        initialData.proctorPoints = data.proctorPoints || [];
        initialData.zavPoints = data.zavPoints || [];
        
        console.log('Proctor points loaded:', initialData.proctorPoints.length);
        console.log('ZAV points loaded:', initialData.zavPoints.length);
        console.log('maximumDryDensityPcf:', initialData.maximumDryDensityPcf);
        console.log('optimumMoisturePercent:', initialData.optimumMoisturePercent);
        console.log('specificGravityG:', initialData.specificGravityG);
        console.log('liquidLimitLL:', initialData.liquidLimitLL);
      } else {
        console.warn('No Proctor data found in localStorage for task:', taskId);
      }

      setSummaryData(initialData);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load task data.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof ProctorSummaryData, value: string) => {
    setSummaryData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    try {
      // TODO: Implement save API call when backend is ready
      // await proctorSummaryAPI.save(task.id, summaryData);
      setTimeout(() => setSaving(false), 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const handleCreatePDF = async () => {
    if (!task) return;
    
    try {
      setSaving(true);
      setError(''); // Clear previous errors
      
      // Prepare report data for PDF generation
      const reportData = {
        projectName: summaryData.projectName,
        projectNumber: summaryData.projectNumber,
        sampledBy: summaryData.sampledBy,
        testMethod: summaryData.testMethod,
        client: summaryData.client,
        soilClassification: summaryData.soilClassification,
        maximumDryDensityPcf: summaryData.maximumDryDensityPcf,
        optimumMoisturePercent: summaryData.optimumMoisturePercent,
        liquidLimitLL: summaryData.liquidLimitLL,
        plasticityIndex: summaryData.plasticityIndex,
        sampleDate: summaryData.sampleDate,
        calculatedBy: summaryData.calculatedBy,
        reviewedBy: summaryData.reviewedBy,
        checkedBy: summaryData.checkedBy,
        percentPassing200: summaryData.percentPassing200,
        specificGravityG: summaryData.specificGravityG,
        proctorPoints: summaryData.proctorPoints || [],
        zavPoints: summaryData.zavPoints || []
      };
      
      // Use same approach as WP1Form - direct fetch (bypassing API helper)
      const token = localStorage.getItem('token');
      const apiUrl = process.env.REACT_APP_API_URL || 'http://192.168.0.20:5000/api';
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      const pdfUrl = `${baseUrl}/api/proctor/${task.id}/pdf`;
      
      console.log('Fetching PDF from:', pdfUrl);
      
      const response = await fetch(pdfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(reportData),
      });

      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'content-disposition': response.headers.get('content-disposition')
      });

      // Step 5: Frontend - open PDF safely
      if (!response.ok) {
        // Non-200 response - show error toast instead of trying to open PDF
        const contentType = response.headers.get('content-type') || '';
        let errorData;
        if (contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          const errorText = await response.text();
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        throw new Error(errorData.error || errorData.details || 'Failed to generate PDF');
      }

      // Backend now returns JSON with save info and PDF as base64
      const contentType = response.headers.get('content-type') || '';
      
      // Check if response is JSON (new format) or PDF (old format)
      if (contentType.includes('application/json')) {
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to generate PDF');
        }
        
        // Show save confirmation
        if (result.saved && result.savedPath) {
          setLastSavedPath(result.savedPath);
          setError(''); // Clear any previous errors
          // Show success message with saved path
          const message = `PDF saved successfully!\n\nLocation: ${result.savedPath}\nFilename: ${result.fileName}`;
          alert(message);
        } else if (result.saveError) {
          setError(`PDF generated but save failed: ${result.saveError}`);
          alert(`PDF generated but save failed: ${result.saveError}\n\nPDF will still be downloaded.`);
        }
        
        // Trigger download from base64
        if (result.pdfBase64) {
          const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const filename = result.fileName || `proctor-report-${task.id}.pdf`;
          
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
        
        setSaving(false);
        return;
      }
      
      // Legacy support: Handle PDF response (if backend still returns PDF directly)
      let blob = await response.blob();
      
      // Extract filename from Content-Disposition header if available
      const contentDisposition = response.headers.get('content-disposition') || '';
      let filename = `proctor-report-${task.id}.pdf`;
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
      
      // Ensure blob has correct PDF MIME type
      if (!blob.type || blob.type === 'application/octet-stream' || !blob.type.includes('pdf')) {
        blob = new Blob([blob], { type: 'application/pdf' });
      }
      
      // Validate blob type
      if (!blob.type.includes('pdf') && !blob.type.includes('octet-stream')) {
        // Might be JSON error - check first bytes
        const arrayBuffer = await blob.slice(0, 10).arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes[0] === 123) { // Starts with {
          const text = await blob.text();
          try {
            const errorData = JSON.parse(text);
            throw new Error(errorData.error || errorData.details || 'Server returned error instead of PDF');
          } catch (e) {
            throw new Error('Invalid response from server');
          }
        }
      }
      
      // Verify it's actually a PDF by checking first 4 bytes
      const firstBytes = await blob.slice(0, 4).arrayBuffer();
      const headerBytes = new Uint8Array(firstBytes);
      const header = String.fromCharCode(headerBytes[0], headerBytes[1], headerBytes[2], headerBytes[3]);
      
      if (header !== '%PDF') {
        const text = await blob.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || errorData.details || 'Server returned error instead of PDF');
        } catch (e) {
          throw new Error('Received invalid PDF file');
        }
      }
      
      // Valid PDF - create blob with explicit PDF MIME type
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      
      // Create download link with explicit filename to force PDF type recognition
      const link = document.createElement('a');
      link.href = url;
      link.download = filename; // Explicitly set filename with .pdf extension
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger download with correct filename
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      setSaving(false);
      
    } catch (err: any) {
      console.error('PDF generation error:', err);
      const errorMessage = err.message || err.response?.data?.error || 'Failed to generate PDF';
      setError(errorMessage);
      alert(`Error generating PDF: ${errorMessage}\n\nCheck the browser console and server logs for details.`);
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="proctor-summary-container">Loading...</div>;
  }

  if (!task) {
    return <div className="proctor-summary-container">Task not found.</div>;
  }

  const isEditable = task.status !== 'APPROVED' && (isAdmin() || (task.assignedTechnicianId === user?.id && task.status !== 'READY_FOR_REVIEW'));

  // Calculate OMC and Max Density values for chart (using normalized keys)
  const omcValue = summaryData.optimumMoisturePercent ? parseFloat(summaryData.optimumMoisturePercent) : undefined;
  const maxDensityValue = summaryData.maximumDryDensityPcf ? parseFloat(summaryData.maximumDryDensityPcf) : undefined;

  return (
    <div className="proctor-summary-container">
      <div className="proctor-summary-header">
        <div className="summary-actions">
          <button 
            type="button" 
            onClick={() => navigate(`/task/${id}/proctor`)} 
            className="btn-secondary"
          >
            Back
          </button>
          {isEditable && (
            <>
              <button 
                type="button" 
                onClick={handleSave} 
                className="btn-primary" 
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button 
                type="button" 
                onClick={handleCreatePDF} 
                className="btn-primary"
              >
                Create PDF
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      
      {lastSavedPath && (
        <div style={{ 
          padding: '10px 15px', 
          backgroundColor: '#d4edda', 
          border: '1px solid #c3e6cb', 
          borderRadius: '4px', 
          marginBottom: '15px',
          color: '#155724'
        }}>
          <strong>✓ PDF Saved Successfully</strong>
          <div style={{ marginTop: '5px', fontSize: '13px', wordBreak: 'break-all' }}>
            <strong>Location:</strong> {lastSavedPath}
          </div>
        </div>
      )}

      <div className="proctor-summary-content">
        {/* Header Section */}
        <div className="summary-page-header">
          <div className="header-logo">
            <img src={encodeURI('/MAK logo_consulting.jpg')} alt="MAK Logo" onError={(e) => {
              // Fallback if logo not found
              console.warn('Logo image not found');
            }} />
          </div>
          <div className="header-address">
            <div>940 N Beltline Road, Suite 107,</div>
            <div>Irving, TX 75061</div>
            <div>P: 214-718-1250</div>
          </div>
        </div>

        {/* Title */}
        <h1 className="summary-title">MOISTURE DENSITY RELATION OF SOILS</h1>

        {/* Form Fields - Two Column Layout */}
        <div className="summary-form-grid">
          <div className="summary-form-column">
            <div className="summary-field-row">
              <label>Project Name:</label>
              <div className="summary-field-value">{summaryData.projectName}</div>
            </div>
            <div className="summary-field-row">
              <label>Project No.:</label>
              <div className="summary-field-value">{summaryData.projectNumber}</div>
            </div>
            <div className="summary-field-row">
              <label>Sampled By:</label>
              <input
                type="text"
                value={summaryData.sampledBy}
                onChange={(e) => handleFieldChange('sampledBy', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Test Method:</label>
              <input
                type="text"
                value={summaryData.testMethod}
                onChange={(e) => handleFieldChange('testMethod', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Client:</label>
              <input
                type="text"
                value={summaryData.client}
                onChange={(e) => handleFieldChange('client', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Soil Classification:</label>
              <input
                type="text"
                value={summaryData.soilClassification}
                onChange={(e) => handleFieldChange('soilClassification', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Maximum Dry Density (pcf):</label>
              <div className="summary-field-value">{summaryData.maximumDryDensityPcf}</div>
            </div>
            <div className="summary-field-row">
              <label>Optimum Moisture (%):</label>
              <div className="summary-field-value">{summaryData.optimumMoisturePercent}</div>
            </div>
            <div className="summary-field-row">
              <label>Liquid Limit (LL):</label>
              <input
                type="text"
                value={summaryData.liquidLimitLL}
                onChange={(e) => handleFieldChange('liquidLimitLL', e.target.value)}
                readOnly={summaryData.liquidLimitLL !== '' || !isEditable}
                className={summaryData.liquidLimitLL !== '' || !isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Plasticity Index (PI):</label>
              <input
                type="text"
                value={summaryData.plasticityIndex}
                onChange={(e) => handleFieldChange('plasticityIndex', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
          </div>

          <div className="summary-form-column">
            <div className="summary-field-row">
              <label>Sample Date:</label>
              <input
                type="date"
                value={summaryData.sampleDate}
                onChange={(e) => handleFieldChange('sampleDate', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Calculated By:</label>
              <input
                type="text"
                value={summaryData.calculatedBy}
                onChange={(e) => handleFieldChange('calculatedBy', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Reviewed By:</label>
              <input
                type="text"
                value={summaryData.reviewedBy}
                onChange={(e) => handleFieldChange('reviewedBy', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Checked By:</label>
              <input
                type="text"
                value={summaryData.checkedBy}
                onChange={(e) => handleFieldChange('checkedBy', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>% Passing #200 Sieve:</label>
              <input
                type="text"
                value={summaryData.percentPassing200}
                onChange={(e) => handleFieldChange('percentPassing200', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Specific Gravity (Estimated):</label>
              <div className="summary-field-value">{summaryData.specificGravityG}</div>
            </div>
          </div>
        </div>

        {/* Proctor Chart */}
        <div className="proctor-chart-container">
          <ProctorCurveChart
            proctorPoints={summaryData.proctorPoints || []}
            zavPoints={summaryData.zavPoints || []}
            omc={omcValue}
            maxDryDensity={maxDensityValue}
          />
        </div>
      </div>
    </div>
  );
};

export default ProctorSummary;


