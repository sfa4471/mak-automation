import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  // LabelList // Unused
} from 'recharts';
import './ProctorCurveChart.css';

export interface ProctorPoint {
  x: number; // Water Content (%)
  y: number; // Dry Unit Wt (pcf)
}

export interface ZAVPoint {
  x: number; // Moisture Content (%)
  y: number; // ZAV Dry Density (pcf)
}

interface ProctorCurveChartProps {
  proctorPoints: ProctorPoint[];
  zavPoints: ZAVPoint[];
  omc?: number; // Optimum Moisture Content
  maxDryDensity?: number; // Maximum Dry Density
  correctedPoint?: ProctorPoint | null; // Corrected point if correction factor is applied
}

const ProctorCurveChart: React.FC<ProctorCurveChartProps> = ({
  proctorPoints,
  zavPoints,
  omc,
  maxDryDensity,
  correctedPoint
}) => {
  // Helper to convert values to numbers
  const toNum = (v: any): number => {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(/,/g, "");
    if (s === "") return NaN;
    return Number(s);
  };

  // TEMPORARY TEST: Hardcoded test data (remove after testing)
  const testProctorPoints = [
    { x: 10.8, y: 103.8 },
    { x: 12.6, y: 107.2 },
    { x: 15.0, y: 110.5 },
  ];
  
  // Use test data for now, then switch back to proctorPoints
  const useTestData = false; // Set to true to test with hardcoded data
  const activeProctorPoints = useTestData ? testProctorPoints : proctorPoints;

  // Clean and validate proctor points - ensure they're numbers
  const cleanedProctorPoints = useMemo(() => {
    return activeProctorPoints
      .map(point => ({
        x: toNum(point.x),
        y: toNum(point.y)
      }))
      .filter(point => !isNaN(point.x) && !isNaN(point.y))
      .sort((a, b) => a.x - b.x);
  }, [activeProctorPoints]);

  // Clean and validate ZAV points
  const cleanedZAVPoints = useMemo(() => {
    return zavPoints
      .map(point => ({
        x: toNum(point.x),
        y: toNum(point.y)
      }))
      .filter(point => !isNaN(point.x) && !isNaN(point.y))
      .sort((a, b) => a.x - b.x);
  }, [zavPoints]);

  // Console logs for debugging
  console.log("proctorPoints (raw):", proctorPoints);
  console.log("cleanedProctorPoints:", cleanedProctorPoints);
  console.log("zavPoints (raw):", zavPoints);
  console.log("cleanedZAVPoints:", cleanedZAVPoints);
  console.log("omc:", omc, "maxDryDensity:", maxDryDensity);

  // Sort proctor points by x (moisture content) for proper line connection
  const sortedProctorPoints = cleanedProctorPoints;

  // Filter and clamp ZAV points - ensure moisture >= 0 and <= 25
  const filteredZAVPoints = useMemo(() => {
    if (cleanedZAVPoints.length === 0) return [];
    // Clamp/filter moisture so x >= 0 and <= 25
    // First filter out any invalid or negative values
    const zavPointsClamped = cleanedZAVPoints
      .filter(p => typeof p.x === "number" && !isNaN(p.x) && p.x >= 0 && p.x <= 25)
      .map(p => ({ 
        ...p, 
        x: Math.max(0, Math.min(25, p.x)) // Ensure x is between 0 and 25
      }));
    return zavPointsClamped;
  }, [cleanedZAVPoints]);

  // Calculate dynamic Y-axis domain from Proctor curve data ONLY (ignore ZAV)
  const yAxisDomain = useMemo(() => {
    // Collect Y values ONLY from proctor points and maxDryDensity (peak point)
    const yValues: number[] = [];
    
    // Add proctor curve densities
    cleanedProctorPoints.forEach(p => {
      if (Number.isFinite(p.y)) yValues.push(p.y);
    });
    
    // Add peak point dry density if provided
    if (maxDryDensity !== undefined && maxDryDensity !== null && Number.isFinite(maxDryDensity)) {
      yValues.push(maxDryDensity);
    }
    
    // Filter out any remaining invalid values
    const validYs = yValues.filter(Number.isFinite);
    
    console.log('Y-axis domain calculation (Proctor only):', {
      proctorYs: cleanedProctorPoints.map(p => p.y),
      maxDryDensity,
      allValidYs: validYs
    });
    
    // If no valid values, use default range
    if (validYs.length === 0) {
      console.warn('No valid Y values found, using default domain [0, 10]');
      return [0, 10] as [number, number];
    }
    
    // Calculate min and max from Proctor curve only
    const minY = Math.min(...validYs);
    const dataMaxY = Math.max(...validYs);
    
    // Y-axis max = 5 + max Y value of the curve
    const domainMax = dataMaxY + 5;
    
    // Round minY down to nearest even number (with padding)
    const padding = Math.max(1, (domainMax - minY) * 0.05); // 5% padding at bottom
    const roundedMinY = Math.floor((minY - padding) / 2) * 2;
    
    // Ensure minY doesn't go below 0
    const domainMin = Math.max(0, roundedMinY);
    
    const domain: [number, number] = [domainMin, domainMax];
    
    console.log('Calculated Y-axis domain:', {
      minY,
      dataMaxY,
      domainMin,
      domainMax,
      finalDomain: domain
    });
    
    return domain;
  }, [cleanedProctorPoints, maxDryDensity]);

  const yAxisMin = yAxisDomain[0];
  const yAxisMax = yAxisDomain[1];

  // Calculate dynamic X-axis domain and ticks from Proctor curve data ONLY
  const xAxisConfig = useMemo(() => {
    // Get moisture values ONLY from Proctor curve points
    const moistureValues: number[] = [];
    
    // Add proctor curve moisture values
    cleanedProctorPoints.forEach(p => {
      if (Number.isFinite(p.x)) moistureValues.push(p.x);
    });
    
    // Filter out any remaining invalid values
    const validMoistures = moistureValues.filter(Number.isFinite);
    
    console.log('X-axis domain calculation (Proctor only):', {
      proctorMoistures: cleanedProctorPoints.map(p => p.x),
      allValidMoistures: validMoistures
    });
    
    // If no valid values, use default range
    if (validMoistures.length === 0) {
      console.warn('No valid moisture values found, using default domain [0, 25]');
      return {
        domain: [0, 25] as [number, number],
        ticks: [0, 5, 10, 15, 20, 25],
        xAxisMaxForClipping: 25,
        xAxisMinForClipping: 0
      };
    }
    
    // Calculate min and max from Proctor curve only
    const minX = Math.min(...validMoistures);
    const maxX = Math.max(...validMoistures);
    
    // X-axis maximum: maxX + 6 (right-side margin)
    const xAxisMax = maxX + 6;
    // Left bound: gap between minX and first axis value must not exceed 2 (minX - firstAxisValue <= 2)
    const xAxisMinTentative = Math.max(0, minX - 2);
    
    // Calculate range to determine tick step
    const range = xAxisMax - xAxisMinTentative;
    const tickStep = range <= 14 ? 1 : 2;
    
    // First axis value: smallest multiple of tickStep that is >= minX - 2 and >= 0 (so minX - xMinAligned <= 2)
    const xMinAligned = Math.max(0, Math.ceil((minX - 2) / tickStep) * tickStep);
    const xMaxAligned = Math.ceil(xAxisMax / tickStep) * tickStep;
    
    // Generate ticks from xMinAligned to xMaxAligned with step tickStep
    const ticks: number[] = [];
    for (let x = xMinAligned; x <= xMaxAligned; x += tickStep) {
      ticks.push(x);
    }
    
    const domain: [number, number] = [xMinAligned, xMaxAligned];
    
    // Store xAxisMax for ZAV clipping (use aligned values to match domain)
    const xAxisMaxForClipping = xMaxAligned;
    const xAxisMinForClipping = xMinAligned;
    
    console.log('Calculated X-axis domain and ticks:', {
      minX,
      maxX,
      xAxisMinTentative,
      xAxisMax,
      range,
      tickStep,
      xMinAligned,
      xMaxAligned,
      gapMinXToAxis: minX - xMinAligned,
      finalDomain: domain,
      ticks
    });
    
    return { domain, ticks, xAxisMaxForClipping, xAxisMinForClipping };
  }, [cleanedProctorPoints]);

  // Extract X-axis clipping boundaries (MUST be before zavFilteredForRender)
  const xAxisMax = xAxisConfig.xAxisMaxForClipping;
  const xAxisMin = xAxisConfig.xAxisMinForClipping;

  // Filter ZAV points to exclude those outside Y-axis and X-axis bounds (render clipping)
  // Clip on both Y (density) and X (moisture) axes
  const zavFilteredForRender = useMemo(() => {
    return filteredZAVPoints.filter(p => 
      p.y >= yAxisMin && 
      p.y <= yAxisMax && 
      p.x >= xAxisMin && 
      p.x <= xAxisMax
    );
  }, [filteredZAVPoints, yAxisMin, yAxisMax, xAxisMin, xAxisMax]);

  // Clip ZAV curve to displayed y-axis max (e.g. 114): cap y and add intersection points where curve crosses max
  const effectiveYMaxForClip = yAxisDomain[1] != null ? Math.floor(Number(yAxisDomain[1]) / 2) * 2 : (yAxisDomain[1] as number);
  const zavClippedForChart = useMemo(() => {
    const yMax = effectiveYMaxForClip;
    const points = zavFilteredForRender.slice().sort((a, b) => a.x - b.x);
    if (points.length === 0) return [];
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = i > 0 ? points[i - 1] : null;
      const next = i < points.length - 1 ? points[i + 1] : null;
      if (p.y <= yMax) {
        out.push({ x: p.x, y: p.y });
      } else {
        if (prev && prev.y < yMax) {
          const t = (yMax - prev.y) / (p.y - prev.y);
          const xInt = prev.x + t * (p.x - prev.x);
          out.push({ x: xInt, y: yMax });
        }
        if (next && next.y <= yMax) {
          const t = (yMax - p.y) / (next.y - p.y);
          const xInt = p.x + t * (next.x - p.x);
          out.push({ x: xInt, y: yMax });
        }
      }
    }
    return out.sort((a, b) => a.x - b.x);
  }, [zavFilteredForRender, effectiveYMaxForClip]);

  // Prepare chart data - combine proctor and ZAV into single dataset (ZAV clipped to y-axis max)
  const chartData = useMemo(() => {
    const data: Array<{
      moisture: number;
      dryDensity?: number; // Proctor curve
      zavDensity?: number; // ZAV curve
      zavLabel?: number; // For label positioning
    }> = [];

    // Add proctor points - use 'dryDensity' as the key for Recharts
    sortedProctorPoints.forEach(point => {
      data.push({ moisture: point.x, dryDensity: point.y });
    });

    // Add ZAV points (clipped to y-axis max) - merge with existing moisture values if close
    zavClippedForChart.forEach(point => {
      if (point.x < 0) return;
      const clampedMoisture = Math.max(0, point.x);
      const existing = data.find(d => Math.abs(d.moisture - clampedMoisture) < 0.1);
      if (existing) {
        existing.zavDensity = point.y;
      } else {
        data.push({ moisture: clampedMoisture, zavDensity: point.y });
      }
    });

    const sorted = data.sort((a, b) => a.moisture - b.moisture);
    console.log("chartData:", sorted);
    console.log("filteredZAVPoints (min x):", filteredZAVPoints.length > 0 ? Math.min(...filteredZAVPoints.map(p => p.x)) : "none");
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedProctorPoints, zavClippedForChart]);

  // Custom hollow triangle marker for Proctor points (guard against NaN from missing/invalid data)
  const HollowTriangleMarker = (props: any) => {
    const { cx, cy } = props;
    const x = Number(cx);
    const y = Number(cy);
    if (cx == null || cy == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (
      <g>
        <path
          d={`M ${x} ${y - 4} L ${x - 4} ${y + 4} L ${x + 4} ${y + 4} Z`}
          fill="white"
          stroke="#000"
          strokeWidth={1.5}
        />
      </g>
    );
  };

  // Find ZAV label position (around moisture 17-20) - use filtered render data
  const zavLabelPosition = useMemo(() => {
    if (zavFilteredForRender.length === 0) return null;
    // Find point around moisture 18
    const targetPoint = zavFilteredForRender.find(p => p.x >= 17 && p.x <= 20);
    return targetPoint || zavFilteredForRender[Math.floor(zavFilteredForRender.length * 0.7)];
  }, [zavFilteredForRender]);

  // Use dynamically calculated X-axis domain and ticks (from xAxisConfig calculated above)
  const xDomain = xAxisConfig.domain;
  const xTicks = xAxisConfig.ticks;
  
  // Use dynamically calculated Y-axis domain; cap at displayed max so grid/border don't extend past top tick
  const yDomain = yAxisDomain;
  const effectiveYMax = yDomain[1] != null ? Math.floor(Number(yDomain[1]) / 2) * 2 : yDomain[1];
  const effectiveYDomain: [number, number] = [yDomain[0], effectiveYMax];
  
  // Generate Y-axis ticks with step size of 2 (MUST be before early return)
  const yTicks = useMemo(() => {
    const [min, max] = yDomain;
    // Round min up to nearest even number, round max down to nearest even number
    const roundedMin = Math.ceil(min / 2) * 2;
    const roundedMax = Math.floor(max / 2) * 2;
    
    // Generate ticks with step size of 2
    const ticks: number[] = [];
    for (let y = roundedMin; y <= roundedMax; y += 2) {
      ticks.push(y);
    }
    
    // If no ticks generated (shouldn't happen), add at least min and max
    if (ticks.length === 0) {
      ticks.push(roundedMin, roundedMax);
    }
    
    console.log('Generated Y-axis ticks (step=2):', {
      domain: yDomain,
      roundedMin,
      roundedMax,
      ticks
    });
    
    return ticks;
  }, [yDomain]);

  // Minor grid ticks: 3 equally spaced values between each pair of major ticks (4 equal subdivisions)
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const dedupeSort = (arr: number[]) => {
    const sorted = arr.slice().sort((p, q) => p - q);
    const out: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] > sorted[i - 1]) out.push(sorted[i]);
    }
    return out;
  };
  const xTicksWithMinor = useMemo(() => {
    const out: number[] = [];
    const major = xTicks;
    for (let i = 0; i < major.length; i++) {
      out.push(round4(major[i]));
      if (i < major.length - 1) {
        const a = major[i];
        const b = major[i + 1];
        const step = (b - a) / 4;
        out.push(round4(a + step), round4(a + 2 * step), round4(a + 3 * step));
      }
    }
    return dedupeSort(out);
  }, [xTicks]);

  const yTicksWithMinor = useMemo(() => {
    const out: number[] = [];
    const major = yTicks;
    for (let i = 0; i < major.length; i++) {
      out.push(round4(major[i]));
      if (i < major.length - 1) {
        const a = major[i];
        const b = major[i + 1];
        const step = (b - a) / 4;
        out.push(round4(a + step), round4(a + 2 * step), round4(a + 3 * step));
      }
    }
    return dedupeSort(out);
  }, [yTicks]);

  // Edge cases - check AFTER all hooks are called
  if (sortedProctorPoints.length < 2) {
    return (
      <div className="proctor-chart-container">
        <div className="chart-message">
          Enter at least 2 valid Water Content + Dry Unit Wt values to plot.
        </div>
      </div>
    );
  }

  return (
    <div className="proctor-chart-container">
      <ResponsiveContainer width="100%" height={500}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 75, bottom: 80 }}
        >
          {/* Grid: vertical lines clipped to displayed y range (do not extend past effectiveYMax); grey; behind curves */}
          {xTicksWithMinor.map((v) => (
            <ReferenceLine
              key={`v-${v}`}
              zIndex={0}
              segment={[
                { x: v, y: effectiveYDomain[0] },
                { x: v, y: effectiveYDomain[1] }
              ]}
              stroke="#d0d0d0"
              strokeWidth={1}
            />
          ))}
          {yTicksWithMinor.map((v) => (
            <ReferenceLine key={`h-${v}`} zIndex={0} y={v} stroke="#d0d0d0" strokeWidth={1} />
          ))}

          <XAxis
            type="number"
            dataKey="moisture"
            domain={xDomain}
            ticks={xTicksWithMinor}
            tick={(props) => {
              const { x, y, payload } = props;
              const isMajor = xTicks.includes(payload.value);
              if (!isMajor) return null;
              return (
                <g transform={`translate(${x},${y})`}>
                  <line x1={0} y1={0} x2={0} y2={1} stroke="#000" strokeWidth={1} />
                  <text x={0} y={10} fill="#000" fontSize={11} fontWeight="bold" textAnchor="middle">
                    {payload.value}
                  </text>
                </g>
              );
            }}
            tickLine={false}
            tickMargin={10}
            axisLine={{ stroke: '#000', strokeWidth: 1.5 }}
            label={{
              value: '% Moisture',
              position: 'insideBottom',
              offset: -15,
              style: { textAnchor: 'middle', fill: '#000', fontSize: 12, fontWeight: 'bold' }
            }}
          />
          <YAxis
            type="number"
            domain={effectiveYDomain}
            ticks={yTicks}
            tick={(props) => {
              const { x, y, payload } = props;
              return (
                <g transform={`translate(${x},${y})`}>
                  <line x1={-6} y1={0} x2={0} y2={0} stroke="#000" strokeWidth={1} />
                  <text x={-10} y={4} fill="#000" fontSize={11} fontWeight="bold" textAnchor="end">
                    {payload.value}
                  </text>
                </g>
              );
            }}
            tickLine={false}
            axisLine={{ stroke: '#000', strokeWidth: 1.5 }}
            label={{ 
              value: 'Dry Density (LBS. Cu. Ft.)', 
              angle: -90, 
              position: 'insideLeft',
              offset: -10,
              style: { textAnchor: 'middle', fill: '#000', fontSize: 12, fontWeight: 'bold' }
            }}
          />
          <Tooltip
            formatter={(value: number | undefined, name: string | undefined) => {
              if (value === undefined || isNaN(value) || name === undefined) return ['', ''];
              if (name === 'Proctor' || name === 'dryDensity') return [`${value.toFixed(2)} pcf`, 'Proctor'];
              if (name === 'Zero Air Voids' || name === 'zavDensity') return [`${value.toFixed(2)} pcf`, 'Zero Air Voids'];
              return [`${value.toFixed(2)}`, name];
            }}
            labelFormatter={(label) => `Moisture: ${label}%`}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #000',
              borderRadius: '2px',
              padding: '5px'
            }}
          />

          {/* Proctor Curve - solid black line with hollow triangles (on top of grid) */}
          <Line
            type="monotone"
            dataKey="dryDensity"
            name="Proctor"
            stroke="#000"
            strokeWidth={2}
            dot={<HollowTriangleMarker />}
            activeDot={{ r: 4, fill: '#000' }}
            connectNulls={true}
            isAnimationActive={false}
            zIndex={10}
          />

          {/* ZAV Curve - thicker black line (on top of grid) */}
          {filteredZAVPoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="zavDensity"
              name="Zero Air Voids"
              stroke="#000"
              strokeWidth={2.5}
              connectNulls={true}
              isAnimationActive={false}
              dot={false}
              zIndex={10}
            />
          )}

          {/* Zero Air Voids label - positioned near the curve */}
          {zavLabelPosition && zavFilteredForRender.length > 0 && (
            <Line
              type="monotone"
              dataKey="zavLabel"
              stroke="none"
              dot={(props: any) => {
                // Only render label at the anchor point
                if (!props || !props.payload) return null;
                const moisture = props.payload.moisture || props.payload.x;
                if (Math.abs(moisture - zavLabelPosition.x) < 0.5) {
                  const x = props.cx !== undefined ? props.cx : props.x;
                  const y = props.cy !== undefined ? props.cy : props.y;
                  if (x !== null && y !== null && !isNaN(x) && !isNaN(y)) {
                    // Position label above the curve, slightly down and left so it doesn't overlap
                    return (
                      <g>
                        <text
                          x={x + 12}
                          y={y - 18}
                          fill="#000"
                          fontSize={11}
                          fontWeight="bold"
                          textAnchor="start"
                          className="zav-label"
                        >
                          Zero Air Voids
                        </text>
                      </g>
                    );
                  }
                }
                return null;
              }}
              data={[{ moisture: zavLabelPosition.x, zavLabel: zavLabelPosition.y }]}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* OMC Vertical Reference Line */}
          {omc !== undefined && !isNaN(omc) && omc >= 0 && omc <= 25 && (
            <ReferenceLine
              x={omc}
              stroke="#000"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          )}

          {/* Max Dry Density Horizontal Reference Line */}
          {maxDryDensity !== undefined && !isNaN(maxDryDensity) && maxDryDensity >= yDomain[0] && maxDryDensity <= yDomain[1] && (
            <ReferenceLine
              y={maxDryDensity}
              stroke="#000"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          )}

          {/* Peak Point Marker - small triangle at intersection */}
          {omc !== undefined && maxDryDensity !== undefined && !isNaN(omc) && !isNaN(maxDryDensity) && Number.isFinite(maxDryDensity) && 
           omc >= 0 && omc <= 25 && maxDryDensity >= yDomain[0] && maxDryDensity <= yDomain[1] && (
            <Line
              type="monotone"
              dataKey="peakMarker"
              stroke="none"
              dot={(props: any) => {
                const { cx, cy } = props;
                const x = Number(cx);
                const y = Number(cy);
                if (cx == null || cy == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <g>
                    <path
                      d={`M ${x} ${y - 3} L ${x - 3} ${y + 3} L ${x + 3} ${y + 3} Z`}
                      fill="#000"
                      stroke="#000"
                      strokeWidth={1}
                    />
                  </g>
                );
              }}
              data={[{ moisture: omc, peakMarker: maxDryDensity }]}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Corrected Point Marker - dot similar to other points */}
          {correctedPoint && !isNaN(correctedPoint.x) && !isNaN(correctedPoint.y) && 
           Number.isFinite(correctedPoint.x) && Number.isFinite(correctedPoint.y) &&
           correctedPoint.x >= 0 && correctedPoint.x <= 25 && 
           correctedPoint.y >= yDomain[0] && correctedPoint.y <= yDomain[1] && (
            <Line
              type="monotone"
              dataKey="correctedMarker"
              stroke="none"
              dot={(props: any) => {
                const { cx, cy } = props;
                const x = Number(cx);
                const y = Number(cy);
                if (cx == null || cy == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <g>
                    <circle
                      cx={x}
                      cy={y}
                      r={4}
                      fill="#000"
                      stroke="#000"
                      strokeWidth={1}
                    />
                  </g>
                );
              }}
              data={[{ moisture: correctedPoint.x, correctedMarker: correctedPoint.y }]}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProctorCurveChart;
