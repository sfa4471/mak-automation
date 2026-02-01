import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { tasksAPI, Task, TaskHistoryEntry } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { proctorAPI } from '../api/proctor';
import ProctorCurveChart, { ProctorPoint, ZAVPoint } from './ProctorCurveChart';
import ProjectHomeButton from './ProjectHomeButton';
import './ProctorForm.css';

interface ProctorRow {
  panNumber: string;
  wetWtMold: string;
  wtOfMold: string;
  wetWtSample: string; // calculated
  wetUnitWt: string; // calculated
  wetWtPan: string;
  dryWtPan: string;
  wtWater: string; // calculated
  wtOfPan: string;
  dryWt: string; // calculated
  waterContent: string; // calculated
  dryUnitWt: string; // calculated
}

interface AtterbergDish {
  dishNo: number;
  massWetSampleTare: string;
  massDrySampleTare: string;
  tareMass: string;
  numberOfBlows: string;
  liquidLimit: string; // calculated
  plasticLimit: string; // calculated
}

interface Passing200Dish {
  dishNo: number;
  dryWtBeforeWash: string;
  dryWtAfterWash: string;
  tareWeight: string;
  passing200Pct: string; // Auto-calculated
}

interface ProctorData {
  moldWeight: number;
  moldVolume: number;
  specificGravity: number;
  columns: ProctorRow[];
  atterbergLimits: AtterbergDish[];
  passing200: Passing200Dish[];
}

const ProctorForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const isTaskRoute = location.pathname.startsWith('/task/');
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  // Initialize with sample data for columns 1-5
  const getInitialColumns = (): ProctorRow[] => {
    const sampleData = [
      { wetWtMold: '8.570', wetWtPan: '292.31', dryWtPan: '278', wtOfPan: '144.94' },
      { wetWtMold: '8.760', wetWtPan: '281.95', dryWtPan: '263.24', wtOfPan: '115.11' },
      { wetWtMold: '8.970', wetWtPan: '321.59', dryWtPan: '295.130', wtOfPan: '118.23' },
      { wetWtMold: '8.92', wetWtPan: '379.63', dryWtPan: '343.79', wtOfPan: '145.46' },
      { wetWtMold: '8.91', wetWtPan: '376.72', dryWtPan: '338.69', wtOfPan: '145.39' },
    ];

    return Array(6).fill(null).map((_, index) => ({
      panNumber: '',
      wetWtMold: index < 5 ? sampleData[index].wetWtMold : '',
      wtOfMold: '4.740',
      wetWtSample: '',
      wetUnitWt: '',
      wetWtPan: index < 5 ? sampleData[index].wetWtPan : '',
      dryWtPan: index < 5 ? sampleData[index].dryWtPan : '',
      wtWater: '',
      wtOfPan: index < 5 ? sampleData[index].wtOfPan : '',
      dryWt: '',
      waterContent: '',
      dryUnitWt: '',
    }));
  };

  const getInitialAtterbergLimits = (): AtterbergDish[] => {
    return [
      { dishNo: 1, massWetSampleTare: '', massDrySampleTare: '', tareMass: '', numberOfBlows: '', liquidLimit: '', plasticLimit: '' },
      { dishNo: 2, massWetSampleTare: '', massDrySampleTare: '', tareMass: '', numberOfBlows: '', liquidLimit: '', plasticLimit: '' },
      { dishNo: 3, massWetSampleTare: '', massDrySampleTare: '', tareMass: '', numberOfBlows: '', liquidLimit: '', plasticLimit: '' }
    ];
  };

  const getInitialPassing200 = (): Passing200Dish[] => {
    return [
      { dishNo: 1, dryWtBeforeWash: '', dryWtAfterWash: '', tareWeight: '', passing200Pct: '' }
    ];
  };

  const [soilClassification, setSoilClassification] = useState<string>('');
  const [formData, setFormData] = useState<ProctorData>({
    moldWeight: 4.74,
    moldVolume: 0.0333,
    specificGravity: 2.60,
    columns: getInitialColumns(),
    atterbergLimits: getInitialAtterbergLimits(),
    passing200: getInitialPassing200()
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [_hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedDataRef = useRef<string>('');

  // Calculation functions (defined before use in useEffect)
  const calculateWetWtSample = (wetWtMold: string, wtOfMold: string): string => {
    const wet = parseFloat(wetWtMold);
    const mold = parseFloat(wtOfMold);
    if (isNaN(wet) || isNaN(mold)) return '';
    const result = wet - mold;
    return result.toFixed(3);
  };

  const calculateWetUnitWt = (wetWtSample: string, moldVolume: number): string => {
    const sample = parseFloat(wetWtSample);
    if (isNaN(sample) || moldVolume === 0) return '';
    const result = sample / moldVolume;
    return result.toFixed(2);
  };

  const calculateWtWater = (wetWtPan: string, dryWtPan: string): string => {
    const wet = parseFloat(wetWtPan);
    const dry = parseFloat(dryWtPan);
    if (isNaN(wet) || isNaN(dry)) return '';
    const result = wet - dry;
    return result.toFixed(3);
  };

  const calculateDryWt = (dryWtPan: string, wtOfPan: string): string => {
    const dryPan = parseFloat(dryWtPan);
    const pan = parseFloat(wtOfPan);
    if (isNaN(dryPan) || isNaN(pan)) return '';
    const result = dryPan - pan;
    return result.toFixed(3);
  };

  const calculateWaterContent = (wtWater: string, dryWt: string): string => {
    const water = parseFloat(wtWater);
    const dry = parseFloat(dryWt);
    // Formula: IF(Dry Wt. & Pan = "", "", Wt. Water / Dry Wt. * 100)
    if (isNaN(water) || isNaN(dry) || dry === 0) return '';
    const result = (water / dry) * 100;
    return result.toFixed(1);
  };

  const calculateDryUnitWt = (wetUnitWt: string, waterContent: string): string => {
    const wet = parseFloat(wetUnitWt);
    const water = parseFloat(waterContent);
    // Formula: IF(Dry Wt. & Pan = "", "", Wet Unit Wt. / (1 + Water Content / 100))
    if (isNaN(wet) || isNaN(water)) return '';
    const result = wet / (1 + water / 100);
    return result.toFixed(2);
  };

  // Recalculate all computed fields for a column
  const recalculateColumn = (column: ProctorRow, moldVolume: number): ProctorRow => {
    const wetWtSample = calculateWetWtSample(column.wetWtMold, column.wtOfMold);
    const wetUnitWt = calculateWetUnitWt(wetWtSample, moldVolume);
    const wtWater = calculateWtWater(column.wetWtPan, column.dryWtPan);
    const dryWt = calculateDryWt(column.dryWtPan, column.wtOfPan);
    const waterContent = calculateWaterContent(wtWater, dryWt);
    const dryUnitWt = calculateDryUnitWt(wetUnitWt, waterContent);

    return {
      ...column,
      wetWtSample,
      wetUnitWt,
      wtWater,
      dryWt,
      waterContent,
      dryUnitWt
    };
  };

  // Calculate Zero Air Voids Dry Density
  const calculateZAVDryDensity = (specificGravity: number, moistureContent: number): string => {
    if (!specificGravity || specificGravity <= 0 || isNaN(specificGravity)) return '';
    // Formula: zav = (G * 62.4) / (1 + (w/100) * G)
    const zav = (specificGravity * 62.4) / (1 + (moistureContent / 100) * specificGravity);
    return zav.toFixed(1);
  };

  // Fixed moisture content values for ZAV table
  const zavMoistureValues = [2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];

  // Round a value to nearest whole number
  const roundToWholeNumber = (value: string): string => {
    if (!value || value.trim() === '') {
      return '';
    }
    const trimmed = value.trim();
    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      return trimmed; // Return original if invalid
    }
    return String(Math.round(num));
  };

  // Calculate Liquid Limit for a dish
  const calculateLiquidLimit = (wet: string, dry: string, tare: string, blows: string): string => {
    const wetVal = parseFloat(wet);
    const dryVal = parseFloat(dry);
    const tareVal = parseFloat(tare);
    const blowsVal = parseFloat(blows);
    
    // Guardrails: if any is blank or invalid, return blank
    if (isNaN(wetVal) || isNaN(dryVal) || isNaN(tareVal) || isNaN(blowsVal)) return '';
    if (wet === '' || dry === '' || tare === '' || blows === '') return '';
    
    // Guardrail: avoid divide-by-zero
    const denominator = dryVal - tareVal;
    if (denominator <= 0) return '';
    
    // Formula: LL = ((Wet - Dry) / (Dry - Tare) * 100) * ((Blows / 25) ^ 0.121)
    const moistureRatio = (wetVal - dryVal) / denominator * 100;
    const blowsCorrection = Math.pow(blowsVal / 25, 0.121);
    const liquidLimit = moistureRatio * blowsCorrection;
    
    // Round to nearest whole number
    return String(Math.round(liquidLimit));
  };

  // Calculate Plastic Limit for Dish 3
  const calculatePlasticLimit = (wet: string, dry: string, tare: string): string => {
    const wetVal = parseFloat(wet);
    const dryVal = parseFloat(dry);
    const tareVal = parseFloat(tare);
    
    // Guardrails: if any is blank or invalid, return blank
    if (isNaN(wetVal) || isNaN(dryVal) || isNaN(tareVal)) return '';
    if (wet === '' || dry === '' || tare === '') return '';
    
    // Guardrail: avoid divide-by-zero
    const denominator = dryVal - tareVal;
    if (denominator <= 0) return '';
    
    // Formula: PL = (Wet - Dry) / (Dry - Tare) * 100
    const plasticLimit = (wetVal - dryVal) / denominator * 100;
    
    // Round to nearest whole number
    return String(Math.round(plasticLimit));
  };

  // Calculate Passing #200 Sieve %: ((DryWtBefore - DryWtAfter) / (DryWtBefore - TareWeight)) * 100
  const calculatePassing200 = (dryWtBeforeWash: string, dryWtAfterWash: string, tareWeight: string): string => {
    if (!dryWtBeforeWash || !dryWtAfterWash || !tareWeight ||
        dryWtBeforeWash.trim() === '' || dryWtAfterWash.trim() === '' || tareWeight.trim() === '') {
      return '';
    }

    const before = parseFloat(dryWtBeforeWash);
    const after = parseFloat(dryWtAfterWash);
    const tare = parseFloat(tareWeight);

    if (isNaN(before) || isNaN(after) || isNaN(tare)) {
      return '';
    }

    // Validation: (B - T) must be > 0
    const drySampleMass = before - tare;
    if (drySampleMass <= 0) {
      return ''; // Invalid: tare >= before weight
    }

    // Validation: B must be >= A
    if (before < after) {
      return ''; // Invalid: after weight > before weight
    }

    // Formula: ((B - A) / (B - T)) * 100
    const loss = before - after;
    const passing200Pct = (loss / drySampleMass) * 100;

    // Round to nearest whole percent
    return String(Math.round(passing200Pct));
  };

  // Calculate summary Passing #200 % (average of valid rows)
  const calculatePassing200Summary = (passing200: Passing200Dish[]): string => {
    const validPcts = passing200
      .map(d => {
        const pct = parseFloat(d.passing200Pct);
        return isNaN(pct) ? null : pct;
      })
      .filter((pct): pct is number => pct !== null);

    if (validPcts.length === 0) {
      return '';
    }

    const average = validPcts.reduce((sum, pct) => sum + pct, 0) / validPcts.length;
    return String(Math.round(average));
  };

  // Calculate Maximum Density and Optimum Moisture Content
  const calculateMaxDensityAndOptimumMoisture = (columns: ProctorRow[]): { maxDensity: string; optimumMoisture: string } => {
    // Extract all Dry Unit Wt values as numbers (ignore empty/invalid)
    const dryUnitWtValues = columns
      .map(col => parseFloat(col.dryUnitWt))
      .filter(val => !isNaN(val));

    if (dryUnitWtValues.length === 0) {
      return { maxDensity: '', optimumMoisture: '' };
    }

    // Find maximum Dry Unit Wt
    const maxDryUnitWt = Math.max(...dryUnitWtValues);

    // Find the column index where max occurs (first occurrence if duplicates)
    const maxIndex = columns.findIndex(col => {
      const val = parseFloat(col.dryUnitWt);
      return !isNaN(val) && val === maxDryUnitWt;
    });

    // Get the Water Content at that same column index
    const optimumMoisture = maxIndex >= 0 ? columns[maxIndex].waterContent : '';

    return {
      maxDensity: maxDryUnitWt.toFixed(2),
      optimumMoisture: optimumMoisture || ''
    };
  };

  useEffect(() => {
    loadData();
    
    // Load task history (only for task routes)
    if (isTaskRoute && id) {
      const loadHistory = async () => {
        try {
          const historyData = await tasksAPI.getHistory(parseInt(id));
          setHistory(historyData);
        } catch (err) {
          console.error('Error loading task history:', err);
        }
      };
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isTaskRoute]);

  // Helper to convert values to numbers
  const toNum = (v: any): number => {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(/,/g, "");
    if (s === "") return NaN;
    return Number(s);
  };

  // Prepare Proctor curve points from table data
  const proctorPoints: ProctorPoint[] = useMemo(() => {
    const points: ProctorPoint[] = [];
    formData.columns.forEach(col => {
      // Parse Water Content (%) and Dry Unit Wt (pcf) using toNum()
      const waterContent = toNum(col.waterContent);
      const dryUnitWt = toNum(col.dryUnitWt);
      // Only include points where BOTH values are valid numbers
      if (!isNaN(waterContent) && !isNaN(dryUnitWt)) {
        points.push({ x: waterContent, y: dryUnitWt });
      }
    });
    // Sort by moisture ascending
    return points.sort((a, b) => a.x - b.x);
  }, [formData.columns]);

  // Prepare ZAV curve points - create smooth curve with 0.5 moisture steps for 0-25 range
  const zavPoints: ZAVPoint[] = useMemo(() => {
    if (!formData.specificGravity || formData.specificGravity <= 0) {
      return [];
    }
    // Generate points every 0.5 from 0 to 25 for smooth curve
    // Ensure we start at 0, not negative
    const zavMoistureSteps: number[] = [];
    for (let w = 0; w <= 25; w += 0.5) {
      zavMoistureSteps.push(Math.max(0, w)); // Ensure no negative values
    }
    return zavMoistureSteps
      .map(moisture => {
        const zavDensity = parseFloat(calculateZAVDryDensity(formData.specificGravity, moisture));
        return { x: moisture, y: zavDensity };
      })
      .filter(point => !isNaN(point.y) && point.x >= 0); // Filter out NaN and negative x
  }, [formData.specificGravity]);

  // Get OMC and Max Dry Density for reference lines
  const { maxDensity, optimumMoisture } = useMemo(() => {
    return calculateMaxDensityAndOptimumMoisture(formData.columns);
  }, [formData.columns]);

  const omcValue = optimumMoisture ? parseFloat(optimumMoisture) : undefined;
  const maxDensityValue = maxDensity ? parseFloat(maxDensity) : undefined;

  // Recalculate all columns on initial mount with sample data
  useEffect(() => {
    setFormData(prev => {
      const updatedColumns = prev.columns.map(col => recalculateColumn(col, prev.moldVolume));
      // Check if any calculations produced new values
      const hasChanges = updatedColumns.some((col, idx) => 
        col.wetWtSample !== prev.columns[idx].wetWtSample ||
        col.wetUnitWt !== prev.columns[idx].wetUnitWt ||
        col.wtWater !== prev.columns[idx].wtWater ||
        col.dryWt !== prev.columns[idx].dryWt ||
        col.waterContent !== prev.columns[idx].waterContent ||
        col.dryUnitWt !== prev.columns[idx].dryUnitWt
      );
      if (hasChanges) {
        return { ...prev, columns: updatedColumns };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount to calculate initial values

  const loadData = async () => {
    try {
      setLoading(true);
      const taskId = parseInt(id!);
      const taskData = await tasksAPI.get(taskId);
      setTask(taskData);
      
      // Try to load saved Proctor data from backend first
      try {
        const savedProctorData = await proctorAPI.getByTask(taskId);
        if (savedProctorData) {
          setSoilClassification(savedProctorData.soilClassification || '');
          // Initialize last saved snapshot with backend data if available
          // We'll update this after form data is fully loaded
        }
      } catch (err) {
        console.log('No Proctor data in database yet, will check localStorage');
      }
      
      // Load saved Proctor draft data from localStorage
      const draftData = localStorage.getItem(`proctor_draft_${taskId}`);
      if (draftData) {
        try {
          const saved = JSON.parse(draftData);
          console.log('Loading Proctor draft data:', saved);
          
          // Restore soilClassification from localStorage if not in DB
          if (!soilClassification && saved.soilClassification) {
            setSoilClassification(saved.soilClassification);
          }
          
          // Restore form data including Atterberg values
          const restoredData: ProctorData = {
            moldWeight: saved.moldWeight ?? 4.74,
            moldVolume: saved.moldVolume ?? 0.0333,
            specificGravity: saved.specificGravity ?? 2.60,
            columns: saved.columns ?? getInitialColumns(),
            atterbergLimits: saved.atterbergLimits ?? getInitialAtterbergLimits(),
            passing200: saved.passing200 && Array.isArray(saved.passing200) && saved.passing200.length > 0
              ? saved.passing200.map((d: any) => ({
                  dishNo: d.dishNo || 1,
                  dryWtBeforeWash: d.dryWtBeforeWash || '',
                  dryWtAfterWash: d.dryWtAfterWash || '',
                  tareWeight: d.tareWeight || '',
                  passing200Pct: calculatePassing200(d.dryWtBeforeWash || '', d.dryWtAfterWash || '', d.tareWeight || '') // Recalculate on load
                }))
              : getInitialPassing200()
          };

          // Recalculate passing200 percentages on load
          const recalculatedPassing200 = restoredData.passing200.map(dish => ({
            ...dish,
            passing200Pct: calculatePassing200(dish.dryWtBeforeWash, dish.dryWtAfterWash, dish.tareWeight)
          }));
          restoredData.passing200 = recalculatedPassing200;
          
          // Recalculate all columns after restoring
          const recalculatedColumns = restoredData.columns.map(col => 
            recalculateColumn(col, restoredData.moldVolume)
          );
          
          // Recalculate Atterberg values if they exist
          const recalculatedAtterberg = restoredData.atterbergLimits.map((dish, idx) => {
            const updatedDish = { ...dish };
            
            // Recalculate Liquid Limit for Dish 1 and Dish 2
            if (idx === 0 || idx === 1) {
              // If we have all required values, recalculate (this will round to whole number)
              if (dish.massWetSampleTare && dish.massDrySampleTare && dish.tareMass && dish.numberOfBlows) {
                const ll = calculateLiquidLimit(
                  dish.massWetSampleTare,
                  dish.massDrySampleTare,
                  dish.tareMass,
                  dish.numberOfBlows
                );
                updatedDish.liquidLimit = ll;
              } else if (dish.liquidLimit) {
                // If manually entered LL exists but can't recalculate, round it
                updatedDish.liquidLimit = roundToWholeNumber(dish.liquidLimit);
              }
            }
            
            // Recalculate Plastic Limit for Dish 3
            if (idx === 2) {
              // If we have all required values, recalculate (this will round to whole number)
              if (dish.massWetSampleTare && dish.massDrySampleTare && dish.tareMass) {
                const pl = calculatePlasticLimit(
                  dish.massWetSampleTare,
                  dish.massDrySampleTare,
                  dish.tareMass
                );
                updatedDish.plasticLimit = pl;
              } else if (dish.plasticLimit) {
                // If manually entered PL exists but can't recalculate, round it
                updatedDish.plasticLimit = roundToWholeNumber(dish.plasticLimit);
              }
            }
            
            return updatedDish;
          });
          
          const finalRestoredData = {
            ...restoredData,
            columns: recalculatedColumns,
            atterbergLimits: recalculatedAtterberg
          };
          setFormData(finalRestoredData);
          
          // Update last saved snapshot after loading
          lastSavedDataRef.current = JSON.stringify({
            formData: finalRestoredData,
            soilClassification: saved.soilClassification || ''
          });
          
          console.log('Restored Atterberg limits:', recalculatedAtterberg);
        } catch (err) {
          console.error('Error parsing draft data:', err);
        }
      }
      
      // TODO: Load saved Proctor data from backend when API is ready
      
      // Initialize last saved snapshot after data is loaded (even if empty)
      // This ensures we can detect changes from the initial state
      if (!lastSavedDataRef.current) {
        lastSavedDataRef.current = JSON.stringify({
          formData,
          soilClassification
        });
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load task data.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoldWeightChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData(prev => {
      const updatedColumns = prev.columns.map(col => {
        const updatedCol = {
          ...col,
          wtOfMold: numValue.toFixed(3)
        };
        return recalculateColumn(updatedCol, prev.moldVolume);
      });
      return { ...prev, moldWeight: numValue, columns: updatedColumns };
    });
  };

  const handleMoldVolumeChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData(prev => {
      const updatedColumns = prev.columns.map(col => recalculateColumn(col, numValue));
      return { ...prev, moldVolume: numValue, columns: updatedColumns };
    });
  };

  const handleSpecificGravityChange = (value: string) => {
    const numValue = parseFloat(value);
    // Validate: must be > 0
    if (isNaN(numValue) || numValue <= 0) {
      setFormData(prev => ({ ...prev, specificGravity: 0 }));
      return;
    }
    setFormData(prev => ({ ...prev, specificGravity: numValue }));
  };

  const handleColumnFieldChange = (columnIndex: number, field: keyof ProctorRow, value: string) => {
    setFormData(prev => {
      const updatedColumns = [...prev.columns];
      updatedColumns[columnIndex] = {
        ...updatedColumns[columnIndex],
        [field]: value
      };
      // Recalculate all computed fields for this column
      updatedColumns[columnIndex] = recalculateColumn(updatedColumns[columnIndex], prev.moldVolume);
      return { ...prev, columns: updatedColumns };
    });
  };

  const handleAtterbergFieldChange = (dishIndex: number, field: keyof AtterbergDish, value: string) => {
    setFormData(prev => {
      const updatedAtterberg = [...prev.atterbergLimits];
      updatedAtterberg[dishIndex] = {
        ...updatedAtterberg[dishIndex],
        [field]: value
      };
      
      // Only recalculate LL/PL if the field being changed is NOT liquidLimit or plasticLimit
      // (i.e., if user is editing mass/dry/tare/blows, recalculate; if editing LL/PL directly, don't recalculate)
      const isEditingLimit = field === 'liquidLimit' || field === 'plasticLimit';
      
      // Recalculate Liquid Limit for Dish 1 and Dish 2 (only if not manually editing liquidLimit)
      if (!isEditingLimit && (dishIndex === 0 || dishIndex === 1)) {
        const dish = updatedAtterberg[dishIndex];
        const ll = calculateLiquidLimit(
          dish.massWetSampleTare,
          dish.massDrySampleTare,
          dish.tareMass,
          dish.numberOfBlows
        );
        updatedAtterberg[dishIndex].liquidLimit = ll;
      }
      
      // Recalculate Plastic Limit for Dish 3 (only if not manually editing plasticLimit)
      if (!isEditingLimit && dishIndex === 2) {
        const dish = updatedAtterberg[dishIndex];
        const pl = calculatePlasticLimit(
          dish.massWetSampleTare,
          dish.massDrySampleTare,
          dish.tareMass
        );
        updatedAtterberg[dishIndex].plasticLimit = pl;
      }
      
      return { ...prev, atterbergLimits: updatedAtterberg };
    });
  };

  // Handle blur event to round LL or PL in Atterberg table to whole number
  const handleAtterbergLimitBlur = (dishIndex: number, field: 'liquidLimit' | 'plasticLimit', value: string) => {
    if (!isEditable) return;
    const rounded = roundToWholeNumber(value);
    if (rounded !== value && rounded !== '') {
      handleAtterbergFieldChange(dishIndex, field, rounded);
    }
  };

  // Handle Enter key to round LL or PL in Atterberg table
  const handleAtterbergLimitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dishIndex: number, field: 'liquidLimit' | 'plasticLimit') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentValue = formData.atterbergLimits[dishIndex]?.[field] || '';
      const rounded = roundToWholeNumber(currentValue);
      if (rounded !== currentValue && rounded !== '') {
        handleAtterbergFieldChange(dishIndex, field, rounded);
      }
      e.currentTarget.blur();
    }
  };

  // Handle passing200 table field changes
  const handlePassing200Change = (dishIndex: number, field: keyof Passing200Dish, value: string) => {
    setFormData(prev => {
      const updatedPassing200 = [...prev.passing200];
      updatedPassing200[dishIndex] = {
        ...updatedPassing200[dishIndex],
        [field]: value
      };

      // Auto-calculate Passing #200 % when weights change
      const dish = updatedPassing200[dishIndex];
      const passing200Pct = calculatePassing200(
        dish.dryWtBeforeWash,
        dish.dryWtAfterWash,
        dish.tareWeight
      );
      updatedPassing200[dishIndex].passing200Pct = passing200Pct;

      return { ...prev, passing200: updatedPassing200 };
    });
  };

  // Add new passing200 dish row
  const handleAddPassing200Dish = () => {
    setFormData(prev => {
      const newDishNo = prev.passing200.length > 0 
        ? Math.max(...prev.passing200.map(d => d.dishNo)) + 1 
        : 1;
      const newDish: Passing200Dish = {
        dishNo: newDishNo,
        dryWtBeforeWash: '',
        dryWtAfterWash: '',
        tareWeight: '',
        passing200Pct: ''
      };
      return { ...prev, passing200: [...prev.passing200, newDish] };
    });
  };

  // Remove passing200 dish row
  const handleRemovePassing200Dish = (dishIndex: number) => {
    setFormData(prev => {
      const updatedPassing200 = prev.passing200.filter((_, idx) => idx !== dishIndex);
      // Ensure at least one row remains
      if (updatedPassing200.length === 0) {
        updatedPassing200.push({ dishNo: 1, dryWtBeforeWash: '', dryWtAfterWash: '', tareWeight: '', passing200Pct: '' });
      }
      return { ...prev, passing200: updatedPassing200 };
    });
  };

  // Calculate Final Liquid Limit (average of Dish 1 and Dish 2)
  const calculateFinalLiquidLimit = (): string => {
    const dish1LL = formData.atterbergLimits[0]?.liquidLimit || '';
    const dish2LL = formData.atterbergLimits[1]?.liquidLimit || '';
    
    const ll1 = parseFloat(dish1LL);
    const ll2 = parseFloat(dish2LL);
    
    if (!isNaN(ll1) && !isNaN(ll2)) {
      // Round average to nearest whole number
      const average = (ll1 + ll2) / 2;
      return String(Math.round(average));
    } else if (!isNaN(ll1)) {
      return roundToWholeNumber(dish1LL);
    } else if (!isNaN(ll2)) {
      return roundToWholeNumber(dish2LL);
    }
    return '';
  };

  // Check if there are unsaved changes by comparing current state to last saved
  const checkUnsavedChanges = useCallback(() => {
    if (!task) return false;
    // Compare current form data to last saved snapshot
    const currentData = JSON.stringify({
      formData,
      soilClassification
    });
    return currentData !== lastSavedDataRef.current;
  }, [formData, soilClassification, task]);

  // Track changes whenever form data or soil classification changes
  useEffect(() => {
    if (task && lastSavedDataRef.current !== '') {
      setHasUnsavedChanges(checkUnsavedChanges());
    }
  }, [formData, soilClassification, checkUnsavedChanges, task]);

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      // Calculate computed values for saving
      const { maxDensity, optimumMoisture } = calculateMaxDensityAndOptimumMoisture(formData.columns);
      const finalLiquidLimit = calculateFinalLiquidLimit();
      // Extract Plastic Limit from Dish 3 (atterbergLimits[2])
      const plasticLimit = formData.atterbergLimits[2]?.plasticLimit || '';
      // Calculate Passing #200 summary (average of valid rows)
      const passing200SummaryPct = calculatePassing200Summary(formData.passing200);
      
      // Prepare complete Proctor draft data to save
      const proctorDraftData = {
        // Page 1 inputs
        moldWeight: formData.moldWeight,
        moldVolume: formData.moldVolume,
        specificGravity: formData.specificGravity,
        soilClassification: soilClassification || '',
        columns: formData.columns,
        atterbergLimits: formData.atterbergLimits,
        passing200: formData.passing200, // Add Passing #200 table
        
        // Computed values (normalized keys for Page 2)
        maximumDryDensityPcf: maxDensity,
        optimumMoisturePercent: optimumMoisture,
        specificGravityG: formData.specificGravity.toString(),
        liquidLimitLL: finalLiquidLimit,
        plasticLimit: plasticLimit,
        passing200SummaryPct: passing200SummaryPct, // Add summary percentage
        
        // Chart data
        proctorPoints: proctorPoints,
        zavPoints: zavPoints,
        
        // Timestamp
        savedAt: new Date().toISOString()
      };
      
      // Prepare data for database (using API format with canonical keys)
      const proctorAPIData = {
        projectName: task.projectName || '',
        projectNumber: task.projectNumber || '',
        sampledBy: 'MAK Lonestar Consulting, LLC', // Default value
        testMethod: 'ASTM D698', // Default value
        client: '',
        soilClassification: soilClassification || '',
        // Canonical fields (preferred)
        optMoisturePct: optimumMoisture ? parseFloat(optimumMoisture) : null,
        maxDryDensityPcf: maxDensity ? parseFloat(maxDensity) : null,
        // Legacy fields (for backward compatibility)
        maximumDryDensityPcf: maxDensity || '',
        optimumMoisturePercent: optimumMoisture || '',
        liquidLimitLL: finalLiquidLimit || '',
        plasticLimit: plasticLimit || '',
        plasticityIndex: '',
        sampleDate: '',
        calculatedBy: '',
        reviewedBy: '',
        checkedBy: '',
        percentPassing200: passing200SummaryPct || '', // Use summary as legacy field
        passing200: formData.passing200 || [], // Add Passing #200 table
        passing200SummaryPct: passing200SummaryPct || '', // Add summary percentage
        specificGravityG: formData.specificGravity.toString() || '',
        proctorPoints: proctorPoints || [],
        zavPoints: zavPoints || []
      };
      
      // Save to database
      await proctorAPI.saveByTask(task.id, proctorAPIData);
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem(`proctor_draft_${task.id}`, JSON.stringify(proctorDraftData));
      console.log('Saved Proctor draft data to database and localStorage:', proctorDraftData);
      
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify({
        formData,
        soilClassification
      });
      setHasUnsavedChanges(false);
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (!task) return;
    
    setSaving(true);
    try {
      // Calculate values to pass to Step 2
      const { maxDensity, optimumMoisture } = calculateMaxDensityAndOptimumMoisture(formData.columns);
      const finalLiquidLimit = calculateFinalLiquidLimit();
      // Extract Plastic Limit from Dish 3 (atterbergLimits[2])
      const plasticLimit = formData.atterbergLimits[2]?.plasticLimit || '';
      // Calculate Passing #200 summary (average of valid rows)
      const passing200SummaryPct = calculatePassing200Summary(formData.passing200);

      // Prepare data for database (using API format with canonical keys)
      const proctorAPIData = {
        projectName: task.projectName || '',
        projectNumber: task.projectNumber || '',
        sampledBy: 'MAK Lonestar Consulting, LLC', // Default value
        testMethod: 'ASTM D698', // Default value
        client: '',
        soilClassification: soilClassification || '',
        // Canonical fields (preferred)
        optMoisturePct: optimumMoisture ? parseFloat(optimumMoisture) : null,
        maxDryDensityPcf: maxDensity ? parseFloat(maxDensity) : null,
        // Legacy fields (for backward compatibility)
        maximumDryDensityPcf: maxDensity || '',
        optimumMoisturePercent: optimumMoisture || '',
        liquidLimitLL: finalLiquidLimit || '',
        plasticLimit: plasticLimit || '', // Add Plastic Limit
        plasticityIndex: '',
        sampleDate: '',
        calculatedBy: '',
        reviewedBy: '',
        checkedBy: '',
        percentPassing200: passing200SummaryPct || '', // Use summary as legacy field
        passing200: formData.passing200 || [], // Add Passing #200 table
        passing200SummaryPct: passing200SummaryPct || '', // Add summary percentage
        specificGravityG: formData.specificGravity.toString() || '',
        proctorPoints: proctorPoints || [],
        zavPoints: zavPoints || []
      };
      
      // Save to database BEFORE navigating
      await proctorAPI.saveByTask(task.id, proctorAPIData);
      
      // Also save to localStorage for backward compatibility
      const proctorStep1Data = {
        // Page 1 inputs (for potential restoration)
        moldWeight: formData.moldWeight,
        moldVolume: formData.moldVolume,
        specificGravity: formData.specificGravity,
        soilClassification: soilClassification || '',
        columns: formData.columns,
        atterbergLimits: formData.atterbergLimits,
        passing200: formData.passing200, // Add Passing #200 table
        
        // Computed values (normalized keys for Page 2)
        maximumDryDensityPcf: maxDensity,
        optimumMoisturePercent: optimumMoisture,
        specificGravityG: formData.specificGravity.toString(),
        liquidLimitLL: finalLiquidLimit,
        passing200SummaryPct: passing200SummaryPct, // Add summary percentage
        
        // Chart data
        proctorPoints: proctorPoints,
        zavPoints: zavPoints
      };
      
      console.log('Saving Proctor step1 data to database and localStorage:', proctorStep1Data);
      localStorage.setItem(`proctor_step1_${task.id}`, JSON.stringify(proctorStep1Data));
      
      // Also update the draft data to keep it in sync
      const proctorDraftData = {
        ...proctorStep1Data,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(`proctor_draft_${task.id}`, JSON.stringify(proctorDraftData));
      
      // Update last saved snapshot
      lastSavedDataRef.current = JSON.stringify({
        formData,
        soilClassification
      });
      setHasUnsavedChanges(false);
      
      // Navigate to Step 2
      navigate(`/task/${id}/proctor/summary`);
    } catch (err: any) {
      console.error('Error saving Proctor data before navigation:', err);
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="proctor-form-container">Loading...</div>;
  }

  if (!task) {
    return <div className="proctor-form-container">Task not found.</div>;
  }

  const isEditable = task.status !== 'APPROVED' && (isAdmin() || (task.assignedTechnicianId === user?.id && task.status !== 'READY_FOR_REVIEW'));

  return (
    <div className="proctor-form-container">
      <div className="proctor-form-header">
        <h1>Proctor Test</h1>
        <div className="form-actions">
          <ProjectHomeButton
            projectId={task.projectId}
            onSave={handleSave}
            saving={saving}
          />
          <button type="button" onClick={() => navigate(isAdmin() ? '/dashboard' : '/technician/dashboard')} className="btn-secondary">
            Back
          </button>
          {isEditable && (
            <>
              <button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button 
                type="button" 
                onClick={handleNext}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Next'}
              </button>
            </>
          )}
        </div>
      </div>

      {saveStatus === 'saved' && (
        <div className="save-status saved">Saved</div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="proctor-form">
        {/* Top inputs */}
        <div className="mold-inputs">
          <div className="mold-input-group">
            <label htmlFor="moldWeight">Mold Weight (lb):</label>
            <input
              type="number"
              id="moldWeight"
              value={formData.moldWeight}
              onChange={(e) => handleMoldWeightChange(e.target.value)}
              step="0.001"
              readOnly={!isEditable}
              className={!isEditable ? 'readonly' : ''}
            />
          </div>
          <div className="mold-input-group">
            <label htmlFor="moldVolume">Mold Volume (cf):</label>
            <input
              type="number"
              id="moldVolume"
              value={formData.moldVolume}
              onChange={(e) => handleMoldVolumeChange(e.target.value)}
              step="0.0001"
              readOnly={!isEditable}
              className={!isEditable ? 'readonly' : ''}
            />
          </div>
        </div>

        {/* Summary Results */}
        {(() => {
          const { maxDensity, optimumMoisture } = calculateMaxDensityAndOptimumMoisture(formData.columns);
          return (
            <div className="proctor-summary">
              <div className="summary-field">
                <label>Maximum Density (PCF):</label>
                <div className="summary-value">{maxDensity || '—'}</div>
              </div>
              <div className="summary-field">
                <label>Optimum Moisture Content (%):</label>
                <div className="summary-value">{optimumMoisture || '—'}</div>
              </div>
            </div>
          );
        })()}

        {/* Specific Gravity Input */}
        <div className="specific-gravity-input">
          <div className="mold-input-group">
            <label htmlFor="specificGravity">Specific Gravity (G):</label>
            <input
              type="number"
              id="specificGravity"
              value={formData.specificGravity || ''}
              onChange={(e) => handleSpecificGravityChange(e.target.value)}
              step="0.01"
              min="0.01"
              readOnly={!isEditable}
              className={!isEditable ? 'readonly' : ''}
            />
          </div>
        </div>

        {/* Soil Classification Input */}
        <div className="soil-classification-input">
          <div className="mold-input-group">
            <label htmlFor="soilClassification">Soil Classification:</label>
            <input
              type="text"
              id="soilClassification"
              value={soilClassification}
              onChange={(e) => setSoilClassification(e.target.value)}
              readOnly={!isEditable}
              className={!isEditable ? 'readonly' : ''}
              placeholder="Type soil classification / material description..."
              maxLength={120}
            />
          </div>
        </div>

        {/* Proctor Curve Chart */}
        <ProctorCurveChart
          proctorPoints={proctorPoints}
          zavPoints={zavPoints}
          omc={omcValue}
          maxDryDensity={maxDensityValue}
        />

        {/* Main table */}
        <div className="proctor-table-wrapper">
          <table className="proctor-table">
            <thead>
              <tr>
                <th rowSpan={2}>SUBJECT</th>
                <th colSpan={2}>UNITS</th>
                <th>1</th>
                <th>2</th>
                <th>3</th>
                <th>4</th>
                <th>5</th>
                <th>6</th>
              </tr>
              <tr>
                <th>Type</th>
                <th>Unit</th>
                <th colSpan={6}></th>
              </tr>
            </thead>
            <tbody>
              {/* Pan Number */}
              <tr>
                <td>Pan Number</td>
                <td colSpan={2}></td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.panNumber}
                      onChange={(e) => handleColumnFieldChange(idx, 'panNumber', e.target.value)}
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Block A Separator */}
              <tr className="section-separator">
                <td colSpan={9}></td>
              </tr>

              {/* Wet Wt & Mold */}
              <tr>
                <td>Wet Wt & Mold</td>
                <td>Mass</td>
                <td>lbs</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="number"
                      value={col.wetWtMold}
                      onChange={(e) => handleColumnFieldChange(idx, 'wetWtMold', e.target.value)}
                      step="0.001"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Wt. of Mold */}
              <tr>
                <td>Wt. of Mold</td>
                <td>Mass</td>
                <td>lbs</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="number"
                      value={col.wtOfMold}
                      onChange={(e) => handleColumnFieldChange(idx, 'wtOfMold', e.target.value)}
                      step="0.001"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Wet Wt. Sample (calculated) */}
              <tr>
                <td>Wet Wt. Sample</td>
                <td>Mass</td>
                <td>lbs</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.wetWtSample}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>

              {/* Wet Unit Wt. (calculated) */}
              <tr>
                <td>Wet Unit Wt.</td>
                <td>Mass/Vol.</td>
                <td>P.C.F.</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.wetUnitWt}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>

              {/* Block B Separator */}
              <tr className="section-separator">
                <td colSpan={9}></td>
              </tr>

              {/* Wet Wt. & Pan */}
              <tr>
                <td>Wet Wt. & Pan</td>
                <td>Mass</td>
                <td>g</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="number"
                      value={col.wetWtPan}
                      onChange={(e) => handleColumnFieldChange(idx, 'wetWtPan', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Dry Wt. & Pan */}
              <tr>
                <td>Dry Wt. & Pan</td>
                <td>Mass</td>
                <td>g</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="number"
                      value={col.dryWtPan}
                      onChange={(e) => handleColumnFieldChange(idx, 'dryWtPan', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Wt. Water (calculated) */}
              <tr>
                <td>Wt. Water</td>
                <td>Mass</td>
                <td>g</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.wtWater}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>

              {/* Wt. of Pan */}
              <tr>
                <td>Wt. of Pan</td>
                <td>Mass</td>
                <td>g</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="number"
                      value={col.wtOfPan}
                      onChange={(e) => handleColumnFieldChange(idx, 'wtOfPan', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                ))}
              </tr>

              {/* Dry Wt. (calculated) */}
              <tr>
                <td>Dry Wt.</td>
                <td>Mass</td>
                <td>g</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.dryWt}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>

              {/* Water Content (calculated) */}
              <tr>
                <td>Water Content</td>
                <td>Percent</td>
                <td>%</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.waterContent}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>

              {/* Dry Unit Wt. (calculated) */}
              <tr>
                <td>Dry Unit Wt.</td>
                <td>Mass/Vol.</td>
                <td>P.C.F.</td>
                {formData.columns.map((col, idx) => (
                  <td key={idx}>
                    <input
                      type="text"
                      value={col.dryUnitWt}
                      readOnly
                      className="calculated"
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Atterberg Limits Section */}
        <div className="atterberg-section">
          <h3>Atterberg Limits</h3>
          <div className="atterberg-table-wrapper">
            <table className="atterberg-table">
              <thead>
                <tr>
                  <th>Dish No.</th>
                  <th>Mass of Wet Sample + Tare (g)</th>
                  <th>Mass of Dry Sample + Tare (g)</th>
                  <th>Tare Mass (g)</th>
                  <th>Number of Blows</th>
                  <th>Liquid Limit (%)</th>
                  <th>Plastic Limit (%)</th>
                </tr>
              </thead>
              <tbody>
                {/* Dish 1 */}
                <tr>
                  <td>{formData.atterbergLimits[0]?.dishNo || 1}</td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[0]?.massWetSampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(0, 'massWetSampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[0]?.massDrySampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(0, 'massDrySampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[0]?.tareMass || ''}
                      onChange={(e) => handleAtterbergFieldChange(0, 'tareMass', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[0]?.numberOfBlows || ''}
                      onChange={(e) => handleAtterbergFieldChange(0, 'numberOfBlows', e.target.value)}
                      step="1"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.atterbergLimits[0]?.liquidLimit || ''}
                      onChange={(e) => handleAtterbergFieldChange(0, 'liquidLimit', e.target.value)}
                      onBlur={(e) => handleAtterbergLimitBlur(0, 'liquidLimit', e.target.value)}
                      onKeyDown={(e) => handleAtterbergLimitKeyDown(e, 0, 'liquidLimit')}
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value=""
                      readOnly
                      className="calculated"
                    />
                  </td>
                </tr>

                {/* Dish 2 */}
                <tr>
                  <td>{formData.atterbergLimits[1]?.dishNo || 2}</td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[1]?.massWetSampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(1, 'massWetSampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[1]?.massDrySampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(1, 'massDrySampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[1]?.tareMass || ''}
                      onChange={(e) => handleAtterbergFieldChange(1, 'tareMass', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[1]?.numberOfBlows || ''}
                      onChange={(e) => handleAtterbergFieldChange(1, 'numberOfBlows', e.target.value)}
                      step="1"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.atterbergLimits[1]?.liquidLimit || ''}
                      onChange={(e) => handleAtterbergFieldChange(1, 'liquidLimit', e.target.value)}
                      onBlur={(e) => handleAtterbergLimitBlur(1, 'liquidLimit', e.target.value)}
                      onKeyDown={(e) => handleAtterbergLimitKeyDown(e, 1, 'liquidLimit')}
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value=""
                      readOnly
                      className="calculated"
                    />
                  </td>
                </tr>

                {/* Summary Row - Final Liquid Limit */}
                <tr className="atterberg-summary-row">
                  <td colSpan={5} style={{ textAlign: 'center', fontWeight: 'bold' }}>Liquid Limit</td>
                  <td>
                    <input
                      type="text"
                      value={calculateFinalLiquidLimit()}
                      readOnly
                      className="calculated"
                      style={{ fontWeight: 'bold' }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value=""
                      readOnly
                      className="calculated"
                    />
                  </td>
                </tr>

                {/* Dish 3 - Plastic Limit */}
                <tr>
                  <td>{formData.atterbergLimits[2]?.dishNo || 3}</td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[2]?.massWetSampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(2, 'massWetSampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[2]?.massDrySampleTare || ''}
                      onChange={(e) => handleAtterbergFieldChange(2, 'massDrySampleTare', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={formData.atterbergLimits[2]?.tareMass || ''}
                      onChange={(e) => handleAtterbergFieldChange(2, 'tareMass', e.target.value)}
                      step="0.01"
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value=""
                      readOnly
                      className="calculated"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value=""
                      readOnly
                      className="calculated"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={formData.atterbergLimits[2]?.plasticLimit || ''}
                      onChange={(e) => handleAtterbergFieldChange(2, 'plasticLimit', e.target.value)}
                      onBlur={(e) => handleAtterbergLimitBlur(2, 'plasticLimit', e.target.value)}
                      onKeyDown={(e) => handleAtterbergLimitKeyDown(e, 2, 'plasticLimit')}
                      readOnly={!isEditable}
                      className={!isEditable ? 'readonly' : ''}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Passing #200 Sieve Section */}
          <div className="proctor-section">
            <h3>Passing #200 Sieve (-200)</h3>
            <table className="atterberg-table" style={{ marginTop: '10px' }}>
              <thead>
                <tr>
                  <th>Dish No.</th>
                  <th>Dry Wt Before Wash</th>
                  <th>Dry Wt After Wash</th>
                  <th>Tare Weight</th>
                  <th>Passing #200 Sieve %</th>
                  {isEditable && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {formData.passing200.map((dish, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        value={dish.dishNo}
                        onChange={(e) => {
                          const newDishNo = parseInt(e.target.value) || dish.dishNo;
                          handlePassing200Change(index, 'dishNo', String(newDishNo));
                        }}
                        readOnly={!isEditable}
                        className={!isEditable ? 'readonly' : ''}
                        style={{ width: '60px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={dish.dryWtBeforeWash}
                        onChange={(e) => handlePassing200Change(index, 'dryWtBeforeWash', e.target.value)}
                        readOnly={!isEditable}
                        className={!isEditable ? 'readonly' : ''}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={dish.dryWtAfterWash}
                        onChange={(e) => handlePassing200Change(index, 'dryWtAfterWash', e.target.value)}
                        readOnly={!isEditable}
                        className={!isEditable ? 'readonly' : ''}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={dish.tareWeight}
                        onChange={(e) => handlePassing200Change(index, 'tareWeight', e.target.value)}
                        readOnly={!isEditable}
                        className={!isEditable ? 'readonly' : ''}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={dish.passing200Pct ? `${dish.passing200Pct}%` : ''}
                        readOnly
                        className="calculated"
                        title="Auto-calculated: ((DryWtBefore - DryWtAfter) / (DryWtBefore - TareWeight)) * 100"
                      />
                    </td>
                    {isEditable && (
                      <td>
                        {formData.passing200.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePassing200Dish(index)}
                            style={{ padding: '5px 10px', fontSize: '12px' }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditable && (
              <button
                type="button"
                onClick={handleAddPassing200Dish}
                style={{ marginTop: '10px', padding: '8px 15px' }}
              >
                + Add Dish
              </button>
            )}
          </div>

          {/* Zero Air Voids (ZAV) Curve Data Table */}
          <div className="zav-section">
            <h3>Zero Air Voids (ZAV) Curve Data</h3>
            <div className="zav-table-wrapper">
              <table className="zav-table">
                <thead>
                  <tr>
                    <th>Moisture Content (%)</th>
                    <th>Zero Air Voids Dry Density (pcf)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const { optimumMoisture } = calculateMaxDensityAndOptimumMoisture(formData.columns);
                    const optimumMoistureNum = optimumMoisture ? parseFloat(optimumMoisture) : null;
                    
                    // Find the index of the moisture value closest to OMC
                    let closestIndex = -1;
                    if (optimumMoistureNum !== null) {
                      let minDiff = Infinity;
                      zavMoistureValues.forEach((moisture, index) => {
                        const diff = Math.abs(moisture - optimumMoistureNum);
                        if (diff < minDiff) {
                          minDiff = diff;
                          closestIndex = index;
                        }
                      });
                    }
                    
                    return zavMoistureValues.map((moisture, index) => {
                      const zavDensity = calculateZAVDryDensity(formData.specificGravity, moisture);
                      const shouldHighlight = index === closestIndex;
                      
                      return (
                        <tr key={moisture} className={shouldHighlight ? 'zav-highlight' : ''}>
                          <td>{moisture}</td>
                          <td>{zavDensity || '—'}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* History / Audit Trail / Review Notes (NOT printable, only for task routes) */}
        {isTaskRoute && history.length > 0 && (
          <div className="history-section no-print">
            <h2>Admin Review Notes</h2>
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
                      <strong>{entry.actionType === 'REJECTED' ? 'Rejected' : entry.actionType === 'APPROVED' ? 'Approved' : entry.actionType}</strong> - {message}
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

export default ProctorForm;

