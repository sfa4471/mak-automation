import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { densityAPI, DensityReport, TestRow, ProctorRow } from '../api/density';
import { tasksAPI, Task, TaskHistoryEntry, ProctorTask } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { authAPI, User } from '../api/auth';
import { SoilSpecRow } from '../api/projects';
import { proctorAPI } from '../api/proctor';
import ProjectHomeButton from './ProjectHomeButton';
import './DensityReportForm.css';

// Note: We no longer use fallback structure types - only show structure types
// that are actually defined in the project's Soil Specs section

/**
 * Format structure name for display
 * Converts "_building_pad" -> "Building Pad"
 * Handles underscores, leading underscores, and capitalization
 */
const formatStructureName = (structureName: string): string => {
  if (!structureName) return '';
  
  return structureName
    .replace(/^_+/, '') // Remove leading underscores
    .replace(/_/g, ' ') // Replace underscores with spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
};

const DensityReportForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
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
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [proctorTasks, setProctorTasks] = useState<ProctorTask[]>([]);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const proctorCacheRef = useRef<{ [key: string]: any }>({}); // Cache proctor fetches by "projectId:proctorNo"
  const hasAutoPopulatedRef = useRef<boolean>(false); // Track if we've already auto-populated on load
  const latestFormDataRef = useRef<DensityReport | null>(null); // Track latest formData for immediate saves

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      const [taskData, reportData] = await Promise.all([
        tasksAPI.get(taskId),
        densityAPI.getByTask(taskId)
      ]);
      setTask(taskData);
      
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
        
        // Auto-populate specs if structure type is already selected but specs are missing
        const structureType = reportData.structureType || reportData.structure;
        if (structureType && reportData.projectSoilSpecs && 
            typeof reportData.projectSoilSpecs === 'object' && 
            !Array.isArray(reportData.projectSoilSpecs)) {
          const soilSpecs = reportData.projectSoilSpecs;
          const selectedSpec: SoilSpecRow | undefined = soilSpecs[structureType] as SoilSpecRow | undefined;
          
          // Only auto-populate if specs are missing but structure type is set
          if (selectedSpec && (!reportData.densSpecPercent || !reportData.moistSpecMin)) {
            const densityPct = selectedSpec.densityPct;
            const specMin = selectedSpec.moistureRange?.min || '';
            const specMax = selectedSpec.moistureRange?.max || '';
            
            // Update the initialized data with specs
            if (densityPct && !reportData.densSpecPercent) {
              initializedData.densSpecPercent = String(densityPct);
              initializedData.specDensityPct = String(densityPct);
            }
            if ((specMin || specMax) && !reportData.moistSpecMin) {
              initializedData.moistSpecMin = specMin;
              initializedData.moistSpecMax = specMax;
              if (specMin && specMax) {
                setMoistSpecRange(`${specMin} to ${specMax}`);
              } else if (specMin || specMax) {
                setMoistSpecRange(specMin || specMax);
              }
            }
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

      // Load Proctor tasks for this project (for dropdown)
      if (taskData?.projectId) {
        try {
          const proctors = await tasksAPI.getProctorsForProject(taskData.projectId);
          setProctorTasks(proctors);
        } catch (err) {
          console.error('Error loading proctor tasks:', err);
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

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
    const proctorNum = parseInt(proctorNo);
    
    // Validate inputs
    if (isNaN(dry) || isNaN(proctorNum) || proctorNum < 1 || proctorNum > 6) return '';
    
    // Lookup the proctor by Proctor No (array is 0-indexed, so Proctor No 6 = index 5)
    const proctor = proctors[proctorNum - 1];
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

    try {
      // Fetch Proctor data by projectId + proctorNo
      const proctorData = await proctorAPI.getByProjectAndProctorNo(task.projectId, proctorNo);
      
      // Use soilClassificationText if available, otherwise fallback to soilClassification
      const soilClassificationText = proctorData?.soilClassificationText || proctorData?.soilClassification || '';
      const descriptionLabel = soilClassificationText 
        ? `Soil ${proctorNo}: ${soilClassificationText}`
        : `Soil ${proctorNo}`;
      
      // Auto-populate the row
      const optMoisture = proctorData?.optMoisturePct !== null && proctorData?.optMoisturePct !== undefined
        ? String(proctorData.optMoisturePct)
        : '';
      
      const maxDensity = proctorData?.maxDryDensityPcf !== null && proctorData?.maxDryDensityPcf !== undefined
        ? String(proctorData.maxDryDensityPcf)
        : '';
      
      const result = {
        description: descriptionLabel,
        optMoisture: optMoisture,
        maxDensity: maxDensity,
        soilClassificationText: soilClassificationText
      };

      // Cache the result
      proctorCacheRef.current[cacheKey] = result;
      
      return result;
    } catch (err: any) {
      // Only log as error if it's not a 404 (expected when proctor doesn't exist)
      if (err.response?.status === 404) {
        // Proctor not found - this is expected if the proctor hasn't been created yet
        // Silently return null without logging an error
        return null;
      }
      // For other errors, log them
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

  const updateField = (field: keyof DensityReport, value: any) => {
    if (!formData) return;
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    latestFormDataRef.current = updatedData; // Update ref immediately
    debouncedSave(updatedData);
  };

  // Handle structure selection - auto-fill specs from project soil specs (for density reports)
  const handleStructureChange = (structureType: string) => {
    if (!formData) return;
    
    let updatedData = { ...formData, structureType, structure: structureType };
    
    // Auto-fill specs from project soil specs if available
    if (formData.projectSoilSpecs && typeof formData.projectSoilSpecs === 'object' && !Array.isArray(formData.projectSoilSpecs)) {
      const soilSpecs = formData.projectSoilSpecs;
      const selectedSpec: SoilSpecRow | undefined = soilSpecs[structureType] as SoilSpecRow | undefined;
      
      // Debug logging
      console.log('🔍 Structure selected:', structureType);
      console.log('🔍 Available soil specs keys:', Object.keys(soilSpecs));
      console.log('🔍 Selected spec:', selectedSpec);
      
      // Auto-fill specs if available
      if (selectedSpec) {
        // Set density percent - use type-safe property access
        const densityPct = selectedSpec.densityPct;
        if (densityPct !== undefined && densityPct !== null && densityPct !== '') {
          updatedData = { ...updatedData, densSpecPercent: String(densityPct), specDensityPct: String(densityPct) };
          console.log('✅ Set Dens. (%):', densityPct);
        }
        
        // Set moisture range
        if (selectedSpec.moistureRange) {
          const min = selectedSpec.moistureRange.min || '';
          const max = selectedSpec.moistureRange.max || '';
          updatedData = { ...updatedData, moistSpecMin: min, moistSpecMax: max };
          
          // Update moisture range display
          if (min && max) {
            setMoistSpecRange(`${min} to ${max}`);
            console.log('✅ Set Moist. (%) Range:', `${min} to ${max}`);
          } else if (min || max) {
            setMoistSpecRange(min || max);
            console.log('✅ Set Moist. (%) Range:', min || max);
          } else {
            setMoistSpecRange('');
          }
        } else {
          // Clear moisture range if not in spec
          updatedData = { ...updatedData, moistSpecMin: '', moistSpecMax: '' };
          setMoistSpecRange('');
        }
      } else {
        // Clear specs if structure has no specs
        console.warn('⚠️ No soil specs found for structure type:', structureType);
        updatedData = { ...updatedData, densSpecPercent: '', specDensityPct: '', moistSpecMin: '', moistSpecMax: '' };
        setMoistSpecRange('');
      }
    } else {
      // No project soil specs available
      console.warn('⚠️ No project soil specs available');
      updatedData = { ...updatedData, densSpecPercent: '', specDensityPct: '', moistSpecMin: '', moistSpecMax: '' };
      setMoistSpecRange('');
    }
    
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
      
      // Ensure header fields are included in save payload
      const savePayload = {
        ...data,
        clientName: data.clientName || '',
        datePerformed: data.datePerformed || '',
        structure: data.structure || data.structureType || '',
        structureType: data.structureType || data.structure || ''
      };
      
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
        isAdmin() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
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
      await densityAPI.saveByTask(task.id, formData);
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
      await densityAPI.saveByTask(task.id, formData, 'IN_PROGRESS_TECH');
      await tasksAPI.updateStatus(task.id, 'IN_PROGRESS_TECH');
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      alert('Update saved! Status set to "In Progress"');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save update');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToAdmin = async () => {
    if (!formData || !task) return;
    if (!window.confirm('Send this report to admin for review? You will not be able to edit it until admin responds.')) {
      return;
    }
    await saveData(formData, true, 'READY_FOR_REVIEW');
    navigate('/technician/dashboard');
  };

  const handleApprove = async () => {
    if (!window.confirm('Approve this report?')) return;
    try {
      await tasksAPI.approve(task!.id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve report');
    }
  };

  // Helper function to convert MM-DD-YYYY to YYYY-MM-DD
  const convertToISO = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // Try to parse MM-DD-YYYY format
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      // Validate it's a valid date
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return `${year}-${month}-${day}`;
      }
    }
    // If already in YYYY-MM-DD format, return as-is
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
    return null;
  };

  const handleReject = async () => {
    const remarks = prompt('Enter rejection remarks (required):');
    if (!remarks || remarks.trim() === '') return;
    const resubmissionDateInput = prompt('Enter resubmission due date (MM-DD-YYYY, required):');
    if (!resubmissionDateInput || resubmissionDateInput.trim() === '') return;
    
    const resubmissionDate = convertToISO(resubmissionDateInput.trim());
    if (!resubmissionDate) {
      alert('Invalid date format. Please use MM-DD-YYYY format.');
      return;
    }
    
    try {
      await tasksAPI.reject(task!.id, { rejectionRemarks: remarks, resubmissionDueDate: resubmissionDate });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject report');
    }
  };

  const handleDownloadPdf = async () => {
    if (!task) return;
    setLastSavedPath(null); // Clear previous saved path
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }
      const { getApiBaseUrl } = require('../utils/apiUrl');
      const baseUrl = getApiBaseUrl();
      const pdfUrl = `${baseUrl}/api/pdf/density/${task.id}`;
      
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
          const message = `PDF saved successfully!\n\nLocation: ${result.savedPath}\nFilename: ${result.fileName}`;
          alert(message);
        } else if (result.saveError) {
          setError(`PDF generated but save failed: ${result.saveError}`);
          alert(`PDF generated but save failed: ${result.saveError}\n\nPDF will still be downloaded.`);
        }

        if (result.pdfBase64) {
          const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const filename = result.fileName || `density-report-${task.projectNumber}-${task.id}.pdf`;

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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `density-report-${task.projectNumber}-${task.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('PDF download error:', err);
      const errorMessage = err.message || 'Unknown error';
      setError(errorMessage);
      alert('Failed to download PDF: ' + errorMessage);
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

  const canEdit = task.status !== 'READY_FOR_REVIEW' && task.status !== 'APPROVED';
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
              PDF saved to: <strong>{lastSavedPath}</strong>
            </div>
          )}
          {canEdit && (
            <>
              {!isAdmin() ? (
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
          {isAdmin() && isReadyForReview && (
            <>
              <button onClick={handleApprove} className="approve-button">Approve</button>
              <button onClick={handleReject} className="reject-button">Reject</button>
            </>
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
            <div className="form-group">
              <label>Structure</label>
              <select
                value={formData.structureType || formData.structure || ''}
                onChange={(e) => handleStructureChange(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Select Structure...</option>
                {(() => {
                  // For Density Measurement reports, ONLY use soil specs (not concrete specs)
                  // Structure types are ONLY the keys that exist in the soilSpecs object from Project Details
                  let structureTypes: string[] = [];
                  
                  // Use soil specs ONLY - these are the structure types defined in the Soil Specs section
                  // of the Project Details page
                  if (formData.projectSoilSpecs && 
                      typeof formData.projectSoilSpecs === 'object' && 
                      formData.projectSoilSpecs !== null &&
                      !Array.isArray(formData.projectSoilSpecs)) {
                    const soilSpecKeys = Object.keys(formData.projectSoilSpecs);
                    if (soilSpecKeys.length > 0) {
                      structureTypes = soilSpecKeys;
                      console.log('✅ Using structure types from Soil Specs (Project Details):', structureTypes);
                    } else {
                      console.warn('⚠️ No soil specs defined in Project Details. Please add soil specs in the Project Details page.');
                    }
                  } else {
                    console.warn('⚠️ projectSoilSpecs missing or invalid. Please ensure soil specs are defined in Project Details.');
                  }
                  
                  // Do NOT use fallback - only show structure types that are actually defined in Project Details
                  // This ensures the dropdown only shows what's configured in the Soil Specs section
                  
                  if (structureTypes.length === 0) {
                    return (
                      <option value="" disabled>
                        No soil specs defined - Please configure in Project Details
                      </option>
                    );
                  }
                  
                  return structureTypes.map((type) => (
                    <option key={type} value={type}>{formatStructureName(type)}</option>
                  ));
                })()}
              </select>
              {formData.structureType && formData.projectSoilSpecs && !formData.projectSoilSpecs[formData.structureType] && (
                <small style={{ color: '#dc3545', display: 'block', marginTop: '4px' }}>
                  No soil specs set for this structure in project setup.
                </small>
              )}
            </div>
          </div>
        </div>

        {/* Main Test Table - 19 rows */}
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
                </tr>
              </thead>
              <tbody>
                {formData.testRows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.testNo}</td>
                    <td>
                      <input
                        type="text"
                        value={row.testLocation}
                        onChange={(e) => updateTestRow(index, 'testLocation', e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td>
                      <div className="depth-lift-group">
                        <select
                          value={row.depthLiftType}
                          onChange={(e) => updateTestRow(index, 'depthLiftType', e.target.value as 'DEPTH' | 'LIFT')}
                          disabled={!canEdit}
                        >
                          <option value="DEPTH">Depth</option>
                          <option value="LIFT">Lift</option>
                        </select>
                        <input
                          type="text"
                          value={row.depthLiftValue}
                          onChange={(e) => updateTestRow(index, 'depthLiftValue', e.target.value)}
                          placeholder="e.g., FG"
                          disabled={!canEdit}
                          style={{ width: '60px', marginLeft: '5px' }}
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={row.wetDensity}
                        onChange={(e) => updateTestRow(index, 'wetDensity', e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={row.fieldMoisture}
                        onChange={(e) => updateTestRow(index, 'fieldMoisture', e.target.value)}
                        disabled={!canEdit}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.dryDensity}
                        readOnly
                        className="calculated"
                        title="Auto-calculated: Wet Density / (1 + Field Moisture / 100)"
                      />
                    </td>
                    <td>
                      <select
                        value={row.proctorNo}
                        onChange={(e) => updateTestRow(index, 'proctorNo', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {proctorTasks.map((pt) => (
                          <option key={pt.id} value={String(pt.proctorNo)}>Proctor #{pt.proctorNo}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.percentProctorDensity}
                        readOnly
                        className="calculated"
                        title="Auto-calculated: (Dry Density / Max Density) * 100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Proctor Summary Table - 6 rows */}
        <div className="form-section">
          <h2>Proctor Summary</h2>
          <div className="proctor-table-container">
            <table className="proctor-table">
              <thead>
                <tr>
                  <th>Proctor No.</th>
                  <th>Description</th>
                  <th>Opt. Moisture</th>
                  <th>Max Density</th>
                </tr>
              </thead>
              <tbody>
                {formData.proctors.map((proctor, index) => (
                  <tr key={index}>
                    <td>
                      <select
                        value={proctor.proctorNo.toString()}
                        onChange={(e) => updateProctor(index, 'proctorNo', e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {proctorTasks.map((pt) => (
                          <option key={pt.id} value={String(pt.proctorNo)}>
                            {pt.proctorNo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={proctor.description}
                        readOnly
                        className="calculated"
                        title="Auto-generated from Proctor No and Soil Classification"
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Specs + Instrument + Methods */}
        <div className="form-section specs-methods-section">
          <div className="specs-methods-grid">
            <div className="specs-box">
              <h3>Specs</h3>
              <div className="form-group">
                <label>Dens. (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.densSpecPercent}
                  onChange={(e) => updateField('densSpecPercent', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Moist. (%) Range</label>
                <input
                  type="text"
                  placeholder="e.g., -2 to +2"
                  value={moistSpecRange}
                  onChange={(e) => updateMoistSpecRange(e.target.value)}
                  disabled={!canEdit}
                />
                <small>Enter range as text (e.g., "-2 to +2" or "-2 to 2")</small>
              </div>
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
              {!isAdmin() ? (
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
          {isAdmin() && isReadyForReview && (
            <>
              <button onClick={handleApprove} className="approve-button">Approve</button>
              <button onClick={handleReject} className="reject-button">Reject</button>
            </>
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
    </div>
  );
};

export default DensityReportForm;

