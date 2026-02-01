import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { workPackagesAPI, WP1Data, Cylinder } from '../api/workpackages';
import { wp1API } from '../api/wp1';
import { tasksAPI, Task, TaskHistoryEntry } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { authAPI, User } from '../api/auth';
import { SoilSpecs, projectsAPI } from '../api/projects';
import ProjectHomeButton from './ProjectHomeButton';
import './WP1Form.css';

const WP1Form: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const isTaskRoute = location.pathname.startsWith('/task/');
  const [workPackage, setWorkPackage] = useState<any>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<WP1Data>({
    ...(!isTaskRoute ? { workPackageId: parseInt(id || '0') } : { taskId: parseInt(id || '0') }),
    cylinders: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [soilSpecs, setSoilSpecs] = useState<SoilSpecs>({});
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');

  // Helper function to calculate Date Tested from Placement Date + Age Days
  const calculateDateTested = React.useCallback((placementDateStr: string | undefined, ageDaysStr: string | undefined): string => {
    if (!placementDateStr || !ageDaysStr) return '';
    
    const ageDays = parseInt(ageDaysStr);
    if (isNaN(ageDays) || ageDays < 0) return '';
    
    try {
      // Parse placement date as local date (YYYY-MM-DD) to avoid timezone shifts
      const [year, month, day] = placementDateStr.split('-').map(Number);
      const placementDate = new Date(year, month - 1, day);
      if (isNaN(placementDate.getTime())) return '';
      
      const testDate = new Date(placementDate);
      testDate.setDate(testDate.getDate() + ageDays);
      
      // Format as YYYY-MM-DD string (local date, no timezone conversion)
      const testYear = testDate.getFullYear();
      const testMonth = String(testDate.getMonth() + 1).padStart(2, '0');
      const testDay = String(testDate.getDate()).padStart(2, '0');
      
      return `${testYear}-${testMonth}-${testDay}`;
    } catch (e) {
      return '';
    }
  }, []);

  const createInitialCylinders = (placementDateStr?: string): Cylinder[] => {
    const cylinders: Cylinder[] = [];
    for (let i = 1; i <= 5; i++) {
      // Set default age: Row 1 = 7, Rows 2-4 = 28, Row 5 = 56
      const defaultAge = i === 1 ? '7' : (i >= 2 && i <= 4 ? '28' : '56');
      
      // Calculate dateTested from placementDate + age
      const dateTested = calculateDateTested(placementDateStr, defaultAge);

      // Calculate cross-sectional area with default diameter of 4
      const defaultDiameter = 4;
      const crossSectionalArea = (3.143 * 0.25 * Math.pow(defaultDiameter, 2)).toFixed(2);
      
      cylinders.push({
        cylinderNumber: i,
        age: defaultAge,
        dateTested: dateTested, // Computed, not hard-coded
        avgLength: '8',
        avgWidth: '4',
        avgDiameter: '4',
        crossSectionalArea: crossSectionalArea,
        totalLoad: undefined,
        compressiveStrength: undefined,
        fractureType: '',
        // Specimen info only on first cylinder of each set
        specimenNo: i === 1 ? '' : undefined,
        specimenQty: i === 1 ? '5' : undefined,
        specimenType: i === 1 ? '' : undefined,
      });
    }
    return cylinders;
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isTaskRoute]);

  // Recalculate dateTested for all cylinders when placementDate changes
  useEffect(() => {
    if (formData && formData.placementDate && formData.cylinders && formData.cylinders.length > 0) {
      const updatedCylinders = formData.cylinders.map(cyl => ({
        ...cyl,
        dateTested: calculateDateTested(formData.placementDate, cyl.age)
      }));
      
      // Only update if any dateTested values changed (avoid infinite loop)
      const hasChanges = updatedCylinders.some((cyl, idx) => 
        cyl.dateTested !== formData.cylinders[idx]?.dateTested
      );
      
      if (hasChanges) {
        const newData = { ...formData, cylinders: updatedCylinders };
        setFormData(newData);
        // Don't trigger save here - let the user's change trigger the save
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData?.placementDate, calculateDateTested]); // Depend on placementDate and calculateDateTested

  const loadData = async () => {
    try {
      let wpOrTask: any = null;
      let data: WP1Data;

      if (isTaskRoute) {
        // Load from task
        const [taskData, wp1Data] = await Promise.all([
          tasksAPI.get(parseInt(id!)),
          wp1API.getByTask(parseInt(id!))
        ]);
        setTask(taskData);
        wpOrTask = taskData;
        data = wp1Data;
      } else {
        // Load from workpackage (backward compatibility)
        const [wp, wp1Data] = await Promise.all([
          workPackagesAPI.get(parseInt(id!)),
          workPackagesAPI.getWP1(parseInt(id!))
        ]);
        setWorkPackage(wp);
        wpOrTask = wp;
        data = wp1Data;
      }
      
      // Load technicians list (admin only, but don't fail if not admin)
      try {
        const techs = await authAPI.listTechnicians();
        setTechnicians(techs);
      } catch (err) {
        // If not admin, just use empty list or add assigned technician
        const assignedName = wpOrTask?.assignedTechnicianName;
        const assignedId = wpOrTask?.assignedTechnicianId || wpOrTask?.assignedTo;
        const assignedEmail = wpOrTask?.assignedTechnicianEmail;
        if (assignedName && assignedId) {
          setTechnicians([{ id: assignedId, name: assignedName, email: assignedEmail || '', role: 'TECHNICIAN' }]);
        }
      }
      
      // Auto-populate specs from project if not already set
      const projectSpecs = (data as any).projectSpecs || {};
      let soilSpecsData = (data as any).soilSpecs || {};
      
      // If soilSpecs not in response, fetch project directly
      if (!soilSpecsData || Object.keys(soilSpecsData).length === 0) {
        try {
          const projectId = wpOrTask?.projectId;
          if (projectId) {
            const project = await projectsAPI.get(projectId);
            soilSpecsData = project.soilSpecs || {};
            console.log('Fetched project soilSpecs:', soilSpecsData);
            console.log('Soil Specs structure names:', Object.keys(soilSpecsData));
          }
        } catch (err) {
          console.error('Error fetching project for soilSpecs:', err);
        }
      } else {
        console.log('Soil Specs from API response:', soilSpecsData);
        console.log('Soil Specs structure names:', Object.keys(soilSpecsData));
      }
      
      setSoilSpecs(soilSpecsData);
      const updatedData = { ...data };
      
      // Log loaded task and project data
      console.log('Loaded compressive task:', {
        taskId: updatedData.taskId || updatedData.workPackageId,
        structure: updatedData.structure,
        ambientTempSpecs: updatedData.ambientTempSpecs,
        concreteTempSpecs: updatedData.concreteTempSpecs
      });
      console.log('Loaded project soilSpecs:', soilSpecsData);
      
      // Auto-populate specs from Soil Specs if structure is already selected
      if (updatedData.structure) {
        const selectedSpec = soilSpecsData[updatedData.structure];
        console.log('Selected structure:', updatedData.structure);
        console.log('SoilSpecs row found:', selectedSpec);
        
        if (selectedSpec) {
          // Explicitly map Soil Specs to canonical form keys
          // Use the actual field names from SoilSpecRow interface
          // Apply default values if missing (35-95 for ambient, 45-95 for concrete)
          const ambientTempValue = selectedSpec.ambientTempF || '35-95';
          const concreteTempValue = selectedSpec.concreteTempF || '45-95';
          const specStrengthValue = selectedSpec.specStrengthPsi || '';
          const slumpValue = selectedSpec.slump || '';
          const airContentValue = selectedSpec.airContent || '';
          
          console.log('Selected spec on load:', selectedSpec);
          console.log('Extracted on load:', {
            ambientTempF: selectedSpec.ambientTempF,
            concreteTempF: selectedSpec.concreteTempF,
            ambientTempValue,
            concreteTempValue
          });
          
          // Set canonical keys explicitly
          updatedData.ambientTempSpecs = ambientTempValue;
          updatedData.concreteTempSpecs = concreteTempValue;
          if (specStrengthValue) {
            updatedData.specStrength = specStrengthValue;
          }
          if (slumpValue) {
            updatedData.slumpSpecs = slumpValue;
          }
          if (airContentValue) {
            updatedData.airContentSpecs = airContentValue;
          }
          
          console.log('Setting ambientTempSpecs:', ambientTempValue);
          console.log('Setting concreteTempSpecs:', concreteTempValue);
          console.log('Auto-populated on load:', {
            structure: updatedData.structure,
            ambientTempSpecs: updatedData.ambientTempSpecs,
            concreteTempSpecs: updatedData.concreteTempSpecs,
            selectedSpec: selectedSpec
          });
        } else {
          console.log('No SoilSpecs row found for structure:', updatedData.structure);
          console.log('Available structure keys:', Object.keys(soilSpecsData));
        }
      } else {
        console.log('No structure selected in loaded task');
      }
      
      // Fallback: Auto-populate specStrength from specStrengthPsi if not set (legacy)
      if (!updatedData.specStrength && projectSpecs.specStrengthPsi) {
        updatedData.specStrength = projectSpecs.specStrengthPsi;
      }
      // Fallback: Auto-populate ambientTempSpecs from specAmbientTempF if not set (legacy)
      if (!updatedData.ambientTempSpecs && projectSpecs.specAmbientTempF) {
        updatedData.ambientTempSpecs = projectSpecs.specAmbientTempF;
      }
      // Fallback: Auto-populate concreteTempSpecs from specConcreteTempF if not set (legacy)
      if (!updatedData.concreteTempSpecs && projectSpecs.specConcreteTempF) {
        updatedData.concreteTempSpecs = projectSpecs.specConcreteTempF;
      }

      // Load task history (only for task routes)
      if (isTaskRoute && id) {
        try {
          const historyData = await tasksAPI.getHistory(parseInt(id));
          setHistory(historyData);
        } catch (err) {
          console.error('Error loading task history:', err);
        }
      }
      // Auto-populate slumpSpecs from specSlump if not set
      if (!updatedData.slumpSpecs && projectSpecs.specSlump) {
        updatedData.slumpSpecs = projectSpecs.specSlump;
      }
      // Auto-populate airContentSpecs from specAirContentByVolume if not set
      if (!updatedData.airContentSpecs && projectSpecs.specAirContentByVolume) {
        updatedData.airContentSpecs = projectSpecs.specAirContentByVolume;
      }

      if (updatedData.cylinders && updatedData.cylinders.length > 0) {
        // Populate default values for cylinders and recalculate dateTested
        const updatedCylinders = updatedData.cylinders.map((cyl) => {
          const needsDefaults = !cyl.avgLength || cyl.avgLength.trim() === '' || 
                                !cyl.avgWidth || cyl.avgWidth.trim() === '' || 
                                !cyl.avgDiameter || cyl.avgDiameter.trim() === '';
          
          let updatedCyl = { ...cyl };
          
          if (needsDefaults) {
            const diameter = (cyl.avgDiameter && cyl.avgDiameter.trim() !== '') ? parseFloat(cyl.avgDiameter) : 4;
            const crossSectionalArea = (3.143 * 0.25 * Math.pow(diameter, 2)).toFixed(2);
            updatedCyl = {
              ...updatedCyl,
              avgLength: (cyl.avgLength && cyl.avgLength.trim() !== '') ? cyl.avgLength : '8',
              avgWidth: (cyl.avgWidth && cyl.avgWidth.trim() !== '') ? cyl.avgWidth : '4',
              avgDiameter: (cyl.avgDiameter && cyl.avgDiameter.trim() !== '') ? cyl.avgDiameter : '4',
              crossSectionalArea: (cyl.crossSectionalArea && cyl.crossSectionalArea.trim() !== '') ? cyl.crossSectionalArea : crossSectionalArea,
            };
          }
          
          // Recalculate dateTested from placementDate + age (ensures it's always correct)
          if (updatedData.placementDate && updatedCyl.age) {
            updatedCyl.dateTested = calculateDateTested(updatedData.placementDate, updatedCyl.age);
          } else if (!updatedData.placementDate) {
            // If no placement date, clear dateTested
            updatedCyl.dateTested = '';
          }
          
          // Round totalLoad and compressiveStrength to whole numbers on load
          if (updatedCyl.totalLoad !== undefined && updatedCyl.totalLoad !== null) {
            updatedCyl.totalLoad = Math.round(updatedCyl.totalLoad);
          }
          if (updatedCyl.compressiveStrength !== undefined && updatedCyl.compressiveStrength !== null) {
            updatedCyl.compressiveStrength = Math.round(updatedCyl.compressiveStrength);
          }
          
          // Recalculate compressiveStrength from rounded totalLoad if area is available
          if (updatedCyl.totalLoad !== undefined && updatedCyl.totalLoad !== null && updatedCyl.crossSectionalArea) {
            const load = updatedCyl.totalLoad;
            const area = parseFloat(updatedCyl.crossSectionalArea);
            if (load > 0 && area > 0) {
              updatedCyl.compressiveStrength = Math.round(load / area);
            }
          }
          
          return updatedCyl;
        });
        // Ensure finalCureMethod has a default value if missing
        const needsFinalCureMethod = !updatedData.finalCureMethod || updatedData.finalCureMethod.trim() === '';
        updatedData.cylinders = updatedCylinders;
        updatedData.finalCureMethod = updatedData.finalCureMethod || 'STANDARD';
        setFormData(updatedData);
        // Update last saved snapshot after loading
        lastSavedDataRef.current = JSON.stringify(updatedData);
        // Auto-save if we updated any cylinders with defaults or if finalCureMethod was missing
        const hasUpdates = updatedCylinders.some((cyl, idx) => {
          const original = data.cylinders[idx];
          return (!original.avgLength && cyl.avgLength) || 
                 (!original.avgWidth && cyl.avgWidth) || 
                 (!original.avgDiameter && cyl.avgDiameter);
        });
        if (hasUpdates || needsFinalCureMethod || projectSpecs.specStrengthPsi || projectSpecs.specAmbientTempF || projectSpecs.specConcreteTempF || projectSpecs.specSlump || projectSpecs.specAirContentByVolume) {
          setTimeout(() => {
            if (isTaskRoute) {
              wp1API.saveByTask(parseInt(id!), updatedData).catch(console.error);
            } else {
              workPackagesAPI.saveWP1(parseInt(id!), updatedData).catch(console.error);
            }
          }, 500);
        }
      } else {
        // Initialize with default values
        const today = new Date().toISOString().split('T')[0];
        const initialCylinders = createInitialCylinders(today);
        const initialData: WP1Data = {
          ...updatedData,
          ...(!isTaskRoute ? { workPackageId: parseInt(id!) } : { taskId: parseInt(id!) }),
          placementDate: today,
          specStrengthDays: 28,
          finalCureMethod: 'STANDARD',
          cylinders: initialCylinders,
        };
        setFormData(initialData);
        // Update last saved snapshot after loading initial data
        lastSavedDataRef.current = JSON.stringify(initialData);
        // Save initial data
        setTimeout(() => {
          if (isTaskRoute) {
            wp1API.saveByTask(parseInt(id!), initialData).catch(console.error);
          } else {
            workPackagesAPI.saveWP1(parseInt(id!), initialData).catch(console.error);
          }
        }, 1000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Check if there are unsaved changes
  const _checkUnsavedChanges = useCallback(() => {
    if (!formData) return false;
    if (saveStatus === 'saving') return true;
    const currentData = JSON.stringify(formData);
    return currentData !== lastSavedDataRef.current;
  }, [formData, saveStatus]);

  // Simple save function for Home button (saves current state without changing status)
  const handleSimpleSave = useCallback(async () => {
    if (!formData) return;
    try {
      if (isTaskRoute) {
        // If technician changed, find the technician ID
        let saveData = formData;
        if (formData.technician && isAdmin()) {
          const selectedTech = technicians.find(t => (t.name || t.email) === formData.technician);
          if (selectedTech) {
            saveData = { ...formData, assignedTechnicianId: selectedTech.id };
          }
        }
        await wp1API.saveByTask(parseInt(id!), saveData);
      } else {
        await workPackagesAPI.saveWP1(parseInt(id!), formData);
      }
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify(formData);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to save');
    }
  }, [formData, isTaskRoute, isAdmin, technicians, id]);

  const debouncedSave = useCallback((data: WP1Data) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Round totalLoad and compressiveStrength to whole numbers before saving
        const roundedData = { ...data };
        if (roundedData.cylinders && roundedData.cylinders.length > 0) {
          roundedData.cylinders = roundedData.cylinders.map(cyl => {
            const roundedCyl = { ...cyl };
            // Round totalLoad to whole number
            if (roundedCyl.totalLoad !== undefined && roundedCyl.totalLoad !== null) {
              roundedCyl.totalLoad = Math.round(roundedCyl.totalLoad);
            }
            // Round compressiveStrength to whole number (or recalculate from rounded load)
            if (roundedCyl.totalLoad !== undefined && roundedCyl.totalLoad !== null && roundedCyl.crossSectionalArea) {
              const load = roundedCyl.totalLoad;
              const area = parseFloat(roundedCyl.crossSectionalArea);
              if (load > 0 && area > 0) {
                roundedCyl.compressiveStrength = Math.round(load / area);
              }
            } else if (roundedCyl.compressiveStrength !== undefined && roundedCyl.compressiveStrength !== null) {
              roundedCyl.compressiveStrength = Math.round(roundedCyl.compressiveStrength);
            }
            return roundedCyl;
          });
        }
        
        if (isTaskRoute) {
          // If technician changed, find the technician ID
          let saveData = roundedData;
          if (roundedData.technician && isAdmin()) {
            const selectedTech = technicians.find(t => (t.name || t.email) === roundedData.technician);
            if (selectedTech) {
              saveData = { ...roundedData, assignedTechnicianId: selectedTech.id };
            }
          }
          await wp1API.saveByTask(parseInt(id!), saveData);
        } else {
          await workPackagesAPI.saveWP1(parseInt(id!), roundedData);
        }
        // Update last saved snapshot
        lastSavedDataRef.current = JSON.stringify(roundedData);
        setSaveStatus('saved');
        setLastSaved(new Date());
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to save');
        setSaveStatus('idle');
      }
    }, 800);
  }, [id, isTaskRoute, isAdmin, technicians]);

  // Handle structure selection - auto-populate specs from Soil Specs
  const handleStructureChange = (structureType: string) => {
    const selectedSpec = soilSpecs[structureType];
    let updatedData = { ...formData, structure: structureType };
    
    if (selectedSpec) {
      // Debug: Log the exact structure of selectedSpec
      console.log('Selected spec keys:', Object.keys(selectedSpec));
      console.log('Selected spec full object:', JSON.stringify(selectedSpec, null, 2));
      console.log('selectedSpec.ambientTempF:', selectedSpec.ambientTempF);
      console.log('selectedSpec.concreteTempF:', selectedSpec.concreteTempF);
      
      // Explicitly map Soil Specs to canonical form keys
      // Use the actual field names from SoilSpecRow interface
      // Apply default values if missing (35-95 for ambient, 45-95 for concrete)
      const ambientTempValue = selectedSpec.ambientTempF || '35-95';
      const concreteTempValue = selectedSpec.concreteTempF || '45-95';
      const specStrengthValue = selectedSpec.specStrengthPsi || '';
      const slumpValue = selectedSpec.slump || '';
      const airContentValue = selectedSpec.airContent || '';
      
      console.log('Extracted values:', {
        'ambientTempF': selectedSpec.ambientTempF,
        'concreteTempF': selectedSpec.concreteTempF,
        'specStrengthPsi': selectedSpec.specStrengthPsi,
        'slump': selectedSpec.slump,
        'airContent': selectedSpec.airContent,
        'final ambientTempValue': ambientTempValue,
        'final concreteTempValue': concreteTempValue
      });
      
      // Auto-populate specs from selected Soil Spec structure
      if (specStrengthValue) {
        updatedData.specStrength = specStrengthValue;
      }
      // Always set ambientTempSpecs from Soil Specs (explicitly set the canonical key with default)
      updatedData.ambientTempSpecs = ambientTempValue;
      // Always set concreteTempSpecs from Soil Specs (explicitly set the canonical key with default)
      updatedData.concreteTempSpecs = concreteTempValue;
      if (slumpValue) {
        updatedData.slumpSpecs = slumpValue;
      }
      if (airContentValue) {
        updatedData.airContentSpecs = airContentValue;
      }
      
      // Debug logging
      console.log('Structure selected:', structureType);
      console.log('Selected spec:', selectedSpec);
      console.log('Setting ambientTempSpecs:', ambientTempValue);
      console.log('Setting concreteTempSpecs:', concreteTempValue);
      console.log('Updated ambientTempSpecs:', updatedData.ambientTempSpecs);
      console.log('Updated concreteTempSpecs:', updatedData.concreteTempSpecs);
    } else {
      // Clear specs if structure has no specs
      updatedData.specStrength = updatedData.specStrength || '';
      updatedData.ambientTempSpecs = '';
      updatedData.concreteTempSpecs = '';
      updatedData.slumpSpecs = updatedData.slumpSpecs || '';
      updatedData.airContentSpecs = updatedData.airContentSpecs || '';
    }
    
    // Update form data immediately to ensure Test Results section sees the changes
    setFormData(updatedData);
    
    // Debug: log final form data state
    console.log('Final formData after structure change:', {
      structure: updatedData.structure,
      ambientTempSpecs: updatedData.ambientTempSpecs,
      concreteTempSpecs: updatedData.concreteTempSpecs
    });
    
    debouncedSave(updatedData);
  };

  const handleFieldChange = (field: keyof WP1Data, value: any) => {
    const newData = { ...formData, [field]: value };
    
    // If placementDate changes, recalculate all dateTested values
    if (field === 'placementDate') {
      newData.cylinders = newData.cylinders.map(cyl => ({
        ...cyl,
        dateTested: calculateDateTested(value, cyl.age)
      }));
    }
    
    setFormData(newData);
    
    // If technician is changed and we're on a task route, we need to find the technician ID
    if (field === 'technician' && isTaskRoute && isAdmin() && value) {
      const selectedTech = technicians.find(t => (t.name || t.email) === value);
      if (selectedTech) {
        // Include the technician ID in the save payload
        debouncedSave({ ...newData, assignedTechnicianId: selectedTech.id });
      } else {
        debouncedSave(newData);
      }
    } else {
      debouncedSave(newData);
    }
  };

  const handleCylinderChange = (cylinderIndex: number, field: keyof Cylinder, value: any) => {
    const newCylinders = [...formData.cylinders];
    
    // If age changes, recalculate dateTested
    if (field === 'age') {
      // Ensure age is a valid integer >= 0
      const ageInt = parseInt(value);
      if (isNaN(ageInt) || ageInt < 0) {
        // Invalid age, don't update
        return;
      }
      const ageStr = ageInt.toString();
      newCylinders[cylinderIndex] = {
        ...newCylinders[cylinderIndex],
        age: ageStr,
        dateTested: calculateDateTested(formData.placementDate, ageStr)
      };
    } else {
      newCylinders[cylinderIndex] = { ...newCylinders[cylinderIndex], [field]: value };
    }
    
    // Auto-calculate cross-sectional area if diameter changes
    // Formula: 3.143 * 0.25 * (diameter)^2
    if (field === 'avgDiameter' && value) {
      const diameter = parseFloat(value);
      if (!isNaN(diameter)) {
        const area = 3.143 * 0.25 * Math.pow(diameter, 2);
        newCylinders[cylinderIndex].crossSectionalArea = area.toFixed(2);
      }
    }

    // Round totalLoad to whole number on blur (handled separately)
    // Round compressiveStrength calculation - always round to whole number
    if (field === 'totalLoad' || field === 'crossSectionalArea') {
      const load = parseFloat(newCylinders[cylinderIndex].totalLoad?.toString() || '0');
      const area = parseFloat(newCylinders[cylinderIndex].crossSectionalArea || '0');
      if (load > 0 && area > 0) {
        // Round compressive strength to whole number
        newCylinders[cylinderIndex].compressiveStrength = Math.round(load / area);
      }
    }
    
    // Round totalLoad to whole number when changed (for immediate display)
    if (field === 'totalLoad' && value !== undefined && value !== null && value !== '') {
      const loadNum = typeof value === 'number' ? value : parseFloat(value.toString());
      if (!isNaN(loadNum)) {
        // Round to whole number for immediate display, but keep as number
        newCylinders[cylinderIndex].totalLoad = Math.round(loadNum);
        // Recalculate compressive strength if area is available
        const area = parseFloat(newCylinders[cylinderIndex].crossSectionalArea || '0');
        if (area > 0) {
          newCylinders[cylinderIndex].compressiveStrength = Math.round(Math.round(loadNum) / area);
        }
      }
    }
    
    // Round compressiveStrength to whole number if directly edited
    if (field === 'compressiveStrength' && value !== undefined && value !== null && value !== '') {
      const strengthNum = typeof value === 'number' ? value : parseFloat(value.toString());
      if (!isNaN(strengthNum)) {
        newCylinders[cylinderIndex].compressiveStrength = Math.round(strengthNum);
      }
    }

    const newData = { ...formData, cylinders: newCylinders };
    setFormData(newData);
    debouncedSave(newData);
  };

  const handleAddSpecimenSet = () => {
    const currentMaxCylinder = Math.max(...formData.cylinders.map(c => c.cylinderNumber || 0), 0);
    
    // Create new cylinders with computed dateTested values
    const newCylinders = createInitialCylinders(formData.placementDate);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const setNumber = Math.floor(formData.cylinders.length / 5) + 1;
    newCylinders.forEach((cyl, idx) => {
      cyl.cylinderNumber = currentMaxCylinder + idx + 1;
      // Recalculate dateTested to ensure it's correct
      cyl.dateTested = calculateDateTested(formData.placementDate, cyl.age);
      // Set specimen info only on first cylinder
      if (idx === 0) {
        cyl.specimenNo = '';
        cyl.specimenQty = '5';
        cyl.specimenType = '';
      }
    });

    const newData = { ...formData, cylinders: [...formData.cylinders, ...newCylinders] };
    setFormData(newData);
    debouncedSave(newData);
  };

  const handleDeleteSpecimenSet = (setIndex: number) => {
    if (setIndex === 0) {
      alert('Cannot delete the first specimen set');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete Specimen Set ${setIndex + 1}?`)) {
      const startIndex = setIndex * 5;
      const newCylinders = [
        ...formData.cylinders.slice(0, startIndex),
        ...formData.cylinders.slice(startIndex + 5)
      ];
      
      // Renumber cylinders after deletion
      newCylinders.forEach((cyl, idx) => {
        const expectedSetIndex = Math.floor(idx / 5);
        const expectedCylinderInSet = (idx % 5) + 1;
        cyl.cylinderNumber = expectedSetIndex * 5 + expectedCylinderInSet;
      });
      
      const newData = { ...formData, cylinders: newCylinders };
      setFormData(newData);
      debouncedSave(newData);
    }
  };

  const handleSpecimenSetInfoChange = (setIndex: number, field: 'specimenNo' | 'specimenQty' | 'specimenType', value: string) => {
    const startIndex = setIndex * 5;
    const newCylinders = [...formData.cylinders];
    
    // Update the first cylinder of the set (which stores the specimen info)
    if (newCylinders[startIndex]) {
      newCylinders[startIndex] = {
        ...newCylinders[startIndex],
        [field]: value
      };
    }
    
    const newData = { ...formData, cylinders: newCylinders };
    setFormData(newData);
    debouncedSave(newData);
  };

  const getSpecimenSetInfo = (setIndex: number) => {
    const startIndex = setIndex * 5;
    const firstCylinder = formData.cylinders[startIndex];
    return {
      specimenNo: firstCylinder?.specimenNo || '',
      specimenQty: firstCylinder?.specimenQty || '5',
      specimenType: firstCylinder?.specimenType || '',
    };
  };

  const handleManualSave = async () => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      if (isTaskRoute) {
        // If technician changed, find the technician ID
        let saveData = formData;
        if (formData.technician && isAdmin()) {
          const selectedTech = technicians.find(t => (t.name || t.email) === formData.technician);
          if (selectedTech) {
            saveData = { ...formData, assignedTechnicianId: selectedTech.id };
          }
        }
        await wp1API.saveByTask(parseInt(id!), saveData);
      } else {
        await workPackagesAPI.saveWP1(parseInt(id!), formData);
      }
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify(formData);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpdate = async () => {
    // Technician: Save and set status to IN_PROGRESS_TECH (sends notification to admin)
    setSaving(true);
    setSaveStatus('saving');
    try {
      if (isTaskRoute) {
        // For tasks, use wp1API
        await wp1API.saveByTask(parseInt(id!), { ...formData, updateStatus: 'IN_PROGRESS_TECH' });
        await tasksAPI.updateStatus(parseInt(id!), 'IN_PROGRESS_TECH');
      } else {
        // For workpackages (backward compatibility)
        await workPackagesAPI.saveWP1(parseInt(id!), formData, 'IN_PROGRESS_TECH');
        await workPackagesAPI.updateStatus(parseInt(id!), 'IN_PROGRESS_TECH');
      }
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      alert('Update saved! Status set to "In Progress"');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  const handleSendUpdateToAdmin = async () => {
    // Technician: Save and set status to READY_FOR_REVIEW
    if (!window.confirm('Send this work package to Admin for review? You will not be able to edit it after sending.')) {
      return;
    }
    setSaving(true);
    setSaveStatus('saving');
    try {
      if (isTaskRoute) {
        // For tasks, use wp1API
        await wp1API.saveByTask(parseInt(id!), { ...formData, updateStatus: 'READY_FOR_REVIEW' });
        await tasksAPI.updateStatus(parseInt(id!), 'READY_FOR_REVIEW');
      } else {
        // For workpackages (backward compatibility)
        await workPackagesAPI.saveWP1(parseInt(id!), formData, 'READY_FOR_REVIEW');
        await workPackagesAPI.updateStatus(parseInt(id!), 'READY_FOR_REVIEW');
      }
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      alert('Work package sent to Admin for review!');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send update');
    } finally {
      setSaving(false);
    }
  };

  const _handleSubmit = async () => {
    try {
      await workPackagesAPI.updateStatus(parseInt(id!), 'Submitted');
      alert('Work package submitted successfully!');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit');
    }
  };

  const isTechnician = user?.role === 'TECHNICIAN';
  const currentItem = isTaskRoute ? task : workPackage;
  const status = currentItem?.status || '';
  const isLocked = isTechnician && (status === 'READY_FOR_REVIEW' || status === 'APPROVED');

  const handleGeneratePDF = async () => {
    setLastSavedPath(null); // Clear previous saved path
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.REACT_APP_API_URL || 'http://192.168.4.24:5000/api';
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      
      // Use task or workpackage route for PDF
      const pdfRoute = id;
      const pdfUrl = isTaskRoute 
        ? `${baseUrl}/api/pdf/wp1/${pdfRoute}?type=task`
        : `${baseUrl}/api/pdf/wp1/${pdfRoute}`;
      const response = await fetch(pdfUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate PDF' }));
        throw new Error(errorData.error || 'Failed to generate PDF');
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
          const projectNumber = currentItem?.projectNumber || 'report';
          const filename = result.fileName || `compressive-strength-report-${projectNumber}.pdf`;

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
      const projectNumber = currentItem?.projectNumber || 'report';
      a.download = `compressive-strength-report-${projectNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      const errorMessage = err.message || err.response?.data?.error || 'Failed to generate PDF';
      setError(errorMessage);
      alert(`Error generating PDF: ${errorMessage}\n\nCheck the browser console and server logs for details.`);
    }
  };

  const getSaveStatusText = () => {
    if (saveStatus === 'saving') return 'Saving...';
    if (saveStatus === 'saved' && lastSaved) {
      return `Saved at ${lastSaved.toLocaleTimeString()}`;
    }
    return '';
  };

  // Log current form state before render (for debugging)
  useEffect(() => {
    console.log('Current form temps (before render):', {
      ambientTempSpecs: formData.ambientTempSpecs,
      concreteTempSpecs: formData.concreteTempSpecs,
      structure: formData.structure,
      'soilSpecs available': Object.keys(soilSpecs).length > 0
    });
  }, [formData.ambientTempSpecs, formData.concreteTempSpecs, formData.structure, soilSpecs]);

  if (loading) {
    return <div className="wp1-loading">Loading...</div>;
  }

  if (!currentItem) {
    return <div className="wp1-error">{isTaskRoute ? 'Task' : 'Work package'} not found</div>;
  }

  // Group cylinders by set (5 per set)
  const cylinderSets: Cylinder[][] = [];
  if (formData.cylinders && formData.cylinders.length > 0) {
    for (let i = 0; i < formData.cylinders.length; i += 5) {
      cylinderSets.push(formData.cylinders.slice(i, i + 5));
    }
  }

  return (
    <div className="wp1-form-container">
      <div className="wp1-header">
        <h1>Compressive Strength Field Report</h1>
        <div className="wp1-header-actions">
          {task?.projectId && (
            <ProjectHomeButton
              projectId={task.projectId}
              onSave={handleSimpleSave}
              saving={saving}
            />
          )}
          <button onClick={() => navigate('/dashboard')} className="back-button">
            Back
          </button>
          {isTechnician ? (
            <>
              <button 
                onClick={handleSaveUpdate} 
                disabled={saving || isLocked} 
                className="save-button"
              >
                {saving ? 'Saving...' : 'Save Update'}
              </button>
              <button 
                onClick={handleSendUpdateToAdmin} 
                disabled={saving || isLocked} 
                className="submit-button"
              >
                Send Update to Admin
              </button>
            </>
          ) : (
            <>
              <button onClick={handleManualSave} disabled={saving} className="save-button">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={handleGeneratePDF} className="pdf-button">
                Generate PDF
              </button>
              {lastSavedPath && (
                <div className="pdf-saved-confirmation" style={{ marginTop: '10px', padding: '10px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px', color: '#155724' }}>
                  PDF saved to: <strong>{lastSavedPath}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="save-status">{getSaveStatusText()}</div>
      {error && <div className="error-message">{error}</div>}

      <form className="wp1-form">
        {/* Project Information */}
        <section className="form-section">
          <h2 className="section-title">Project Information</h2>
          <div className="form-row">
            <div className="form-field">
              <label>PROJECT:</label>
              <input type="text" value={currentItem?.projectName || ''} readOnly />
            </div>
            <div className="form-field">
              <label>PROJECT NO:</label>
              <input type="text" value={currentItem?.projectNumber || ''} readOnly />
            </div>
          </div>
        </section>

        {/* Placement Information */}
        <section className="form-section">
          <h2 className="section-title">Placement Information</h2>
          <div className="form-row">
            <div className="form-field">
              <label>TECHNICIAN:</label>
              {isTechnician ? (
                <input
                  type="text"
                  value={formData.technician || workPackage?.assignedTechnicianName || user?.name || user?.email || ''}
                  readOnly
                />
              ) : (
                <select
                  value={formData.technician || workPackage?.assignedTechnicianName || ''}
                  onChange={(e) => handleFieldChange('technician', e.target.value)}
                >
                <option value="">Select a technician...</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.name || tech.email}>
                    {tech.name || tech.email}
                  </option>
                ))}
                {/* Include current value if it's not in the technicians list */}
                {formData.technician && 
                 !technicians.find(t => (t.name || t.email) === formData.technician) && 
                 formData.technician !== workPackage?.assignedTechnicianName && (
                  <option value={formData.technician}>{formData.technician}</option>
                )}
                {/* Include assigned technician if different from form data */}
                {workPackage?.assignedTechnicianName && 
                 workPackage.assignedTechnicianName !== formData.technician &&
                 !technicians.find(t => (t.name || t.email) === workPackage.assignedTechnicianName) && (
                  <option value={workPackage.assignedTechnicianName}>{workPackage.assignedTechnicianName}</option>
                )}
                </select>
              )}
            </div>
            <div className="form-field">
              <label>WEATHER:</label>
              <input
                type="text"
                value={formData.weather || ''}
                onChange={(e) => handleFieldChange('weather', e.target.value)}
                disabled={isLocked}
              />
            </div>
            <div className="form-field">
              <label>PLACEMENT DATE:</label>
              <input
                type="date"
                value={formData.placementDate || ''}
                onChange={(e) => {
                  const newPlacementDate = e.target.value;
                  // Update cylinder dates when placement date changes
                  let updatedCylinders = formData.cylinders;
                  if (newPlacementDate) {
                    const newDate = new Date(newPlacementDate);
                    updatedCylinders = formData.cylinders.map((cyl, idx) => {
                      const date = new Date(newDate);
                      if (idx % 5 === 0) {
                        date.setDate(date.getDate() + 7);
                      } else if (idx % 5 >= 1 && idx % 5 <= 3) {
                        date.setDate(date.getDate() + 28);
                      } else {
                        date.setDate(date.getDate() + 56);
                      }
                      return { ...cyl, dateTested: date.toISOString().split('T')[0] };
                    });
                  }
                  // Update both placement date and cylinders in a single state update
                  const newData = { ...formData, placementDate: newPlacementDate, cylinders: updatedCylinders };
                  setFormData(newData);
                  debouncedSave(newData);
                }}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Spec Strength (PSI):</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', justifyContent: 'flex-start' }}>
                <input
                  type="text"
                  value={formData.specStrength || ''}
                  onChange={(e) => handleFieldChange('specStrength', e.target.value)}
                  readOnly={(isTechnician || (!!formData.structure && !!soilSpecs[formData.structure]))}
                  className={(isTechnician || (!!formData.structure && !!soilSpecs[formData.structure])) ? 'readonly' : ''}
                  placeholder="Auto-populated from project specs"
                  title={!!formData.structure && !!soilSpecs[formData.structure] ? 'Auto-filled from Project Concrete Specs' : ''}
                  style={{ width: '180px' }}
                />
                <span>at</span>
                <input
                  type="number"
                  value={formData.specStrengthDays || 28}
                  onChange={(e) => handleFieldChange('specStrengthDays', parseInt(e.target.value) || 28)}
                  style={{ width: '70px' }}
                />
                <span>days</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sample Information */}
        <section className="form-section">
          <h2 className="section-title">Sample Information</h2>
          <div className="form-row">
            <div className="form-field">
              <label>STRUCTURE:</label>
              <select
                value={formData.structure || ''}
                onChange={(e) => handleStructureChange(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="">Select Structure...</option>
                {Object.keys(soilSpecs).length > 0 ? (
                  Object.keys(soilSpecs).map((structureType) => (
                    <option key={structureType} value={structureType}>
                      {structureType}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>No structures available (check Project Details → Concrete Specs)</option>
                )}
              </select>
            </div>
            <div className="form-field">
              <label>SAMPLE LOCATION:</label>
              <input
                type="text"
                value={formData.sampleLocation || ''}
                onChange={(e) => handleFieldChange('sampleLocation', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>SUPPLIER:</label>
              <input
                type="text"
                value={formData.supplier || ''}
                onChange={(e) => handleFieldChange('supplier', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>TIME BATCHED:</label>
              <input
                type="time"
                value={formData.timeBatched || ''}
                onChange={(e) => handleFieldChange('timeBatched', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>CLASS/MIX ID:</label>
              <input
                type="text"
                value={formData.classMixId || ''}
                onChange={(e) => handleFieldChange('classMixId', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>TIME SAMPLED:</label>
              <input
                type="time"
                value={formData.timeSampled || ''}
                onChange={(e) => handleFieldChange('timeSampled', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>YARDS BATCHED:</label>
              <input
                type="text"
                value={formData.yardsBatched || ''}
                onChange={(e) => handleFieldChange('yardsBatched', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>TRUCK NO. / TICKET NO.:</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={formData.truckNo || ''}
                  onChange={(e) => handleFieldChange('truckNo', e.target.value)}
                  placeholder="Truck No"
                  style={{ flex: 1 }}
                />
                <span>/</span>
                <input
                  type="text"
                  value={formData.ticketNo || ''}
                  onChange={(e) => handleFieldChange('ticketNo', e.target.value)}
                  placeholder="Ticket No"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className="form-field">
              <label>PLANT:</label>
              <input
                type="text"
                value={formData.plant || ''}
                onChange={(e) => handleFieldChange('plant', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>YARDS PLACED/TOTAL YARDS:</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={formData.yardsPlaced || ''}
                  onChange={(e) => handleFieldChange('yardsPlaced', e.target.value)}
                  placeholder="Placed"
                  style={{ flex: 1 }}
                />
                <span>/</span>
                <input
                  type="text"
                  value={formData.totalYards || ''}
                  onChange={(e) => handleFieldChange('totalYards', e.target.value)}
                  placeholder="Total"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          {/* Test Results */}
          <div className="test-results-section">
            <h3>TEST RESULTS</h3>
            <table className="test-results-table">
              <thead>
                <tr>
                  <th>TEST RESULTS</th>
                  <th>MEASURED</th>
                  <th>SPECS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>AMBIENT TEMP (°F):</td>
                  <td>
                    <input
                      type="text"
                      value={formData.ambientTempMeasured || ''}
                      onChange={(e) => handleFieldChange('ambientTempMeasured', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.ambientTempSpecs || ''}
                      onChange={(e) => handleFieldChange('ambientTempSpecs', e.target.value)}
                      readOnly={!!formData.structure && !!soilSpecs[formData.structure]}
                      className={!!formData.structure && !!soilSpecs[formData.structure] ? 'readonly' : ''}
                      title={!!formData.structure && !!soilSpecs[formData.structure] ? 'Auto-filled from Project Concrete Specs' : ''}
                    />
                  </td>
                </tr>
                <tr>
                  <td>CONCRETE TEMP (°F):</td>
                  <td>
                    <input
                      type="text"
                      value={formData.concreteTempMeasured || ''}
                      onChange={(e) => handleFieldChange('concreteTempMeasured', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.concreteTempSpecs || ''}
                      onChange={(e) => handleFieldChange('concreteTempSpecs', e.target.value)}
                      readOnly={!!formData.structure && !!soilSpecs[formData.structure]}
                      className={!!formData.structure && !!soilSpecs[formData.structure] ? 'readonly' : ''}
                      title={!!formData.structure && !!soilSpecs[formData.structure] ? 'Auto-filled from Project Concrete Specs' : ''}
                    />
                  </td>
                </tr>
                <tr>
                  <td>SLUMP:</td>
                  <td>
                    <input
                      type="text"
                      value={formData.slumpMeasured || ''}
                      onChange={(e) => handleFieldChange('slumpMeasured', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.slumpSpecs || ''}
                      onChange={(e) => handleFieldChange('slumpSpecs', e.target.value)}
                      readOnly={!!formData.structure && !!soilSpecs[formData.structure]}
                      className={!!formData.structure && !!soilSpecs[formData.structure] ? 'readonly' : ''}
                      title={!!formData.structure && !!soilSpecs[formData.structure] ? 'Auto-filled from Project Concrete Specs' : ''}
                    />
                  </td>
                </tr>
                <tr>
                  <td>AIR CONTENT BY VOL:</td>
                  <td>
                    <input
                      type="text"
                      value={formData.airContentMeasured || ''}
                      onChange={(e) => handleFieldChange('airContentMeasured', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.airContentSpecs || ''}
                      onChange={(e) => handleFieldChange('airContentSpecs', e.target.value)}
                      readOnly={!!formData.structure && !!soilSpecs[formData.structure]}
                      className={!!formData.structure && !!soilSpecs[formData.structure] ? 'readonly' : ''}
                      title={!!formData.structure && !!soilSpecs[formData.structure] ? 'Auto-filled from Project Concrete Specs' : ''}
                    />
                  </td>
                </tr>
                <tr>
                  <td>UNIT WEIGHT (pcf):</td>
                  <td>
                    <input
                      type="text"
                      value={formData.unitWeight || ''}
                      onChange={(e) => handleFieldChange('unitWeight', e.target.value)}
                    />
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>WATER ADDED:</label>
              <input
                type="text"
                value={formData.waterAdded || ''}
                onChange={(e) => handleFieldChange('waterAdded', e.target.value)}
                placeholder="/ Gal."
              />
            </div>
            <div className="form-field">
              <label>FINAL CURE METHOD:</label>
              <input
                type="text"
                value={formData.finalCureMethod || 'STANDARD'}
                onChange={(e) => handleFieldChange('finalCureMethod', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Specimen Information */}
        <section className="form-section">
          <h2 className="section-title">Specimen Information</h2>

          {cylinderSets.length > 0 ? cylinderSets.map((set, setIndex) => {
            const setInfo = getSpecimenSetInfo(setIndex);
            return (
              <div key={setIndex} className="cylinder-set">
              <div className="specimen-set-header">
                <h3>Specimen Set {setIndex + 1}</h3>
                {setIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSpecimenSet(setIndex)}
                    className="delete-set-button"
                  >
                    Delete Set
                  </button>
                )}
              </div>
              <div className="form-row" style={{ marginBottom: '15px' }}>
                <div className="form-field">
                  <label>SPECIMEN NO:</label>
                  <input
                    type="text"
                    value={setInfo.specimenNo}
                    onChange={(e) => handleSpecimenSetInfoChange(setIndex, 'specimenNo', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>SPECIMEN QTY:</label>
                  <input
                    type="text"
                    value={setInfo.specimenQty}
                    onChange={(e) => handleSpecimenSetInfoChange(setIndex, 'specimenQty', e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>SPECIMEN TYPE:</label>
                  <select
                    value={setInfo.specimenType}
                    onChange={(e) => handleSpecimenSetInfoChange(setIndex, 'specimenType', e.target.value)}
                  >
                    <option value="">Select Type</option>
                    <option value='4" X 8"'>4" X 8"</option>
                    <option value='6" X 12"'>6" X 12"</option>
                  </select>
                </div>
              </div>
              <table className="cylinders-table">
                <thead>
                  <tr>
                    <th>CYLINDER NUMBER</th>
                    <th>AGE (DAYS)</th>
                    <th>DATE TESTED</th>
                    <th>AVG LENGTH (in)</th>
                    <th>AVG WIDTH (in)</th>
                    <th>AVG DIAMETER (in)</th>
                    <th>CROSS-SECTIONAL AREA (sq.in)</th>
                    <th>TOTAL LOAD (lbs)</th>
                    <th>Compressive Strength (psi)</th>
                    <th>Fracture Type</th>
                  </tr>
                </thead>
                <tbody>
                  {set.map((cylinder, cylIndex) => {
                    const globalIndex = setIndex * 5 + cylIndex;
                    return (
                      <tr key={cylinder.cylinderNumber}>
                        <td>{cylinder.cylinderNumber}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cylinder.age || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Allow empty or valid integer >= 0
                              if (value === '' || (!isNaN(parseInt(value)) && parseInt(value) >= 0)) {
                                handleCylinderChange(globalIndex, 'age', value);
                              }
                            }}
                            style={{ width: '100%', minWidth: '50px' }}
                            title="Age in days (editable). Date Tested will update automatically."
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.dateTested || ''}
                            readOnly
                            style={{ width: '100%', backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                            title="Date Tested is automatically calculated from Placement Date + Age (Days)"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.avgLength || ''}
                            onChange={(e) => handleCylinderChange(globalIndex, 'avgLength', e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.avgWidth || ''}
                            onChange={(e) => handleCylinderChange(globalIndex, 'avgWidth', e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.avgDiameter || ''}
                            onChange={(e) => handleCylinderChange(globalIndex, 'avgDiameter', e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.crossSectionalArea || ''}
                            onChange={(e) => handleCylinderChange(globalIndex, 'crossSectionalArea', e.target.value)}
                            style={{ width: '100%' }}
                            readOnly
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={cylinder.totalLoad !== undefined ? Math.round(cylinder.totalLoad) : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                handleCylinderChange(globalIndex, 'totalLoad', undefined);
                              } else {
                                const num = parseFloat(val);
                                if (!isNaN(num)) {
                                  handleCylinderChange(globalIndex, 'totalLoad', num);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              // Round to whole number on blur
                              const val = e.target.value;
                              if (val === '') {
                                handleCylinderChange(globalIndex, 'totalLoad', undefined);
                              } else {
                                const num = parseFloat(val);
                                if (!isNaN(num)) {
                                  const rounded = Math.round(num);
                                  handleCylinderChange(globalIndex, 'totalLoad', rounded);
                                }
                              }
                            }}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={cylinder.compressiveStrength !== undefined ? Math.round(cylinder.compressiveStrength) : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                handleCylinderChange(globalIndex, 'compressiveStrength', undefined);
                              } else {
                                const num = parseFloat(val);
                                if (!isNaN(num)) {
                                  handleCylinderChange(globalIndex, 'compressiveStrength', num);
                                }
                              }
                            }}
                            onBlur={(e) => {
                              // Round to whole number on blur
                              const val = e.target.value;
                              if (val === '') {
                                handleCylinderChange(globalIndex, 'compressiveStrength', undefined);
                              } else {
                                const num = parseFloat(val);
                                if (!isNaN(num)) {
                                  const rounded = Math.round(num);
                                  handleCylinderChange(globalIndex, 'compressiveStrength', rounded);
                                }
                              }
                            }}
                            style={{ width: '100%' }}
                            readOnly
                            className="calculated"
                            title="Auto-calculated from Total Load / Cross-Sectional Area (rounded to whole number)"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={cylinder.fractureType || ''}
                            onChange={(e) => handleCylinderChange(globalIndex, 'fractureType', e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            );
          }) : (
            <div className="no-cylinders">
              <p>No cylinders yet. Click "Add Another Set" to create your first set of 5 cylinders.</p>
            </div>
          )}

          <button type="button" onClick={handleAddSpecimenSet} className="add-set-button">
            {cylinderSets.length === 0 ? '+ Add First Set' : '+ Add Another Set'}
          </button>
        </section>

        {/* Remarks */}
        <section className="form-section">
          <h2 className="section-title">Remarks</h2>
          <textarea
            value={formData.remarks || ''}
            onChange={(e) => handleFieldChange('remarks', e.target.value)}
            rows={4}
            style={{ width: '100%', padding: '10px' }}
          />
        </section>

        {/* History / Audit Trail (NOT printable, only for task routes) */}
        {isTaskRoute && history.length > 0 && (
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
      </form>
    </div>
  );
};

export default WP1Form;

