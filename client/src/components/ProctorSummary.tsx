import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tasksAPI, Task } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { proctorAPI } from '../api/proctor';
import { tenantsAPI, TenantMe } from '../api/tenants';
import ProctorCurveChart, { ProctorPoint, ZAVPoint } from './ProctorCurveChart';
import ProjectHomeButton from './ProjectHomeButton';
import { getCurrentApiBaseUrl, getApiPathPrefix } from '../api/api';
import './ProctorSummary.css';

const DEFAULT_LOGO = '/MAK logo_consulting.jpg';
const DEFAULT_SAMPLED_BY = 'MAK Lonestar Consulting, LLC';

function formatTenantAddress(t: TenantMe | null): string[] {
  if (!t) return [];
  const lines: string[] = [];
  if (t.companyAddress) lines.push(t.companyAddress);
  const cityStateZip = [t.companyCity, t.companyState, t.companyZip].filter(Boolean).join(', ');
  if (cityStateZip) lines.push(cityStateZip);
  if (t.companyPhone) lines.push(`P: ${t.companyPhone}`);
  return lines;
}

interface ProctorSummaryData {
  projectName: string;
  projectNumber: string;
  sampledBy: string;
  testMethod: string;
  client: string;
  soilClassification: string;
  maximumDryDensityPcf: string; // Normalized key
  optimumMoisturePercent: string; // Normalized key
  correctedDryDensityPcf: string; // Corrected value if correction factor applied
  correctedMoistureContentPercent: string; // Corrected value if correction factor applied
  liquidLimitLL: string; // Normalized key
  plasticLimit: string; // Plastic Limit for PI calculation
  plasticityIndex: string; // Auto-calculated: rounded LL - rounded PL
  sampleDate: string;
  calculatedBy: string;
  reviewedBy: string;
  checkedBy: string;
  percentPassing200: string; // Legacy field - kept for backward compatibility
  passing200SummaryPct: string; // Summary from Page 1 (average of valid rows)
  specificGravityG: string; // Normalized key
  proctorPoints: ProctorPoint[];
  zavPoints: ZAVPoint[];
}

const ProctorSummary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pdfSaveNotice, setPdfSaveNotice] = useState('');
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const lastSavedDataRef = useRef<string>('');

  const [summaryData, setSummaryData] = useState<ProctorSummaryData>({
    projectName: '',
    projectNumber: '',
    sampledBy: DEFAULT_SAMPLED_BY,
    testMethod: 'ASTM D698',
    client: '',
    soilClassification: '',
    maximumDryDensityPcf: '',
    optimumMoisturePercent: '',
    correctedDryDensityPcf: '',
    correctedMoistureContentPercent: '',
    liquidLimitLL: '',
    plasticLimit: '',
    plasticityIndex: '',
    sampleDate: '',
    calculatedBy: '',
    reviewedBy: '',
    checkedBy: '',
    percentPassing200: '',
    passing200SummaryPct: '',
    specificGravityG: '',
    proctorPoints: [],
    zavPoints: []
  });

  // Round a value to nearest whole number
  const roundToWholeNumber = useCallback((value: string): string => {
    if (!value || value.trim() === '') {
      return '';
    }
    const trimmed = value.trim();
    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      return trimmed; // Return original if invalid
    }
    const rounded = Math.round(num);
    console.log('roundToWholeNumber:', { input: trimmed, parsed: num, rounded });
    return String(rounded);
  }, []);


  // Calculate Plasticity Index (PI) with rounding
  // PI = rounded(LL) - rounded(PL)
  const calculatePlasticityIndex = useCallback((liquidLimit: string, plasticLimit: string): string => {
    // If either field is empty, return blank
    if (!liquidLimit || !plasticLimit || liquidLimit.trim() === '' || plasticLimit.trim() === '') {
      return '';
    }

    const ll = parseFloat(liquidLimit);
    const pl = parseFloat(plasticLimit);

    // If either value is invalid, return blank
    if (isNaN(ll) || isNaN(pl)) {
      return '';
    }

    // Round to nearest whole number using standard rounding rules
    const roundedLL = Math.round(ll);
    const roundedPL = Math.round(pl);

    // Calculate PI
    const pi = roundedLL - roundedPL;

    // Debug log
    console.log('PI Calculation:', {
      liquidLimit,
      plasticLimit,
      ll,
      pl,
      roundedLL,
      roundedPL,
      pi
    });

    return String(pi);
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recalculate PI whenever LL or PL changes
  useEffect(() => {
    const calculatedPI = calculatePlasticityIndex(
      summaryData.liquidLimitLL,
      summaryData.plasticLimit
    );
    // Always update PI to the calculated value
    // This ensures PI is always correct and never shows stale values
    setSummaryData(prev => {
      // Only update if the calculated value is different from current
      if (prev.plasticityIndex !== calculatedPI) {
        return { ...prev, plasticityIndex: calculatedPI };
      }
      return prev;
    });
  }, [summaryData.liquidLimitLL, summaryData.plasticLimit, calculatePlasticityIndex]);

  const loadData = async () => {
    try {
      setLoading(true);
      const taskId = parseInt(id!);
      const [taskData, tenantData] = await Promise.all([
        tasksAPI.get(taskId),
        tenantsAPI.getMe().catch(() => null)
      ]);
      setTask(taskData);
      setTenant(tenantData);
      const sampledByDefault = tenantData?.name || tenantData?.companyContactName || DEFAULT_SAMPLED_BY;

      // Load saved Proctor data from backend
      try {
        const savedData = await proctorAPI.getByTask(taskId);
        
        // QA: Debug logging to verify what was loaded from database
        console.log('🔍 [QA] ProctorSummary loadData - Data loaded from database:', {
          liquidLimitLL: savedData.liquidLimitLL,
          plasticLimit: savedData.plasticLimit,
          plasticityIndex: savedData.plasticityIndex,
          fullSavedData: savedData
        });
        
        // Set project info from task (Task has projectNumber and projectName directly)
        const initialData: ProctorSummaryData = {
          projectName: savedData.projectName || taskData.projectName || '',
          projectNumber: savedData.projectNumber || taskData.projectNumber || '',
          sampledBy: savedData.sampledBy || sampledByDefault,
          testMethod: savedData.testMethod || 'ASTM D698',
          client: savedData.client || '',
          soilClassification: savedData.soilClassification || '',
          maximumDryDensityPcf: savedData.maximumDryDensityPcf || '',
          optimumMoisturePercent: savedData.optimumMoisturePercent || '',
          correctedDryDensityPcf: (savedData as any).correctedDryDensityPcf || '',
          correctedMoistureContentPercent: (savedData as any).correctedMoistureContentPercent || '',
          liquidLimitLL: roundToWholeNumber(savedData.liquidLimitLL || ''), // Round on load
          plasticLimit: roundToWholeNumber(savedData.plasticLimit || ''), // Round on load
          plasticityIndex: '', // Always recalculate, don't use saved value
          sampleDate: savedData.sampleDate || '',
          calculatedBy: savedData.calculatedBy || '',
          reviewedBy: savedData.reviewedBy || '',
          checkedBy: savedData.checkedBy || '',
          percentPassing200: savedData.percentPassing200 || '',
          passing200SummaryPct: (savedData as any).passing200SummaryPct || savedData.percentPassing200 || '', // Load summary from Page 1
          specificGravityG: savedData.specificGravityG || '',
          proctorPoints: savedData.proctorPoints || [],
          zavPoints: savedData.zavPoints || []
        };
        
        // Always recalculate PI from LL and PL (never use saved PI value)
        initialData.plasticityIndex = calculatePlasticityIndex(
          initialData.liquidLimitLL,
          initialData.plasticLimit
        );
        
        console.log('Loaded Proctor data from DB - PI calculation:', {
          liquidLimitLL: initialData.liquidLimitLL,
          plasticLimit: initialData.plasticLimit,
          calculatedPI: initialData.plasticityIndex,
          savedPI: savedData.plasticityIndex, // For comparison
          rawSavedData: { // Debug: show what came from API
            liquidLimitLL: savedData.liquidLimitLL,
            plasticLimit: savedData.plasticLimit
          }
        });
        
        setSummaryData(initialData);
      } catch (err: any) {
        // If no data in DB, try localStorage as fallback (backward compatibility)
        console.log('No Proctor data in database, checking localStorage...');
        
        const initialData: ProctorSummaryData = {
          projectName: taskData.projectName || '',
          projectNumber: taskData.projectNumber || '',
          sampledBy: sampledByDefault,
          testMethod: 'ASTM D698',
          client: '',
          soilClassification: '',
          maximumDryDensityPcf: '',
          optimumMoisturePercent: '',
          correctedDryDensityPcf: '',
          correctedMoistureContentPercent: '',
          liquidLimitLL: '',
          plasticLimit: '',
          plasticityIndex: '',
          sampleDate: '',
          calculatedBy: '',
          reviewedBy: '',
          checkedBy: '',
          percentPassing200: '',
          passing200SummaryPct: '',
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
          
          initialData.correctedDryDensityPcf = 
            data.correctedDryDensityPcf ?? '';
          
          initialData.correctedMoistureContentPercent = 
            data.correctedMoistureContentPercent ?? '';
          
          initialData.specificGravityG = 
            data.specificGravityG ?? data.specificGravity ?? data.sg ?? data.specificGravityEstimated ?? '';
          
          initialData.liquidLimitLL = 
            roundToWholeNumber(data.liquidLimitLL ?? data.liquidLimit ?? data.LL ?? ''); // Round on load
          
          initialData.plasticLimit = 
            roundToWholeNumber(data.plasticLimit ?? data.plasticLimitPL ?? ''); // Round on load
          
          // Load soilClassification from localStorage if available
          initialData.soilClassification = data.soilClassification || initialData.soilClassification;
          
          initialData.proctorPoints = data.proctorPoints || [];
          initialData.zavPoints = data.zavPoints || [];

          // Load passing200SummaryPct if exists in localStorage data
          if (data.passing200SummaryPct) {
            initialData.passing200SummaryPct = data.passing200SummaryPct;
          } else if (data.percentPassing200) {
            initialData.passing200SummaryPct = data.percentPassing200; // Fallback to legacy field
          }
        }
        
        // Always recalculate PI from LL and PL (never use saved PI value)
        // This ensures PI is always calculated with correct rounding rules
        initialData.plasticityIndex = calculatePlasticityIndex(
          initialData.liquidLimitLL,
          initialData.plasticLimit
        );
        
        console.log('Loaded Proctor data - PI calculation:', {
          liquidLimitLL: initialData.liquidLimitLL,
          plasticLimit: initialData.plasticLimit,
          calculatedPI: initialData.plasticityIndex,
          savedPI: data?.plasticityIndex // For comparison
        });

        setSummaryData(initialData);
        // Update last saved snapshot after loading
        lastSavedDataRef.current = JSON.stringify(initialData);
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load task data.');
    } finally {
      setLoading(false);
    }
  };

  // Check if there are unsaved changes
  const _checkUnsavedChanges = useCallback(() => {
    if (!task) return false;
    if (saving) return true;
    const currentData = JSON.stringify(summaryData);
    return currentData !== lastSavedDataRef.current;
  }, [summaryData, saving, task]);

  const handleFieldChange = (field: keyof ProctorSummaryData, value: string) => {
    setSummaryData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate PI when LL or PL changes
      if (field === 'liquidLimitLL' || field === 'plasticLimit') {
        // Use the new value for the field being changed, and current value for the other
        const ll = field === 'liquidLimitLL' ? value : prev.liquidLimitLL;
        const pl = field === 'plasticLimit' ? value : prev.plasticLimit;
        updated.plasticityIndex = calculatePlasticityIndex(ll, pl);
      }
      
      return updated;
    });
  };

  // Handle blur event to round LL or PL to whole number
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>, field: 'liquidLimitLL' | 'plasticLimit') => {
    const value = e.target.value;
    console.log('handleBlur called:', { field, value, isEditable, taskStatus: task?.status });
    if (!isEditable) {
      console.log('Field is not editable, skipping rounding');
      return;
    }
    // Only round if value is not empty
    if (!value || value.trim() === '') {
      return;
    }
    const rounded = roundToWholeNumber(value);
    console.log('handleBlur rounding result:', { field, original: value, rounded, willUpdate: rounded !== value });
    // Update if rounded value is different from current value
    if (rounded !== value) {
      console.log('Updating field with rounded value:', rounded);
      handleFieldChange(field, rounded);
    }
  };

  // Handle Enter key to round and blur
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'liquidLimitLL' | 'plasticLimit') => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission or other default behavior
      const currentValue = summaryData[field];
      const rounded = roundToWholeNumber(currentValue);
      console.log('handleKeyDown (Enter):', { field, currentValue, rounded });
      if (rounded !== currentValue && rounded !== '') {
        handleFieldChange(field, rounded);
      }
      e.currentTarget.blur();
    }
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    setError('');
    try {
      // Save to database
      const reportData = {
        projectName: summaryData.projectName,
        projectNumber: summaryData.projectNumber,
        sampledBy: summaryData.sampledBy,
        testMethod: summaryData.testMethod,
        client: summaryData.client,
        soilClassification: summaryData.soilClassification,
        maximumDryDensityPcf: summaryData.maximumDryDensityPcf,
        optimumMoisturePercent: summaryData.optimumMoisturePercent,
        correctedDryDensityPcf: summaryData.correctedDryDensityPcf || '',
        correctedMoistureContentPercent: summaryData.correctedMoistureContentPercent || '',
        liquidLimitLL: roundToWholeNumber(summaryData.liquidLimitLL), // Save rounded value
        plasticLimit: roundToWholeNumber(summaryData.plasticLimit), // Save rounded value
        plasticityIndex: summaryData.plasticityIndex,
        sampleDate: summaryData.sampleDate,
        calculatedBy: summaryData.calculatedBy,
        reviewedBy: summaryData.reviewedBy,
        checkedBy: summaryData.checkedBy,
        percentPassing200: summaryData.passing200SummaryPct || summaryData.percentPassing200 || '',
        passing200SummaryPct: summaryData.passing200SummaryPct || '',
        specificGravityG: summaryData.specificGravityG,
        proctorPoints: summaryData.proctorPoints || [],
        zavPoints: summaryData.zavPoints || []
      };
      
      await proctorAPI.saveByTask(task.id, reportData);
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem(`proctor_draft_${task.id}`, JSON.stringify(reportData));
      
      setSaving(false);
      alert('Proctor data saved successfully!');
    } catch (err: any) {
      console.error('Error saving Proctor data:', err);
      setError(err.response?.data?.error || 'Failed to save');
      setSaving(false);
    }
  };

  const handleCreatePDF = async () => {
    if (!task) return;
    
    try {
      setSaving(true);
      setError(''); // Clear previous errors
      setPdfSaveNotice('');
      
      // Save current state to database and localStorage BEFORE generating PDF
      // This ensures data is preserved if user clicks Back
      const saveData = {
        projectName: summaryData.projectName,
        projectNumber: summaryData.projectNumber,
        sampledBy: summaryData.sampledBy,
        testMethod: summaryData.testMethod,
        client: summaryData.client,
        soilClassification: summaryData.soilClassification,
        maximumDryDensityPcf: summaryData.maximumDryDensityPcf,
        optimumMoisturePercent: summaryData.optimumMoisturePercent,
        correctedDryDensityPcf: summaryData.correctedDryDensityPcf || '',
        correctedMoistureContentPercent: summaryData.correctedMoistureContentPercent || '',
        liquidLimitLL: roundToWholeNumber(summaryData.liquidLimitLL),
        plasticLimit: roundToWholeNumber(summaryData.plasticLimit),
        plasticityIndex: summaryData.plasticityIndex,
        sampleDate: summaryData.sampleDate,
        calculatedBy: summaryData.calculatedBy,
        reviewedBy: summaryData.reviewedBy,
        checkedBy: summaryData.checkedBy,
        percentPassing200: summaryData.passing200SummaryPct || summaryData.percentPassing200 || '',
        passing200SummaryPct: summaryData.passing200SummaryPct || '',
        specificGravityG: summaryData.specificGravityG,
        proctorPoints: summaryData.proctorPoints || [],
        zavPoints: summaryData.zavPoints || []
      };
      
      // Save to database
      await proctorAPI.saveByTask(task.id, saveData);
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem(`proctor_draft_${task.id}`, JSON.stringify(saveData));
      
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify(summaryData);
      
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
        correctedDryDensityPcf: summaryData.correctedDryDensityPcf || '',
        correctedMoistureContentPercent: summaryData.correctedMoistureContentPercent || '',
        liquidLimitLL: summaryData.liquidLimitLL,
        plasticLimit: summaryData.plasticLimit,
        plasticityIndex: summaryData.plasticityIndex,
        sampleDate: summaryData.sampleDate,
        calculatedBy: summaryData.calculatedBy,
        reviewedBy: summaryData.reviewedBy,
        checkedBy: summaryData.checkedBy,
        percentPassing200: summaryData.passing200SummaryPct || summaryData.percentPassing200 || '',
        passing200SummaryPct: summaryData.passing200SummaryPct || '',
        specificGravityG: summaryData.specificGravityG,
        proctorPoints: summaryData.proctorPoints || [],
        zavPoints: summaryData.zavPoints || []
      };
      
      // Use same approach as WP1Form - direct fetch (bypassing API helper)
      const token = localStorage.getItem('token');
      const pdfUrl = getApiPathPrefix() + `/proctor/${task.id}/pdf`;
      
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
        
        if (result.saved && result.savedPath) {
          setLastSavedPath(result.savedPath);
          setError('');
          setPdfSaveNotice(result.savedToConfiguredPath ? '' : 'PDF downloaded. To save automatically to your workflow folder, run the app locally (npm run dev) and set Workflow path in Settings.');
        } else if (result.saveError) {
          setError(`PDF generated but save failed: ${result.saveError}`);
          alert(`PDF generated but save failed: ${result.saveError}\n\nPDF will still be downloaded.`);
          setPdfSaveNotice('');
        } else if (result.saved && result.savedToConfiguredPath === false && !result.saveError) {
          setPdfSaveNotice('PDF downloaded. To save automatically to your workflow folder, run the app locally (npm run dev) and set Workflow path in Settings.');
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

  // Calculate OMC and Max Density values for chart (using corrected values if available, otherwise original)
  const omcValue = summaryData.correctedMoistureContentPercent 
    ? parseFloat(summaryData.correctedMoistureContentPercent) 
    : (summaryData.optimumMoisturePercent ? parseFloat(summaryData.optimumMoisturePercent) : undefined);
  const maxDensityValue = summaryData.correctedDryDensityPcf 
    ? parseFloat(summaryData.correctedDryDensityPcf) 
    : (summaryData.maximumDryDensityPcf ? parseFloat(summaryData.maximumDryDensityPcf) : undefined);
  
  // Calculate corrected point for chart if corrected values exist
  const correctedPoint: ProctorPoint | null = (summaryData.correctedMoistureContentPercent && summaryData.correctedDryDensityPcf) 
    ? {
        x: parseFloat(summaryData.correctedMoistureContentPercent),
        y: parseFloat(summaryData.correctedDryDensityPcf)
      }
    : null;

  return (
    <div className="proctor-summary-container">
      {/* Single header row: logo left, buttons + address right, all inline */}
      <div className="proctor-summary-header summary-page-header">
        <div className="header-logo">
          <img
            src={tenant?.logoPath
              ? `${getCurrentApiBaseUrl()}/${tenant.logoPath.replace(/^\/+/, '')}`
              : encodeURI(DEFAULT_LOGO)}
            alt={tenant?.name || 'Company logo'}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="header-right">
          <div className="summary-actions">
            <ProjectHomeButton
              projectId={task.projectId}
              onSave={handleSave}
              saving={saving}
            />
            <button 
              type="button" 
              onClick={async () => {
                // Save current state before navigating back to preserve data
                if (task) {
                  try {
                    const saveData = {
                      projectName: summaryData.projectName,
                      projectNumber: summaryData.projectNumber,
                      sampledBy: summaryData.sampledBy,
                      testMethod: summaryData.testMethod,
                      client: summaryData.client,
                      soilClassification: summaryData.soilClassification,
                      maximumDryDensityPcf: summaryData.maximumDryDensityPcf,
                      optimumMoisturePercent: summaryData.optimumMoisturePercent,
                      correctedDryDensityPcf: summaryData.correctedDryDensityPcf || '',
                      correctedMoistureContentPercent: summaryData.correctedMoistureContentPercent || '',
                      liquidLimitLL: roundToWholeNumber(summaryData.liquidLimitLL),
                      plasticLimit: roundToWholeNumber(summaryData.plasticLimit),
                      plasticityIndex: summaryData.plasticityIndex,
                      sampleDate: summaryData.sampleDate,
                      calculatedBy: summaryData.calculatedBy,
                      reviewedBy: summaryData.reviewedBy,
                      checkedBy: summaryData.checkedBy,
                      percentPassing200: summaryData.passing200SummaryPct || summaryData.percentPassing200 || '',
                      passing200SummaryPct: summaryData.passing200SummaryPct || '',
                      specificGravityG: summaryData.specificGravityG,
                      proctorPoints: summaryData.proctorPoints || [],
                      zavPoints: summaryData.zavPoints || []
                    };
                    await proctorAPI.saveByTask(task.id, saveData);
                    localStorage.setItem(`proctor_draft_${task.id}`, JSON.stringify(saveData));
                  } catch (err) {
                    console.error('Error saving before navigation:', err);
                  }
                }
                navigate(`/task/${id}/proctor`);
              }}
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
          <div className="header-address">
            {formatTenantAddress(tenant).length > 0 ? (
              formatTenantAddress(tenant).map((line, i) => <div key={i}>{line}</div>)
            ) : (
              <>
                <div>940 N Beltline Road, Suite 107,</div>
                <div>Irving, TX 75061</div>
                <div>P: 214-718-1250</div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {pdfSaveNotice && <div className="pdf-save-notice">{pdfSaveNotice}</div>}
      
      {lastSavedPath && (
        <div className="pdf-created-banner">
          PDF created.
        </div>
      )}

      <div className="proctor-summary-content">

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
            <div className="summary-field-row summary-field-row-soil">
              <label>Soil Classification:</label>
              <textarea
                value={summaryData.soilClassification}
                onChange={(e) => handleFieldChange('soilClassification', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
                maxLength={120}
                rows={2}
              />
            </div>
            <div className="summary-field-row">
              <label>
                {summaryData.correctedDryDensityPcf ? 'Corrected Dry Density (pcf):' : 'Maximum Dry Density (pcf):'}
              </label>
              <div className="summary-field-value">
                {summaryData.correctedDryDensityPcf || summaryData.maximumDryDensityPcf}
              </div>
            </div>
            <div className="summary-field-row">
              <label>
                {summaryData.correctedMoistureContentPercent ? 'Corrected Moisture Content (%):' : 'Optimum Moisture (%):'}
              </label>
              <div className="summary-field-value">
                {summaryData.correctedMoistureContentPercent || summaryData.optimumMoisturePercent}
              </div>
            </div>
            <div className="summary-field-row">
              <label>Liquid Limit (LL):</label>
              <input
                type="text"
                value={summaryData.liquidLimitLL}
                onChange={(e) => handleFieldChange('liquidLimitLL', e.target.value)}
                onBlur={(e) => handleBlur(e, 'liquidLimitLL')}
                onKeyDown={(e) => handleKeyDown(e, 'liquidLimitLL')}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="summary-field-row">
              <label>Plasticity Index (PI):</label>
              <input
                type="text"
                value={summaryData.plasticityIndex}
                readOnly
                className="calculated"
                title="Auto-calculated: Rounded(LL) - Rounded(PL)"
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
            correctedPoint={correctedPoint}
          />
        </div>
      </div>
    </div>
  );
};

export default ProctorSummary;


