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
  LabelList
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
}

const ProctorCurveChart: React.FC<ProctorCurveChartProps> = ({
  proctorPoints,
  zavPoints,
  omc,
  maxDryDensity
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
    
    // Round maxY to next even number (with headroom)
    // Formula: Math.ceil((dataMaxY + 1) / 2) * 2
    // Examples: 68 → 70, 70 → 72, 69 → 70
    const roundedMaxY = Math.ceil((dataMaxY + 1) / 2) * 2;
    
    // Round minY down to nearest even number (with padding)
    const padding = Math.max(1, (roundedMaxY - minY) * 0.05); // 5% padding at bottom
    const roundedMinY = Math.floor((minY - padding) / 2) * 2;
    
    // Ensure minY doesn't go below 0
    const domainMin = Math.max(0, roundedMinY);
    const domainMax = roundedMaxY;
    
    const domain: [number, number] = [domainMin, domainMax];
    
    console.log('Calculated Y-axis domain:', {
      minY,
      dataMaxY,
      roundedMaxY,
      roundedMinY,
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
    
    // X-axis minimum: minX - 7, clamped to 0 (keep existing left margin rule)
    const xAxisMin = Math.max(0, minX - 7);
    
    // X-axis maximum: maxX + 6 (right-side margin must be <= 6)
    const xAxisMax = maxX + 6;
    
    // Calculate range to determine tick step
    const range = xAxisMax - xAxisMin;
    const tickStep = range <= 14 ? 1 : 2;
    
    // Align xMin down and xMax up to tick step boundaries (after computing xAxisMin/xAxisMax)
    const xMinAligned = Math.floor(xAxisMin / tickStep) * tickStep;
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
      xAxisMin,
      xAxisMax,
      range,
      tickStep,
      xMinAligned,
      xMaxAligned,
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

  // Prepare chart data - combine proctor and ZAV into single dataset
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

    // Add ZAV points - merge with existing moisture values if close
    // Use zavFilteredForRender to exclude points below Y-axis minimum
    zavFilteredForRender.forEach(point => {
      // Double-check: ensure moisture is >= 0
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
  }, [sortedProctorPoints, zavFilteredForRender]);

  // Custom hollow triangle marker for Proctor points
  const HollowTriangleMarker = (props: any) => {
    const { cx, cy } = props;
    if (cx === null || cy === null) return null;
    return (
      <g>
        <path
          d={`M ${cx} ${cy - 4} L ${cx - 4} ${cy + 4} L ${cx + 4} ${cy + 4} Z`}
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
  
  // Use dynamically calculated Y-axis domain
  const yDomain = yAxisDomain;
  
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
          {/* Gridlines */}
          <CartesianGrid 
            stroke="#d0d0d0" 
            strokeDasharray="1 1"
            strokeWidth={0.5}
            vertical={true}
            horizontal={true}
          />

          <XAxis
            type="number"
            dataKey="moisture"
            domain={xDomain}
            ticks={xTicks}
            tick={{ fill: '#000', fontSize: 11, fontWeight: 'bold' }}
            tickLine={{ stroke: '#000', strokeWidth: 1 }}
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
            domain={yDomain}
            ticks={yTicks}
            tick={{ fill: '#000', fontSize: 11, fontWeight: 'bold' }}
            tickLine={{ stroke: '#000', strokeWidth: 1 }}
            axisLine={{ stroke: '#000', strokeWidth: 1.5 }}
            label={{ 
              value: 'Dry Density (LBS. Cu. Ft.)', 
              angle: -90, 
              position: 'insideLeft',
              offset: 25,
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

          {/* Proctor Curve - solid black line with hollow triangles */}
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
          />

          {/* ZAV Curve - thicker black line */}
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
                    // Position label above the curve with adequate spacing
                    return (
                      <g>
                        <text
                          x={x + 15}
                          y={y - 15}
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
                if (cx === null || cy === null) return null;
                return (
                  <g>
                    <path
                      d={`M ${cx} ${cy - 3} L ${cx - 3} ${cy + 3} L ${cx + 3} ${cy + 3} Z`}
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

        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProctorCurveChart;
