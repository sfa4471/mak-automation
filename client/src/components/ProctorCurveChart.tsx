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

  // Filter ZAV points to exclude those below Y-axis minimum and above Y-axis maximum (render clipping)
  const yAxisMin = 100; // Fixed Y-axis minimum
  const yAxisMax = 112; // Fixed Y-axis maximum
  const zavFilteredForRender = useMemo(() => {
    return filteredZAVPoints.filter(p => p.y >= yAxisMin && p.y <= yAxisMax);
  }, [filteredZAVPoints]);

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

  // Edge cases
  if (sortedProctorPoints.length < 2) {
    return (
      <div className="proctor-chart-container">
        <div className="chart-message">
          Enter at least 2 valid Water Content + Dry Unit Wt values to plot.
        </div>
      </div>
    );
  }

  // Fixed axis domains
  const xDomain: [number, number] = [0, 25];
  const yDomain: [number, number] = [100, 112];

  // Custom tick formatters
  const xTicks = [0, 5, 10, 15, 20, 25];
  const yTicks = [100, 102, 104, 106, 108, 110, 112];

  return (
    <div className="proctor-chart-container">
      <ResponsiveContainer width="100%" height={500}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 75, bottom: 40 }}
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
            axisLine={{ stroke: '#000', strokeWidth: 1.5 }}
            label={{ 
              value: '% Moisture', 
              position: 'outside', 
              offset: 10,
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
          {omc !== undefined && maxDryDensity !== undefined && !isNaN(omc) && !isNaN(maxDryDensity) && 
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
