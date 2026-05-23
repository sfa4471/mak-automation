import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { densityAPI, DensityReport, TestRow, ProctorRow } from '../api/density';
import { tasksAPI, Task, TaskHistoryEntry, ProctorTask, taskTypeLabel } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { authAPI, User } from '../api/auth';
import { SoilSpecRow, normalizeSoilSpecRow, projectsAPI, structureTypeDisplayLabel } from '../api/projects';
import {
  mergeProjectPresetIntoProctors,
  projectPresetSignature,
  normalizePresetProctorRow
} from '../utils/mergeProjectPresetProctors';
import { proctorAPI } from '../api/proctor';
import { getApiPathPrefix } from '../api/api';
import { useAppDialog } from '../context/AppDialogContext';
import ProjectHomeButton from './ProjectHomeButton';
import RejectTaskModal from './RejectTaskModal';
import UnapproveTaskModal from './UnapproveTaskModal';
import { useUnapproveReport } from '../hooks/useUnapproveReport';
import './DensityReportForm.css';

// Note: We no longer use fallback structure types - only show structure types
// that are actually defined in the project's Soil Specs section

function hasMeaningfulDensityPercents(arr: unknown): boolean {
  return Array.isArray(arr) && arr.some((p) => p != null && String(p).trim() !== '');
}

function hasMeaningfulMoistSpecRanges(arr: unknown): boolean {
  return (
    Array.isArray(arr) &&
    arr.some((r) => {
      if (!r || typeof r !== 'object') return false;
      const o = r as { min?: unknown; max?: unknown };
      return String(o.min ?? '').trim() !== '' || String(o.max ?? '').trim() !== '';
    })
  );
}

/** Prefer array fields; treat empty densSpecPercents as missing so legacy densSpecPercent still displays. */
function effectiveDensitySpecPercents(data: DensityReport): string[] {
  if (hasMeaningfulDensityPercents(data.densSpecPercents)) {
    return (data.densSpecPercents as string[]).map((x) => (x == null ? '' : String(x)));
  }
  if (data.densSpecPercent != null && String(data.densSpecPercent).trim() !== '') {
    return [String(data.densSpecPercent)];
  }
  return [];
}

function effectiveMoistSpecRanges(data: DensityReport): Array<{ min?: string; max?: string }> {
  if (hasMeaningfulMoistSpecRanges(data.moistSpecRanges)) {
    return (data.moistSpecRanges as Array<{ min?: string; max?: string }>).map((r) => ({
      min: r?.min != null ? String(r.min) : '',
      max: r?.max != null ? String(r.max) : ''
    }));
  }
  const min = data.moistSpecMin != null ? String(data.moistSpecMin) : '';
  const max = data.moistSpecMax != null ? String(data.moistSpecMax) : '';
  if (min.trim() !== '' || max.trim() !== '') return [{ min, max }];
  return [];
}

const DensityReportForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isStaffReviewer } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const [task, setTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<DensityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [moistSpecRange, setMoistSpecRange] = useState<string>('');
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [proctorTasks, setProctorTasks] = useState<ProctorTask[]>([]);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const proctorCacheRef = useRef<{ [key: string]: any }>({}); // Cache proctor fetches by "projectId:proctorNo"
  const projectPresetRowsRef = useRef<NonNullable<DensityReport['projectPresetProctorRows']>>([]);
  const projectPresetDeclaredRef = useRef(false);
  const projectPresetSigRef = useRef<string>('');
  const taskRef = useRef<Task | null>(null);
  const hasAutoPopulatedRef = useRef<boolean>(false); // Track if we've already auto-populated on load
  const latestFormDataRef = useRef<DensityReport | null>(null); // Track latest formData for immediate saves

  useEffect(() => {
    if (formData) latestFormDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  // When project preset proctors change (e.g. user saved Project Details in another tab), refresh merge into this form.
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      if (loading) return;
      const t = taskRef.current;
      if (!t?.projectId) return;
      try {
        const p = await projectsAPI.get(t.projectId);
        const sig = projectPresetSignature(!!p.presetProctorsDeclared, p.presetProctorRows);
        if (sig === projectPresetSigRef.current) return;
        projectPresetSigRef.current = sig;
        projectPresetDeclaredRef.current = !!p.presetProctorsDeclared;
        projectPresetRowsRef.current = p.presetProctorRows ? [...p.presetProctorRows] : [];
        Object.keys(proctorCacheRef.current).forEach((k) => delete proctorCacheRef.current[k]);
        setFormData((prev) => {
          if (!prev) return prev;
          const merged = mergeProjectPresetIntoProctors(
            prev.proctors,
            !!p.presetProctorsDeclared,
            p.presetProctorRows
          );
          return {
            ...prev,
            projectPresetProctorsDeclared: !!p.presetProctorsDeclared,
            projectPresetProctorRows: p.presetProctorRows ? [...p.presetProctorRows] : [],
            proctors: merged
          };
        });
      } catch (e) {
        console.warn('Density form: could not refresh project preset proctors', e);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loading, id]);

  // Auto-populate proctor rows on initial load
  useEffect(() => {
    // Only run once after data is loaded and not already populated
    if (!formData || !task || hasAutoPopulatedRef.current || loading) return;
    
    // Mark as populated immediately to prevent re-runs
    hasAutoPopulatedRef.current = true;
    
    // Check if any proctor rows need to be populated
    const needsPopulation = formData.proctors.some((proctor) => {
      // Skip if proctorNo is not set or is invalid
      if (!proctor.proctorNo || proctor.proctorNo <= 0) return false;
      
      // If fields are already populated, skip
      if (proctor.description && proctor.optMoisture && proctor.maxDensity) return false;
      
      return true;
    });

    if (!needsPopulation) {
      return;
    }

    // Auto-populate all proctor rows that need it
    const populateAll = async () => {
      if (!formData || !task) return;
      
      const newProctors = [...formData.proctors];
      let hasChanges = false;
      const updatedFormData = { ...formData };

      for (let index = 0; index < newProctors.length; index++) {
        const proctor = newProctors[index];
        
        // Skip if proctorNo is not set or is invalid
        if (!proctor.proctorNo || proctor.proctorNo <= 0) continue;
        
        // If fields are already populated, skip
        if (proctor.description && proctor.optMoisture && proctor.maxDensity) continue;

        // Check if we have snapshot values first (for this specific proctor)
        const hasSnapshot = formData.proctorDescriptionLabel && 
                           formData.proctorDescriptionLabel.includes(`Soil ${proctor.proctorNo}:`);
        
        if (hasSnapshot && formData.proctorOptMoisture && formData.proctorMaxDensity) {
          // Use snapshot values if they exist and match this proctor
          newProctors[index] = {
            ...proctor,
            description: formData.proctorDescriptionLabel || '',
            optMoisture: formData.proctorOptMoisture || '',
            maxDensity: formData.proctorMaxDensity || ''
          };
          hasChanges = true;
        } else {
          // Fetch proctor data
          const populated = await populateProctorRow(index, proctor.proctorNo, true);
          
          if (populated) {
            newProctors[index] = {
              ...proctor,
              description: populated.description,
              optMoisture: populated.optMoisture,
              maxDensity: populated.maxDensity
            };
            
            // Update snapshot fields (use the first populated proctor's data)
            if (!updatedFormData.proctorSoilClassificationText) {
              updatedFormData.proctorSoilClassificationText = populated.soilClassificationText;
              updatedFormData.proctorSoilClassification = populated.soilClassificationText;
              updatedFormData.proctorDescriptionLabel = populated.description;
              updatedFormData.proctorOptMoisture = populated.optMoisture;
              updatedFormData.proctorMaxDensity = populated.maxDensity;
            }
            
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        // Recalculate percent proctor for all test rows
        const newRows = updatedFormData.testRows.map(row => {
          if (row.proctorNo && row.dryDensity) {
            return {
              ...row,
              percentProctorDensity: calculatePercentProctor(row.dryDensity, row.proctorNo, newProctors)
            };
          }
          return row;
        });

        updatedFormData.proctors = newProctors;
        setFormData({ ...updatedFormData, testRows: newRows });
        // Save the populated data
        debouncedSave({ ...updatedFormData, testRows: newRows });
      }
    };

    populateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData?.id, task?.id, loading]);

  const loadData = async () => {
    try {
      setLoading(true);
      const taskId = parseInt(id!);
      // Load task first (need projectId for parallel proctor fetch)
      const taskData = await tasksAPI.get(taskId);
      setTask(taskData);
      // Load report data and proctor tasks in parallel
      const [reportData, proctorTasksList] = await Promise.all([
        densityAPI.getByTask(taskId),
        taskData?.projectId
          ? tasksAPI.getProctorsForProject(taskData.projectId).catch(() => [] as ProctorTask[])
          : Promise.resolve([] as ProctorTask[])
      ]);
      setProctorTasks(proctorTasksList);
      projectPresetDeclaredRef.current = !!(reportData && reportData.projectPresetProctorsDeclared);
      projectPresetRowsRef.current = reportData?.projectPresetProctorRows
        ? [...reportData.projectPresetProctorRows]
        : [];
      projectPresetSigRef.current = reportData
        ? projectPresetSignature(!!reportData.projectPresetProctorsDeclared, reportData.projectPresetProctorRows)
        : '';
      
      // Debug: Log loaded data to verify header fields and specs are present
      if (reportData) {
        const soilSpecsKeys = reportData.projectSoilSpecs && typeof reportData.projectSoilSpecs === 'object' 
          ? Object.keys(reportData.projectSoilSpecs) 
          : [];
        const concreteSpecsKeys = reportData.projectConcreteSpecs && typeof reportData.projectConcreteSpecs === 'object'
          ? Object.keys(reportData.projectConcreteSpecs)
          : [];
        
        console.log('🔍 Density Report Data Loaded:', {
          clientName: reportData.clientName,
          datePerformed: reportData.datePerformed,
          structure: reportData.structure,
          structureType: reportData.structureType,
          hasProjectSoilSpecs: !!reportData.projectSoilSpecs,
          projectSoilSpecsType: typeof reportData.projectSoilSpecs,
          projectSoilSpecs: reportData.projectSoilSpecs,
          soilSpecsKeys: soilSpecsKeys,
          soilSpecsCount: soilSpecsKeys.length,
          hasProjectConcreteSpecs: !!reportData.projectConcreteSpecs,
          projectConcreteSpecsType: typeof reportData.projectConcreteSpecs,
          projectConcreteSpecs: reportData.projectConcreteSpecs,
          concreteSpecsKeys: concreteSpecsKeys,
          concreteSpecsCount: concreteSpecsKeys.length
        });
        
        // Warn if soil specs are missing but concrete specs exist
        if (soilSpecsKeys.length === 0 && concreteSpecsKeys.length > 0) {
          console.warn('⚠️ WARNING: No Soil Specs found but Concrete Specs exist. Density reports should use Soil Specs!');
        }
      }
      
      // Ensure header fields are properly initialized from loaded data
      let initializedData: DensityReport | null = null;
      
      if (reportData) {
        // Ensure clientName, datePerformed, structure, and structureType are set (even if empty strings)
        initializedData = {
          ...reportData,
          clientName: reportData.clientName || '',
          datePerformed: reportData.datePerformed || new Date().toISOString().split('T')[0],
          structure: reportData.structure || '',
          structureType: reportData.structureType || reportData.structure || ''
        };
        
        // Initialize moisture spec range from min/max values
        const min = reportData.moistSpecMin || '';
        const max = reportData.moistSpecMax || '';
        if (min && max) {
          setMoistSpecRange(`${min} to ${max}`);
        } else if (min || max) {
          setMoistSpecRange(min || max);
        } else {
          setMoistSpecRange('');
        }
        
        // Auto-populate specs if structure is already selected but saved report has no spec values yet
        const structureType = reportData.structureType || reportData.structure;
        if (
          structureType &&
          reportData.projectSoilSpecs &&
          typeof reportData.projectSoilSpecs === 'object' &&
          !Array.isArray(reportData.projectSoilSpecs)
        ) {
          const soilSpecs = reportData.projectSoilSpecs;
          let selectedSpec: SoilSpecRow | undefined = soilSpecs[structureType] as SoilSpecRow | undefined;
          if (!selectedSpec) {
            const lower = structureType.trim().toLowerCase();
            for (const key of Object.keys(soilSpecs)) {
              if (key.trim().toLowerCase() === lower) {
                selectedSpec = soilSpecs[key] as SoilSpecRow;
                break;
              }
            }
          }
          if (selectedSpec && typeof selectedSpec === 'object') {
            const normalized = normalizeSoilSpecRow(selectedSpec);
            const hasReportDensity = effectiveDensitySpecPercents(reportData).length > 0;
            const hasReportMoist = effectiveMoistSpecRanges(reportData).some(
              (r) => String(r.min ?? '').trim() !== '' || String(r.max ?? '').trim() !== ''
            );
            if (!hasReportDensity) {
              const d = [...(normalized.densityPcts || [''])];
              if (d.some((x) => x != null && String(x).trim() !== '')) {
                initializedData.densSpecPercents = d;
                initializedData.densSpecPercent = d[0] ?? '';
                initializedData.specDensityPct = d[0] ?? '';
              }
            }
            if (!hasReportMoist) {
              const m = (normalized.moistureRanges || [{ min: '', max: '' }]).map((r) => ({ ...r }));
              if (m.some((r) => String(r.min ?? '').trim() !== '' || String(r.max ?? '').trim() !== '')) {
                initializedData.moistSpecRanges = m;
                initializedData.moistSpecMin = String(m[0]?.min ?? '');
                initializedData.moistSpecMax = String(m[0]?.max ?? '');
                const sm = initializedData.moistSpecMin;
                const sx = initializedData.moistSpecMax;
                if (sm && sx) setMoistSpecRange(`${sm} to ${sx}`);
                else if (sm || sx) setMoistSpecRange(sm || sx);
              }
            }
          }
        }
        
        // Expand proctor rows to cover any proctor tasks not already present
        if (proctorTasksList.length > 0 && initializedData.proctors) {
          const existingNos = new Set(initializedData.proctors.map(p => p.proctorNo));
          const missingNos = proctorTasksList.map(pt => pt.proctorNo).filter(no => !existingNos.has(no));
          if (missingNos.length > 0) {
            const extraRows = missingNos.map(no => ({ proctorNo: no, description: '', optMoisture: '', maxDensity: '' }));
            initializedData = {
              ...initializedData,
              proctors: [...initializedData.proctors, ...extraRows].sort((a, b) => a.proctorNo - b.proctorNo)
            };
          }
        }

        setFormData(initializedData);
        lastSavedDataRef.current = JSON.stringify(initializedData);
      } else {
        setFormData(reportData);
        if (reportData) {
          lastSavedDataRef.current = JSON.stringify(reportData);
        }
      }
      
      // Reset auto-population flag when loading new data
      hasAutoPopulatedRef.current = false;
      // Clear proctor cache when loading new project
      proctorCacheRef.current = {};

      // Auto-save initial data if no record exists yet (ensures PDF can be generated)
      // Check if this is a new/empty report by checking if it has an id
      // The backend returns an object without id when no record exists
      if (reportData && taskData && typeof reportData.id === 'undefined') {
        // Save the initial empty structure to create the database record
        try {
          const saved = await densityAPI.saveByTask(taskId, reportData);
          // Update formData with the saved version (which now has an id)
          setFormData(saved);
        } catch (err) {
          console.error('Error auto-saving initial data:', err);
          // Don't show error to user, just log it - form will still work
        }
      }

      // Load technicians list (for all users - needed for Tech dropdown)
      try {
        const techs = await authAPI.listTechnicians();
        setTechnicians(techs);
      } catch (err) {
        console.error('Error loading technicians:', err);
      }

      // Load task history
      try {
        const historyData = await tasksAPI.getHistory(taskId);
        setHistory(historyData);
      } catch (err) {
        console.error('Error loading task history:', err);
      }

    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  const {
    unapproveOpen,
    alreadySentToClient,
    unapproveLoading,
    openUnapproveModal,
    closeUnapproveModal,
    submitUnapprove,
    contextLine: unapproveContextLine
  } = useUnapproveReport(task, loadData);

  // Calculate dry density: dryDensity = wetDensity / (1 + (fieldMoisture / 100))
  const calculateDryDensity = (wetDensity: string, fieldMoisture: string): string => {
    const wet = parseFloat(wetDensity);
    const moisture = parseFloat(fieldMoisture);
    if (isNaN(wet) || isNaN(moisture)) return '';
    const dry = wet / (1 + (moisture / 100));
    return dry.toFixed(1);
  };

  // Calculate percent proctor density: (dryDensity / maxDensity) * 100
  // MaxDensitySelected is pulled from the Proctor Summary table based on the Proctor No selected
  const calculatePercentProctor = (dryDensity: string, proctorNo: string, proctors: ProctorRow[]): string => {
    // If any required value is missing, return blank
    if (!dryDensity || !proctorNo || !proctors || proctors.length === 0) return '';
    
    const dry = parseFloat(dryDensity);
    const proctorNum = parseInt(String(proctorNo).trim(), 10);
    
    // Validate inputs
    if (isNaN(dry) || isNaN(proctorNum) || proctorNum < 1) return '';
    
    // Prefer row whose stored Proctor No matches (supports manual / reordered summary rows)
    const proctor =
      proctors.find((p) => String(p.proctorNo) === String(proctorNum)) ||
      (proctorNum <= 6 ? proctors[proctorNum - 1] : undefined);
    if (!proctor || !proctor.maxDensity || proctor.maxDensity.trim() === '') return '';
    
    const maxDensity = parseFloat(proctor.maxDensity);
    if (isNaN(maxDensity) || maxDensity <= 0) return '';
    
    // Calculate: PercentProctorDensity = (DryDensity / MaxDensitySelected) * 100
    const percent = (dry / maxDensity) * 100;
    return percent.toFixed(1);
  };

  const updateTestRow = (index: number, field: keyof TestRow, value: any) => {
    if (!formData) return;
    const newRows = [...formData.testRows];
    const row = { ...newRows[index] };
    
    if (field === 'wetDensity' || field === 'fieldMoisture') {
      (row as any)[field] = value;
      // Recalculate dry density
      row.dryDensity = calculateDryDensity(row.wetDensity, row.fieldMoisture);
      // Recalculate percent proctor if proctorNo is set
      if (row.proctorNo && row.dryDensity) {
        row.percentProctorDensity = calculatePercentProctor(row.dryDensity, row.proctorNo, formData.proctors);
      }
    } else if (field === 'proctorNo') {
      (row as any)[field] = value;
      
      // Recalculate percent proctor based on the Proctor Summary table values
      // This does NOT auto-populate the Proctor Summary table - that's done independently
      if (row.dryDensity && value) {
        row.percentProctorDensity = calculatePercentProctor(row.dryDensity, value, formData.proctors);
      } else {
        // Clear percent proctor if proctorNo is cleared or dryDensity is missing
        row.percentProctorDensity = '';
      }
    } else {
      (row as any)[field] = value;
    }
    
    newRows[index] = row;
    setFormData({ ...formData, testRows: newRows });
    debouncedSave({ ...formData, testRows: newRows });
  };

  // Helper function to fetch and populate a proctor row
  const populateProctorRow = async (
    index: number,
    proctorNo: number,
    useCache: boolean = true
  ): Promise<{ description: string; optMoisture: string; maxDensity: string; soilClassificationText: string } | null> => {
    if (!task?.projectId) return null;

    const cacheKey = `${task.projectId}:${proctorNo}`;
    
    // Check cache first if useCache is true
    if (useCache && proctorCacheRef.current[cacheKey]) {
      const cached = proctorCacheRef.current[cacheKey];
      return {
        description: cached.description,
        optMoisture: cached.optMoisture,
        maxDensity: cached.maxDensity,
        soilClassificationText: cached.soilClassificationText
      };
    }

    const tryPreset = (): {
      description: string;
      optMoisture: string;
      maxDensity: string;
      soilClassificationText: string;
    } | null => {
      if (!projectPresetDeclaredRef.current || projectPresetRowsRef.current.length === 0) return null;
      const raw = projectPresetRowsRef.current.find((r) => {
        if (r == null) return false;
        const n = normalizePresetProctorRow(r as unknown as Record<string, unknown>).proctorNo;
        return n != null && n === proctorNo;
      });
      if (!raw) return null;
      const match = normalizePresetProctorRow(raw as unknown as Record<string, unknown>);
      const description = String(match.description || '').trim() || `Proctor ${proctorNo}`;
      const optMoisture =
        match.optMoisture !== null && match.optMoisture !== undefined ? String(match.optMoisture).trim() : '';
      const maxDensity =
        match.maxDensity !== null && match.maxDensity !== undefined ? String(match.maxDensity).trim() : '';
      return {
        description,
        optMoisture,
        maxDensity,
        soilClassificationText: ''
      };
    };

    try {
      // Prefer completed Proctor workflow data when it exists
      const proctorData = await proctorAPI.getByProjectAndProctorNo(task.projectId, proctorNo);

      // Use soilClassificationText if available, otherwise fallback to soilClassification
      const soilClassificationText = proctorData?.soilClassificationText || proctorData?.soilClassification || '';
      const descriptionLabel = soilClassificationText
        ? `Soil ${proctorNo}: ${soilClassificationText}`
        : `Soil ${proctorNo}`;

      const optMoisture =
        proctorData?.optMoisturePct !== null && proctorData?.optMoisturePct !== undefined
          ? String(proctorData.optMoisturePct)
          : '';

      const maxDensity =
        proctorData?.maxDryDensityPcf !== null && proctorData?.maxDryDensityPcf !== undefined
          ? String(proctorData.maxDryDensityPcf)
          : '';

      const result = {
        description: descriptionLabel,
        optMoisture,
        maxDensity,
        soilClassificationText: soilClassificationText
      };

      proctorCacheRef.current[cacheKey] = result;
      return result;
    } catch (err: any) {
      if (err.response?.status === 404) {
        const presetOnly = tryPreset();
        if (presetOnly) {
          proctorCacheRef.current[cacheKey] = presetOnly;
          return presetOnly;
        }
        return null;
      }
      console.error(`Error fetching Proctor ${proctorNo} data:`, err);
      return null;
    }
  };

  const updateProctor = async (index: number, field: keyof ProctorRow, value: string) => {
    if (!formData || !task) return;
    const newProctors = [...formData.proctors];
    
    // If Proctor No is being changed, fetch and auto-populate the row
    if (field === 'proctorNo') {
      // For now, just update the proctorNo - we'll handle population below
      const proctorNoValue = value ? parseInt(value) : null;
      const finalProctorNo = (proctorNoValue && !isNaN(proctorNoValue)) ? proctorNoValue : (index + 1);
      newProctors[index] = { ...newProctors[index], proctorNo: finalProctorNo };
      
      // If a Proctor No is selected (and it's different from default), fetch data and populate
      if (value && task.projectId) {
        const selectedProctorNo = parseInt(value);
        if (!isNaN(selectedProctorNo) && selectedProctorNo > 0) {
          const populated = await populateProctorRow(index, selectedProctorNo, true);
          
          if (populated) {
            newProctors[index] = {
              ...newProctors[index],
              proctorNo: selectedProctorNo,
              description: populated.description,
              optMoisture: populated.optMoisture,
              maxDensity: populated.maxDensity
            };
            
            // Store snapshot fields on the density report
            const updatedFormData = {
              ...formData,
              proctors: newProctors,
              proctorSoilClassification: populated.soilClassificationText,
              proctorSoilClassificationText: populated.soilClassificationText,
              proctorDescriptionLabel: populated.description,
              proctorOptMoisture: populated.optMoisture,
              proctorMaxDensity: populated.maxDensity
            };
            
            // Recalculate percent proctor for ALL test rows that use this proctor number
            const proctorNoStr = String(selectedProctorNo);
            const newRows = updatedFormData.testRows.map(row => {
              if (row.proctorNo === proctorNoStr && row.dryDensity) {
                return {
                  ...row,
                  percentProctorDensity: calculatePercentProctor(row.dryDensity, row.proctorNo, newProctors)
                };
              }
              return row;
            });
            
            setFormData({ ...updatedFormData, testRows: newRows });
            debouncedSave({ ...updatedFormData, testRows: newRows });
            return;
          } else {
            // If Proctor not found or error, clear the row fields but keep the proctorNo
            newProctors[index] = {
              ...newProctors[index],
              description: '',
              optMoisture: '',
              maxDensity: ''
            };
          }
        } else {
          // If Proctor No is cleared, reset to default and clear the row fields
          newProctors[index] = {
            ...newProctors[index],
            proctorNo: index + 1,
            description: '',
            optMoisture: '',
            maxDensity: ''
          };
        }
      } else {
        // If Proctor No is cleared, reset to default and clear the row fields
        newProctors[index] = {
          ...newProctors[index],
          proctorNo: index + 1,
          description: '',
          optMoisture: '',
          maxDensity: ''
        };
      }
    } else {
      // For other fields, just update normally
      newProctors[index] = { ...newProctors[index], [field]: value };
    }
    
    // Recalculate percent proctor for ALL test rows that use this proctor number
    const updatedProctorNo = newProctors[index].proctorNo;
    const proctorNoStr = String(updatedProctorNo);
    const newRows = formData.testRows.map(row => {
      // If this row uses the updated proctor number and has dryDensity, recalculate
      if (row.proctorNo === proctorNoStr && row.dryDensity) {
        return {
          ...row,
          percentProctorDensity: calculatePercentProctor(row.dryDensity, row.proctorNo, newProctors)
        };
      }
      return row;
    });
    
    setFormData({ ...formData, proctors: newProctors, testRows: newRows });
    debouncedSave({ ...formData, proctors: newProctors, testRows: newRows });
  };

  const addProctorRow = () => {
    if (!formData) return;
    const maxNo = formData.proctors.reduce((m, p) => Math.max(m, p.proctorNo || 0), 0);
    const newProctors = [...formData.proctors, { proctorNo: maxNo + 1, description: '', optMoisture: '', maxDensity: '' }];
    const updated = { ...formData, proctors: newProctors };
    setFormData(updated);
    debouncedSave(updated);
  };

  const removeProctorRow = (index: number) => {
    if (!formData || formData.proctors.length <= 1) return;
    const newProctors = formData.proctors.filter((_, i) => i !== index);
    const newRows = formData.testRows.map(row => ({ ...row }));
    const updated = { ...formData, proctors: newProctors, testRows: newRows };
    setFormData(updated);
    debouncedSave(updated);
  };

  // ── Dynamic test-row helpers ──────────────────────────────────────────────

  const renumberRows = (rows: TestRow[]) => {
    let n = 1;
    return rows.map(r => r.type === 'section' ? r : { ...r, testNo: n++ });
  };

  const addDataRow = () => {
    if (!formData) return;
    const dataCount = formData.testRows.filter(r => r.type !== 'section').length;
    const newRow = {
      type: 'data' as const,
      testNo: dataCount + 1,
      testLocation: '',
      depthLiftType: 'DEPTH' as const,
      depthLiftValue: '',
      wetDensity: '',
      fieldMoisture: '',
      dryDensity: '',
      proctorNo: '',
      percentProctorDensity: ''
    };
    const updated = { ...formData, testRows: [...formData.testRows, newRow] };
    setFormData(updated);
    debouncedSave(updated);
  };

  const removeRow = (index: number) => {
    if (!formData) return;
    const dataRows = formData.testRows.filter(r => r.type !== 'section');
    if (dataRows.length <= 1 && formData.testRows[index]?.type !== 'section') return;
    const newRows = renumberRows(formData.testRows.filter((_, i) => i !== index));
    const updated = { ...formData, testRows: newRows };
    setFormData(updated);
    debouncedSave(updated);
  };

  const switchToMultiStructure = () => {
    if (!formData) return;
    const firstSection = {
      type: 'section' as const,
      sectionStructureType: formData.structureType || formData.structure || '',
      testNo: 0, testLocation: '', depthLiftType: 'DEPTH' as const,
      depthLiftValue: '', wetDensity: '', fieldMoisture: '',
      dryDensity: '', proctorNo: '', percentProctorDensity: ''
    };
    const updated = { ...formData, testRows: [firstSection, ...formData.testRows] };
    setFormData(updated);
    debouncedSave(updated);
  };

  const switchToSingleStructure = () => {
    if (!formData) return;
    const dataOnly = renumberRows(formData.testRows.filter(r => r.type !== 'section'));
    const updated = { ...formData, testRows: dataOnly };
    setFormData(updated);
    debouncedSave(updated);
  };

  const handleAddStructureSection = () => {
    if (!formData) return;
    const isMulti = formData.testRows.some(r => r.type === 'section');
    const newSection: TestRow = {
      type: 'section', sectionStructureType: '',
      testNo: 0, testLocation: '', depthLiftType: 'DEPTH',
      depthLiftValue: '', wetDensity: '', fieldMoisture: '',
      dryDensity: '', proctorNo: '', percentProctorDensity: ''
    };
    if (!isMulti) {
      const firstSection: TestRow = {
        type: 'section',
        sectionStructureType: formData.structureType || formData.structure || '',
        testNo: 0, testLocation: '', depthLiftType: 'DEPTH',
        depthLiftValue: '', wetDensity: '', fieldMoisture: '',
        dryDensity: '', proctorNo: '', percentProctorDensity: ''
      };
      const updated = { ...formData, testRows: [firstSection, ...formData.testRows, newSection] };
      setFormData(updated);
      debouncedSave(updated);
    } else {
      const updated = { ...formData, testRows: [...formData.testRows, newSection] };
      setFormData(updated);
      debouncedSave(updated);
    }
  };

  const updateSectionStructureType = (index: number, structureType: string) => {
    if (!formData) return;
    const newRows = formData.testRows.map((r, i) =>
      i === index ? { ...r, sectionStructureType: structureType } : r
    );
    const updated = { ...formData, testRows: newRows };
    setFormData(updated);
    debouncedSave(updated);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const updateField = (field: keyof DensityReport, value: any) => {
    if (!formData) return;
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    latestFormDataRef.current = updatedData; // Update ref immediately
    debouncedSave(updatedData);
  };

  /**
   * Number of spec columns: max of (project template for structure) and (saved report arrays).
   * Relying only on the project caused admin/review views to show a single column when
   * projectSoilSpecs was missing, stale, or key-mismatched — hiding multi-spec data already saved on the report.
   */
  const getSpecColumnCount = (): number => {
    if (!formData) return 1;
    let fromProject = 1;
    if (
      formData.projectSoilSpecs &&
      typeof formData.projectSoilSpecs === 'object' &&
      !Array.isArray(formData.projectSoilSpecs)
    ) {
      const structureType = formData.structureType || formData.structure;
      if (structureType) {
        let spec = formData.projectSoilSpecs[structureType] as SoilSpecRow | undefined;
        if (!spec) {
          const lower = structureType.trim().toLowerCase();
          for (const key of Object.keys(formData.projectSoilSpecs)) {
            if (key.trim().toLowerCase() === lower) {
              spec = formData.projectSoilSpecs[key] as SoilSpecRow;
              break;
            }
          }
        }
        const normalized = normalizeSoilSpecRow(spec);
        const d = (normalized.densityPcts || []).length;
        const m = (normalized.moistureRanges || []).length;
        fromProject = Math.max(1, d, m);
      }
    }
    const savedD = effectiveDensitySpecPercents(formData).length;
    const savedM = effectiveMoistSpecRanges(formData).length;
    const rawD = Array.isArray(formData.densSpecs) ? formData.densSpecs.length : 0;
    const rawM = Array.isArray(formData.moistSpecs) ? formData.moistSpecs.length : 0;
    return Math.max(fromProject, savedD, savedM, rawD, rawM, 1);
  };

  const updateSpecDensity = (index: number, value: string) => {
    if (!formData) return;
    const arr = [...effectiveDensitySpecPercents(formData)];
    while (arr.length <= index) arr.push('');
    arr[index] = value;
    const updatedData = {
      ...formData,
      densSpecPercents: arr,
      densSpecPercent: index === 0 ? value : formData.densSpecPercent,
      specDensityPct: index === 0 ? value : formData.specDensityPct
    };
    setFormData(updatedData);
    latestFormDataRef.current = updatedData;
    debouncedSave(updatedData);
  };

  const updateSpecMoisture = (index: number, field: 'min' | 'max', value: string) => {
    if (!formData) return;
    const arr = [...effectiveMoistSpecRanges(formData)];
    while (arr.length <= index) arr.push({ min: '', max: '' });
    arr[index] = { ...(arr[index] || { min: '', max: '' }), [field]: value };
    const updatedData = {
      ...formData,
      moistSpecRanges: arr,
      moistSpecMin: index === 0 ? String(arr[0].min ?? '') : formData.moistSpecMin,
      moistSpecMax: index === 0 ? String(arr[0].max ?? '') : formData.moistSpecMax
    };
    setFormData(updatedData);
    if (index === 0) setMoistSpecRange(value ? `${arr[0].min} to ${arr[0].max}`.replace(' to ', ' to ').trim() : '');
    latestFormDataRef.current = updatedData;
    debouncedSave(updatedData);
  };

  // Handle structure selection - auto-fill specs from project soil specs (for density reports)
  const handleStructureChange = (structureType: string) => {
    if (!formData) return;
    
    let updatedData = { ...formData, structureType, structure: structureType, structureDescription: '' };
    let densSpecPercents: string[] = [];
    let moistSpecRanges: Array<{ min?: string; max?: string }> = [];
    
    if (formData.projectSoilSpecs && typeof formData.projectSoilSpecs === 'object' && !Array.isArray(formData.projectSoilSpecs)) {
      let selectedSpec: SoilSpecRow | undefined = formData.projectSoilSpecs[structureType] as SoilSpecRow | undefined;
      if (!selectedSpec) {
        const normalizedStructureType = structureType.trim().toLowerCase();
        for (const key in formData.projectSoilSpecs) {
          if (key.trim().toLowerCase() === normalizedStructureType) {
            selectedSpec = formData.projectSoilSpecs[key] as SoilSpecRow;
            break;
          }
        }
      }
      
      if (selectedSpec && typeof selectedSpec === 'object') {
        const normalized = normalizeSoilSpecRow(selectedSpec);
        densSpecPercents = [...(normalized.densityPcts || [''])];
        moistSpecRanges = (normalized.moistureRanges || [{ min: '', max: '' }]).map(r => ({ ...r }));
        if (densSpecPercents.length === 0) densSpecPercents = [''];
        if (moistSpecRanges.length === 0) moistSpecRanges = [{ min: '', max: '' }];
      }
    }
    
    updatedData = {
      ...updatedData,
      densSpecPercents,
      moistSpecRanges,
      densSpecPercent: densSpecPercents[0] ?? '',
      specDensityPct: densSpecPercents[0] ?? '',
      moistSpecMin: String(moistSpecRanges[0]?.min ?? ''),
      moistSpecMax: String(moistSpecRanges[0]?.max ?? '')
    };
    setMoistSpecRange(moistSpecRanges[0]?.min != null && moistSpecRanges[0]?.max != null
      ? `${moistSpecRanges[0].min} to ${moistSpecRanges[0].max}` : '');
    
    setFormData(updatedData);
    debouncedSave(updatedData);
  };

  // Handle moisture spec range text field - parse it to min/max
  const updateMoistSpecRange = (rangeValue: string) => {
    if (!formData) return;
    setMoistSpecRange(rangeValue);
    
    // Parse the range string (e.g., "-2 to +2", "-2 to 2", "-2-+2", etc.)
    let min = '';
    let max = '';
    
    if (rangeValue.trim()) {
      // Try to parse formats like: "-2 to +2", "-2 to 2", "-2 - +2", "-2-+2", etc.
      // Match pattern: number (optional sign) whitespace "to" or "-" whitespace number (optional sign)
      const toMatch = rangeValue.match(/([-+]?\d*\.?\d+)\s*(?:to|-)\s*([-+]?\d*\.?\d+)/i);
      if (toMatch) {
        min = toMatch[1].trim();
        max = toMatch[2].trim();
      } else {
        // If no "to" or "-" separator found, try to split by spaces
        const parts = rangeValue.trim().split(/\s+/);
        if (parts.length >= 2) {
          // Take first and last as min/max
          min = parts[0];
          max = parts[parts.length - 1];
        } else if (parts.length === 1) {
          // Single value - store as min only (max will be empty)
          min = parts[0];
        }
      }
    }
    
    const updatedData = { ...formData, moistSpecMin: min, moistSpecMax: max };
    setFormData(updatedData);
    debouncedSave(updatedData);
  };

  // Check if there are unsaved changes by comparing current state to last saved
  const _checkUnsavedChanges = useCallback(() => {
    if (!formData || !task) return false;
    const currentData = JSON.stringify(formData);
    // Check if we have a pending save (saveStatus is 'saving')
    if (saveStatus === 'saving') return true;
    // Compare current data to last saved
    return currentData !== lastSavedDataRef.current;
  }, [formData, task, saveStatus]);

  const buildDensitySavePayload = useCallback((data: DensityReport) => ({
    ...data,
    clientName: data.clientName || '',
    datePerformed: data.datePerformed || '',
    structure: data.structure || data.structureType || '',
    structureType: data.structureType || data.structure || ''
  }), []);

  const debouncedSave = useCallback((data: DensityReport) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      await saveData(data, false);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any pending debounced saves and save immediately
  const flushAndSave = useCallback(async () => {
    // Use latestFormDataRef to ensure we have the most up-to-date data
    const dataToSave = latestFormDataRef.current || formData;
    if (!dataToSave || !task) return;
    
    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    // Save immediately with latest data
    await saveData(dataToSave, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, task]);

  const saveData = async (data: DensityReport | null, updateStatus?: boolean, status?: string) => {
    if (!data || !task) return;
    
    try {
      setSaving(true);
      setSaveStatus('saving');
      
      const savePayload = buildDensitySavePayload(data);
      
      // Debug: Log save payload to verify header fields are included
      console.log('Saving density report with header fields:', {
        clientName: savePayload.clientName,
        datePerformed: savePayload.datePerformed,
        structure: savePayload.structure,
        structureType: savePayload.structureType
      });
      
      const saved = await densityAPI.saveByTask(
        task.id,
        savePayload,
        updateStatus ? status : undefined,
        isStaffReviewer() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
      );
      
      // Update formData with saved response to ensure we have the latest data
      if (saved) {
        setFormData(saved);
        latestFormDataRef.current = saved;
      }
      
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify(savePayload);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      console.error('Error saving:', err);
      setError(err.response?.data?.error || 'Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    // Admin: Simple save without status change
    if (!formData || !task) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const data = latestFormDataRef.current ?? formData;
      const savePayload = buildDensitySavePayload(data);
      const saved = await densityAPI.saveByTask(
        task.id,
        savePayload,
        undefined,
        isStaffReviewer() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
      );
      if (saved) {
        setFormData(saved);
        latestFormDataRef.current = saved;
      }
      lastSavedDataRef.current = JSON.stringify(savePayload);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpdate = async () => {
    // Technician: Save and set status to IN_PROGRESS_TECH
    if (!formData || !task) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      // Prevent a queued auto-save from writing stale data after this explicit save.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const data = latestFormDataRef.current ?? formData;
      const savePayload = buildDensitySavePayload(data);
      const saved = await densityAPI.saveByTask(
        task.id,
        savePayload,
        'IN_PROGRESS_TECH',
        isStaffReviewer() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
      );
      if (saved) {
        setFormData(saved);
        latestFormDataRef.current = saved;
      }
      lastSavedDataRef.current = JSON.stringify(savePayload);
      await tasksAPI.updateStatus(task.id, 'IN_PROGRESS_TECH');
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      await showAlert('Your update has been saved. Task status is now In Progress.', 'Saved');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save update');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToAdmin = async () => {
    if (!formData || !task) return;
    const ok = await showConfirm(
      'Send this report to the administrator for review? You will not be able to edit it until an administrator responds.',
      'Submit for review'
    );
    if (!ok) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      // Prevent a queued auto-save from writing stale data after submission.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const data = latestFormDataRef.current ?? formData;
      const savePayload = buildDensitySavePayload(data);
      const saved = await densityAPI.saveByTask(
        task.id,
        savePayload,
        undefined,
        isStaffReviewer() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
      );
      await tasksAPI.updateStatus(task.id, 'READY_FOR_REVIEW');
      if (saved) {
        setFormData(saved);
        latestFormDataRef.current = saved;
      }
      lastSavedDataRef.current = JSON.stringify(savePayload);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      navigate('/technician/dashboard');
    } catch (err: any) {
      console.error('Error sending report to admin:', err);
      setError(err.response?.data?.error || 'Failed to send report for review.');
      setSaveStatus('idle');
      await showAlert(err.response?.data?.error || 'The report could not be submitted for review. Please try again.', 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    const approveOk = await showConfirm('Approve this report?', 'Approve report');
    if (!approveOk) return;
    try {
      await tasksAPI.approve(task!.id);
      await loadData();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'The report could not be approved.', 'Approval failed');
    }
  };

  const handleDownloadPdf = async () => {
    if (!task) return;
    if (!formData) {
      setError('No form data. Please wait for the form to load.');
      await showAlert('The form is still loading. Please wait a moment, then try again.', 'Not ready');
      return;
    }
    setLastSavedPath(null); // Clear previous saved path
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        await showAlert('Your session has expired or you are not signed in. Please log in again.', 'Authentication required');
        return;
      }
      // Ensure report is persisted so the PDF server can find it (server looks up by taskId in density_reports)
      if (typeof formData.id === 'undefined' || formData.id === null) {
        try {
          const saved = await densityAPI.saveByTask(task.id, formData);
          setFormData(saved);
          setSaveStatus('saved');
          setLastSaved(new Date());
        } catch (saveErr: any) {
          const saveMsg = saveErr.response?.data?.error || saveErr.message || 'Save failed';
          setError(saveMsg);
          await showAlert(
            `The report must be saved before a PDF can be generated.\n\nPlease save the form, then use Download PDF again.\n\nDetails: ${saveMsg}`,
            'Save required'
          );
          return;
        }
      }

      const pdfUrl = getApiPathPrefix() + `/pdf/density/${task.id}`;

      const response = await fetch(pdfUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';

      // Check if response is JSON (new format with save info)
      if (contentType.includes('application/json')) {
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to generate PDF');
        }

        if (result.saved && result.savedPath) {
          setLastSavedPath(result.savedPath);
          setError('');
          await showAlert('The PDF was created successfully.', 'PDF ready');
        } else if (result.saveError) {
          setError(`PDF generated but save failed: ${result.saveError}`);
          await showAlert(
            `The PDF was generated, but saving the file to the server folder failed.\n\nDetails: ${result.saveError}\n\nThe PDF will still download to your device.`,
            'PDF generated'
          );
        }

        if (result.pdfBase64) {
          const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const filename = result.fileName || `density-report-${task.projectNumber}-${task.id}.pdf`;
          const { saveFileToChosenFolder } = await import('../utils/browserFolder');
          const savedToFolder = await saveFileToChosenFolder(filename, blob, task.projectNumber, user?.tenantId);
          if (savedToFolder) setLastSavedPath(`(saved to chosen folder)`);

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
        return;
      }

      // Legacy support: Handle PDF response (if backend still returns PDF directly)
      const blob = await response.blob();
      const filename = `density-report-${task.projectNumber}-${task.id}.pdf`;
      const { saveFileToChosenFolder } = await import('../utils/browserFolder');
      await saveFileToChosenFolder(filename, blob, task.projectNumber, user?.tenantId);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('PDF download error:', err);
      const errorMessage = err.message || 'Unknown error';
      setError(errorMessage);
      await showAlert(`The PDF could not be downloaded.\n\nDetails: ${errorMessage}`, 'PDF error');
    }
  };

  if (loading) {
    return <div className="density-form-loading">Loading report...</div>;
  }

  if (error && !formData) {
    return (
      <div className="density-form-error">
        <p>{error}</p>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    );
  }

  if (!formData || !task) {
    return <div className="density-form-error">Report not found.</div>;
  }

  const canEdit =
    task.status !== 'APPROVED' &&
    (isStaffReviewer() ||
      (task.assignedTechnicianId === user?.id && task.status !== 'READY_FOR_REVIEW'));
  const isReadyForReview = task.status === 'READY_FOR_REVIEW';
  const _isApproved = task.status === 'APPROVED';

  return (
    <div className="density-report-form">
      <header className="density-form-header">
        <h1>In-Place Moisture Density Test Results</h1>
        <div className="header-actions">
          <ProjectHomeButton
            projectId={task.projectId}
            onSave={flushAndSave}
            saving={saving}
          />
          {saveStatus === 'saving' && <span className="save-status">Saving...</span>}
          {saveStatus === 'saved' && <span className="save-status saved">Saved {lastSaved?.toLocaleTimeString()}</span>}
          {saveStatus === 'idle' && lastSaved && <span className="save-status">Last saved: {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleDownloadPdf} className="pdf-button">Download PDF</button>
          {lastSavedPath && (
            <div className="pdf-saved-confirmation" style={{ marginTop: '10px', padding: '10px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px', color: '#155724' }}>
              PDF saved.
            </div>
          )}
          {canEdit && (
            <>
              {!isStaffReviewer() ? (
                <>
                  <button onClick={handleSaveUpdate} disabled={saving} className="save-button">
                    {saving ? 'Saving...' : 'Save Update'}
                  </button>
                  <button onClick={handleSendToAdmin} className="send-button">Send Update to Admin</button>
                </>
              ) : (
                <button onClick={handleManualSave} disabled={saving} className="save-button">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </>
          )}
          {isStaffReviewer() && isReadyForReview && (
            <>
              <button onClick={handleApprove} className="approve-button">Approve</button>
              <button type="button" onClick={() => setRejectModalOpen(true)} className="reject-button">Reject</button>
            </>
          )}
          {isStaffReviewer() && task.status === 'APPROVED' && (
            <button
              type="button"
              onClick={() => void openUnapproveModal()}
              disabled={unapproveLoading}
              className="reject-button"
            >
              {unapproveLoading ? 'Loading…' : 'Unapprove'}
            </button>
          )}
          <button onClick={() => navigate(-1)} className="back-button">Back</button>
        </div>
      </header>

      <div className="density-form-content">
        {/* Header Section */}
        <div className="form-section header-section">
          <h2>Report Header</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Project Name / Address</label>
              <input type="text" value={formData.projectName || ''} disabled className="readonly" />
            </div>
            <div className="form-group">
              <label>Project Number</label>
              <input type="text" value={formData.projectNumber || ''} disabled className="readonly" />
            </div>
            <div className="form-group">
              <label>Client Name</label>
              <input
                type="text"
                value={formData.clientName || ''}
                onChange={(e) => updateField('clientName', e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="form-group">
              <label>Date Performed</label>
              <input
                type="date"
                value={formData.datePerformed || ''}
                onChange={(e) => updateField('datePerformed', e.target.value)}
                disabled={!canEdit}
              />
            </div>
            {/* Structure field — single mode only */}
            {(() => {
              const isMultiStructure = formData.testRows.some(r => r.type === 'section');
              const soilSpecOptions = formData.projectSoilSpecs && typeof formData.projectSoilSpecs === 'object' && !Array.isArray(formData.projectSoilSpecs)
                ? Object.keys(formData.projectSoilSpecs)
                : [];
              return isMultiStructure ? (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#2c5282', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' }}>
                      Multi-Structure Mode
                    </span>
                    {canEdit && (
                      <button type="button" onClick={switchToSingleStructure}
                        style={{ fontSize: '12px', padding: '2px 8px', cursor: 'pointer', borderRadius: '3px', border: '1px solid #6c757d', background: '#f8f9fa' }}>
                        ↩ Switch to Single Structure
                      </button>
                    )}
                  </label>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Structure</span>
                      {canEdit && (
                        <button type="button" onClick={switchToMultiStructure}
                          style={{ fontSize: '11px', padding: '1px 6px', cursor: 'pointer', borderRadius: '3px', border: '1px solid #2c5282', background: '#ebf4ff', color: '#2c5282' }}>
                          + Multi-Structure
                        </button>
                      )}
                    </label>
                    <select
                      value={formData.structureType || formData.structure || ''}
                      onChange={(e) => handleStructureChange(e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">Select Structure...</option>
                      {soilSpecOptions.length === 0
                        ? <option value="" disabled>No soil specs defined — configure in Project Details</option>
                        : soilSpecOptions.map(type => {
                            const soilRow = formData.projectSoilSpecs?.[type] as SoilSpecRow | undefined;
                            return <option key={type} value={type}>{structureTypeDisplayLabel(type, soilRow?.otherDetails)}</option>;
                          })
                      }
                    </select>
                    {formData.structureType && formData.projectSoilSpecs && !formData.projectSoilSpecs[formData.structureType] && (
                      <small style={{ color: '#dc3545', display: 'block', marginTop: '4px' }}>
                        No soil specs set for this structure in project setup.
                      </small>
                    )}
                  </div>
                  {(formData.structureType || formData.structure) && (
                    <div className="form-group">
                      <label>Structure Description</label>
                      <input
                        type="text"
                        value={formData.structureDescription || ''}
                        onChange={(e) => updateField('structureDescription', e.target.value)}
                        placeholder="e.g. North Section 200' x 30'"
                        disabled={!canEdit}
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Test Results Table — dynamic rows, supports multi-structure sections */}
        {(() => {
          const isMultiStructure = formData.testRows.some(r => r.type === 'section');
          const soilSpecOptions = formData.projectSoilSpecs && typeof formData.projectSoilSpecs === 'object' && !Array.isArray(formData.projectSoilSpecs)
            ? Object.keys(formData.projectSoilSpecs)
            : [];
          const dataRowCount = formData.testRows.filter(r => r.type !== 'section').length;
          return (
            <div className="form-section">
              <h2>Test Results</h2>
              <div className="test-table-container">
                <table className="test-table">
                  <thead>
                    <tr>
                      <th>Test No.</th>
                      <th>Test Location</th>
                      <th>Depth/Lift</th>
                      <th>Wet Density (pcf)</th>
                      <th>Field Moisture (%)</th>
                      <th>Dry Density (pcf)</th>
                      <th>Proctor No.</th>
                      <th>% Proctor Density</th>
                      {canEdit && <th style={{ width: '32px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {formData.testRows.map((row, index) => {
                      if (row.type === 'section') {
                        return (
                          <tr key={`section-${index}`}>
                            <td colSpan={canEdit ? 9 : 8} style={{
                              background: '#2c5282', color: '#fff',
                              padding: '6px 10px', fontWeight: 600, borderColor: '#1a3a5c'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '11px', opacity: 0.8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Structure</span>
                                {canEdit ? (
                                  <select
                                    value={row.sectionStructureType || ''}
                                    onChange={(e) => updateSectionStructureType(index, e.target.value)}
                                    style={{
                                      background: 'rgba(255,255,255,0.15)', color: '#fff',
                                      border: '1px solid rgba(255,255,255,0.5)',
                                      borderRadius: '3px', padding: '2px 8px',
                                      fontSize: '13px', cursor: 'pointer',
                                      minWidth: '160px', maxWidth: '280px'
                                    }}
                                  >
                                    <option value="" style={{ background: '#2c5282' }}>Select structure type...</option>
                                    {soilSpecOptions.map(type => {
                                      const soilRow = formData.projectSoilSpecs?.[type] as SoilSpecRow | undefined;
                                      return (
                                        <option key={type} value={type} style={{ background: '#2c5282' }}>
                                          {structureTypeDisplayLabel(type, soilRow?.otherDetails)}
                                        </option>
                                      );
                                    })}
                                  </select>
                                ) : (
                                  <span style={{ fontSize: '14px', fontWeight: 700 }}>
                                    {row.sectionStructureType
                                      ? structureTypeDisplayLabel(row.sectionStructureType, (formData.projectSoilSpecs?.[row.sectionStructureType] as SoilSpecRow | undefined)?.otherDetails)
                                      : '—'}
                                  </span>
                                )}
                                {canEdit && (
                                  <button type="button" onClick={() => removeRow(index)}
                                    title="Remove this structure section"
                                    style={{
                                      marginLeft: 'auto', background: 'rgba(255,255,255,0.15)',
                                      border: '1px solid rgba(255,255,255,0.5)', color: '#fff',
                                      borderRadius: '3px', padding: '1px 8px',
                                      cursor: 'pointer', fontSize: '15px', lineHeight: '1'
                                    }}>×</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={`row-${index}`}>
                          <td style={{ textAlign: 'center', width: '46px' }}>{row.testNo}</td>
                          <td>
                            <input type="text" value={row.testLocation}
                              onChange={(e) => updateTestRow(index, 'testLocation', e.target.value)}
                              disabled={!canEdit} />
                          </td>
                          <td>
                            <div className="depth-lift-group">
                              <select value={row.depthLiftType}
                                onChange={(e) => updateTestRow(index, 'depthLiftType', e.target.value as 'DEPTH' | 'LIFT')}
                                disabled={!canEdit}>
                                <option value="DEPTH">Depth</option>
                                <option value="LIFT">Lift</option>
                              </select>
                              <input type="text" value={row.depthLiftValue}
                                onChange={(e) => updateTestRow(index, 'depthLiftValue', e.target.value)}
                                placeholder="e.g., FG" disabled={!canEdit}
                                style={{ width: '60px', marginLeft: '5px' }} />
                            </div>
                          </td>
                          <td>
                            <input type="number" step="0.1" value={row.wetDensity}
                              onChange={(e) => updateTestRow(index, 'wetDensity', e.target.value)}
                              disabled={!canEdit} />
                          </td>
                          <td>
                            <input type="number" step="0.1" value={row.fieldMoisture}
                              onChange={(e) => updateTestRow(index, 'fieldMoisture', e.target.value)}
                              disabled={!canEdit} />
                          </td>
                          <td>
                            <input type="text" value={row.dryDensity} readOnly className="calculated"
                              title="Auto-calculated: Wet Density / (1 + Field Moisture / 100)" />
                          </td>
                          <td>
                            <input type="number" min={1} max={99} step={1} className="proctor-no-input"
                              value={row.proctorNo === '' || row.proctorNo == null ? '' : row.proctorNo}
                              onChange={(e) => updateTestRow(index, 'proctorNo', e.target.value)}
                              disabled={!canEdit} placeholder="No."
                              title="Enter a Proctor number." />
                          </td>
                          <td>
                            <input type="text" value={row.percentProctorDensity} readOnly className="calculated"
                              title="Auto-calculated: (Dry Density / Max Density) * 100" />
                          </td>
                          {canEdit && (
                            <td>
                              <button type="button" onClick={() => removeRow(index)}
                                disabled={dataRowCount <= 1}
                                title="Remove row"
                                style={{
                                  background: 'none', border: 'none',
                                  color: dataRowCount <= 1 ? '#ccc' : '#dc3545',
                                  cursor: dataRowCount <= 1 ? 'default' : 'pointer',
                                  fontSize: '16px', lineHeight: '1', padding: '2px 4px'
                                }}>×</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button type="button" onClick={addDataRow}
                    style={{
                      padding: '5px 14px', fontSize: '13px', cursor: 'pointer',
                      borderRadius: '3px', border: '1px solid #6c757d',
                      background: '#f8f9fa', color: '#495057'
                    }}>+ Add Row</button>
                  <button type="button" onClick={handleAddStructureSection}
                    style={{
                      padding: '5px 14px', fontSize: '13px', cursor: 'pointer',
                      borderRadius: '3px', border: '1px solid #2c5282',
                      background: isMultiStructure ? '#2c5282' : '#ebf4ff',
                      color: isMultiStructure ? '#fff' : '#2c5282',
                      fontWeight: 600
                    }}>ST+ Add Structure</button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Proctor Summary */}
        <div className="form-section">
          <h2>Proctor Summary</h2>
          <div className="proctor-table-container">
            <table className="proctor-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '160px' }}>Proctor No.</th>
                  <th>Description</th>
                  <th>Opt. Moisture (%)</th>
                  <th>Max Density (pcf)</th>
                  {canEdit && <th style={{ width: '32px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {formData.proctors.map((proctor, index) => (
                  <tr key={index}>
                    <td>
                      {proctorTasks.length > 0 ? (
                        // Combo: dropdown for known task numbers + number input for custom
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select
                            value={proctorTasks.some(pt => pt.proctorNo === proctor.proctorNo) ? String(proctor.proctorNo) : ''}
                            onChange={(e) => { if (e.target.value) void updateProctor(index, 'proctorNo', e.target.value); }}
                            disabled={!canEdit}
                            style={{ flex: '1', minWidth: '90px', padding: '4px 2px' }}
                            title="Select from available Proctor workflow tests — auto-fills description and values"
                          >
                            <option value="">Pick...</option>
                            {proctorTasks.map(pt => (
                              <option key={pt.id} value={String(pt.proctorNo)}>
                                Proctor {pt.proctorNo}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            step={1}
                            value={proctor.proctorNo != null && proctor.proctorNo > 0 ? proctor.proctorNo : ''}
                            onChange={(e) => void updateProctor(index, 'proctorNo', e.target.value)}
                            disabled={!canEdit}
                            placeholder="#"
                            style={{ width: '44px', padding: '4px', textAlign: 'center' }}
                            title="Or type a custom Proctor number"
                          />
                        </div>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          className="proctor-no-input"
                          value={proctor.proctorNo != null && proctor.proctorNo > 0 ? proctor.proctorNo : ''}
                          onChange={(e) => void updateProctor(index, 'proctorNo', e.target.value)}
                          disabled={!canEdit}
                          placeholder="No."
                          title="Enter Proctor number"
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={proctor.description}
                        onChange={(e) => void updateProctor(index, 'description', e.target.value)}
                        readOnly={!canEdit}
                        className={!canEdit ? 'readonly' : ''}
                        title="Auto-filled from Proctor workflow when available; editable for manual entry"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={proctor.optMoisture}
                        onChange={(e) => updateProctor(index, 'optMoisture', e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={proctor.maxDensity}
                        onChange={(e) => updateProctor(index, 'maxDensity', e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                    {canEdit && (
                      <td>
                        <button
                          type="button"
                          onClick={() => removeProctorRow(index)}
                          disabled={formData.proctors.length <= 1}
                          title="Remove this proctor row"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: formData.proctors.length <= 1 ? '#ccc' : '#dc3545',
                            cursor: formData.proctors.length <= 1 ? 'default' : 'pointer',
                            fontSize: '16px',
                            lineHeight: '1',
                            padding: '2px 4px'
                          }}
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addProctorRow}
              style={{
                marginTop: '8px',
                padding: '4px 14px',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '3px',
                border: '1px solid #6c757d',
                background: '#f8f9fa',
                color: '#495057'
              }}
            >
              + Add Proctor Row
            </button>
          )}
        </div>

        {/* Specs + Instrument + Methods */}
        <div className="form-section specs-methods-section">
          <div className="specs-methods-grid">
            <div className="specs-box">
              <h3>Specs</h3>
              {(() => {
                const isMultiStructure = formData.testRows.some(r => r.type === 'section');
                if (isMultiStructure) {
                  const sectionTypes = Array.from(new Set(
                    formData.testRows
                      .filter(r => r.type === 'section' && r.sectionStructureType)
                      .map(r => r.sectionStructureType!)
                  ));
                  return (
                    <div style={{ fontSize: '12px' }}>
                      {sectionTypes.length === 0 ? (
                        <p style={{ color: '#6c757d', fontStyle: 'italic', fontSize: '12px' }}>
                          Select structure types in section headers above to see specs.
                        </p>
                      ) : sectionTypes.map(structureType => {
                        let spec: SoilSpecRow | undefined;
                        if (formData.projectSoilSpecs && typeof formData.projectSoilSpecs === 'object') {
                          spec = formData.projectSoilSpecs[structureType] as SoilSpecRow | undefined;
                          if (!spec) {
                            const lower = structureType.trim().toLowerCase();
                            for (const key of Object.keys(formData.projectSoilSpecs)) {
                              if (key.trim().toLowerCase() === lower) {
                                spec = formData.projectSoilSpecs[key] as SoilSpecRow;
                                break;
                              }
                            }
                          }
                        }
                        const normalized = normalizeSoilSpecRow(spec);
                        const densArr = normalized.densityPcts || [''];
                        const moistArr = normalized.moistureRanges || [{ min: '', max: '' }];
                        const N = Math.max(densArr.length, moistArr.length, 1);
                        const label = structureTypeDisplayLabel(structureType, spec?.otherDetails);
                        return (
                          <div key={structureType} style={{ marginBottom: '8px', borderLeft: '3px solid #2c5282', paddingLeft: '8px' }}>
                            <div style={{ fontWeight: 700, color: '#2c5282', marginBottom: '3px', fontSize: '12px' }}>{label}</div>
                            {Array.from({ length: N }, (_, i) => {
                              const d = densArr[i] || '—';
                              const m = moistArr[i] || {};
                              const mStr = (m.min && m.max) ? `${m.min} – ${m.max}` : (m.min || m.max || '—');
                              return (
                                <div key={i} style={{ color: '#333', lineHeight: '1.6', fontSize: '11px' }}>
                                  {N > 1 ? `(${String.fromCharCode(97 + i)}) ` : ''}Dens: {d}% | Moist: {mStr}%
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                // Single-structure mode — editable
                const N = getSpecColumnCount();
                const specLabel = (i: number) => (N > 1 ? `(${String.fromCharCode(97 + i)}) ` : '');
                const densArr = effectiveDensitySpecPercents(formData);
                const moistArr = effectiveMoistSpecRanges(formData);
                const densPadded = [...densArr];
                const moistPadded = [...moistArr];
                while (densPadded.length < N) densPadded.push('');
                while (moistPadded.length < N) moistPadded.push({ min: '', max: '' });
                return (
                  <div className="specs-dynamic-columns">
                    <div className="specs-row specs-density-row">
                      {Array.from({ length: N }, (_, i) => (
                        <div key={`d-${i}`} className="form-group specs-col">
                          <label>{specLabel(i)}Dens. (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={densPadded[i] ?? ''}
                            onChange={(e) => updateSpecDensity(i, e.target.value)}
                            disabled={!canEdit}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="specs-row specs-moisture-row">
                      {Array.from({ length: N }, (_, i) => (
                        <div key={`m-${i}`} className="form-group specs-col specs-moisture-col">
                          <label>{specLabel(i)}Moist. (%) Range</label>
                          <div className="moisture-minmax">
                            <input type="text" placeholder="Min"
                              value={moistPadded[i]?.min ?? ''}
                              onChange={(e) => updateSpecMoisture(i, 'min', e.target.value)}
                              disabled={!canEdit} />
                            <span>-</span>
                            <input type="text" placeholder="Max"
                              value={moistPadded[i]?.max ?? ''}
                              onChange={(e) => updateSpecMoisture(i, 'max', e.target.value)}
                              disabled={!canEdit} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="instrument-box">
              <h3>Instrument</h3>
              <div className="form-group">
                <label>Gauge No.</label>
                <input
                  type="text"
                  value={formData.gaugeNo}
                  onChange={(e) => updateField('gaugeNo', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Std. Density Count</label>
                <input
                  type="number"
                  value={formData.stdDensityCount}
                  onChange={(e) => updateField('stdDensityCount', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Std. Moist Count</label>
                <input
                  type="number"
                  value={formData.stdMoistCount}
                  onChange={(e) => updateField('stdMoistCount', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Trans. Depth (in.)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.transDepthIn}
                  onChange={(e) => updateField('transDepthIn', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="methods-box">
              <h3>Test Methods</h3>
              <div className="checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.methodD2922}
                    onChange={(e) => updateField('methodD2922', e.target.checked)}
                    disabled={!canEdit}
                  />
                  ASTM D 2922
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.methodD3017}
                    onChange={(e) => updateField('methodD3017', e.target.checked)}
                    disabled={!canEdit}
                  />
                  ASTM D 3017
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.methodD698}
                    onChange={(e) => updateField('methodD698', e.target.checked)}
                    disabled={!canEdit}
                  />
                  ASTM D 698
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Remarks + Tech + Time + Disclaimer */}
        <div className="form-section footer-section">
          <div className="form-group">
            <label>Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
              rows={4}
              disabled={!canEdit}
            />
          </div>
          <div className="footer-fields">
            <div className="form-group">
              <label>Tech</label>
              {technicians.length > 0 ? (
                <select
                  value={formData.technicianId || (task?.assignedTechnicianId || '')}
                  onChange={(e) => {
                    const techId = e.target.value ? parseInt(e.target.value) : undefined;
                    const selectedTech = technicians.find(t => t.id === techId);
                    setFormData({
                      ...formData,
                      technicianId: techId,
                      techName: selectedTech ? (selectedTech.name || selectedTech.email) : ''
                    });
                    if (formData) {
                      debouncedSave({
                        ...formData,
                        technicianId: techId,
                        techName: selectedTech ? (selectedTech.name || selectedTech.email) : ''
                      });
                    }
                  }}
                  disabled={!canEdit}
                >
                  <option value="">Select Technician</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.email}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.techName}
                  onChange={(e) => updateField('techName', e.target.value)}
                  disabled={!canEdit}
                />
              )}
            </div>
            <div className="form-group">
              <label>Time</label>
              <input
                type="time"
                value={formData.timeStr}
                onChange={(e) => updateField('timeStr', e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="disclaimer">
            <p><em>This report is based on field measurements and laboratory analysis. Results are subject to standard testing procedures and industry standards.</em></p>
          </div>
        </div>

        {/* Action Buttons at Bottom */}
        <div className="form-actions-bottom">
          {canEdit && (
            <>
              {!isStaffReviewer() ? (
                <>
                  <button onClick={handleSaveUpdate} disabled={saving} className="save-button">
                    {saving ? 'Saving...' : 'Save Update'}
                  </button>
                  <button onClick={handleSendToAdmin} className="send-button">Send Update to Admin</button>
                </>
              ) : (
                <button onClick={handleManualSave} disabled={saving} className="save-button">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </>
          )}
          {isStaffReviewer() && isReadyForReview && (
            <>
              <button onClick={handleApprove} className="approve-button">Approve</button>
              <button type="button" onClick={() => setRejectModalOpen(true)} className="reject-button">Reject</button>
            </>
          )}
          {isStaffReviewer() && task.status === 'APPROVED' && (
            <button
              type="button"
              onClick={() => void openUnapproveModal()}
              disabled={unapproveLoading}
              className="reject-button"
            >
              {unapproveLoading ? 'Loading…' : 'Unapprove'}
            </button>
          )}
          <button onClick={handleDownloadPdf} className="pdf-button">Download PDF</button>
          <button onClick={() => navigate(-1)} className="back-button">Back</button>
        </div>

        {/* History / Audit Trail (NOT printable) */}
        {history.length > 0 && (
          <div className="history-section no-print">
            <h2>History / Audit Trail</h2>
            <div className="history-list">
              {history.map((entry) => {
                const date = new Date(entry.timestamp);
                const actionLabels: { [key: string]: string } = {
                  'SUBMITTED': 'submitted report for review',
                  'APPROVED': 'approved report',
                  'REJECTED': 'rejected report',
                  'REASSIGNED': 'reassigned task',
                  'STATUS_CHANGED': 'changed status'
                };
                let actionLabel = actionLabels[entry.actionType] || entry.actionType.toLowerCase();
                // Format the message according to requirements
                let message = '';
                if (entry.actionType === 'SUBMITTED') {
                  message = `${entry.actorName} submitted report for review`;
                } else if (entry.actionType === 'APPROVED') {
                  message = `${entry.actorName} approved report`;
                } else if (entry.actionType === 'UNAPPROVED') {
                  message = `${entry.actorName} unapproved report${entry.note ? `: ${entry.note}` : ''}`;
                } else if (entry.actionType === 'REJECTED') {
                  message = `${entry.actorName} rejected report${entry.note ? `: ${entry.note}` : ''}`;
                } else if (entry.actionType === 'REASSIGNED') {
                  message = entry.note || `Task reassigned by ${entry.actorName}`;
                } else {
                  message = `${entry.actorName} (${entry.actorRole}) ${actionLabel}`;
                }
                
                return (
                  <div key={entry.id} className="history-entry">
                    <div className="history-timestamp">
                      {date.toLocaleString()}
                    </div>
                    <div className="history-content">
                      {message}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <RejectTaskModal
        isOpen={rejectModalOpen}
        contextLine={task ? `${task.projectNumber ?? '—'} · ${taskTypeLabel(task)}` : undefined}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={async (payload) => {
          if (!task) return;
          await tasksAPI.reject(task.id, payload);
          await loadData();
        }}
      />
      <UnapproveTaskModal
        isOpen={unapproveOpen}
        contextLine={unapproveContextLine}
        alreadySentToClient={alreadySentToClient}
        onClose={closeUnapproveModal}
        onSubmit={submitUnapprove}
      />
    </div>
  );
};

export default DensityReportForm;

