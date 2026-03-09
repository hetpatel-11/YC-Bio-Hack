"use client";

import type { ParetoPoint } from "@/lib/types";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ParetoChartProps {
  data: ParetoPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ParetoChart({ data, selectedId, onSelect }: ParetoChartProps) {
  const frontPoints = data.filter((p) => p.isOnFront);
  const otherPoints = data.filter((p) => !p.isOnFront);

  // Sort front points for line connection
  const sortedFront = [...frontPoints].sort((a, b) => a.plddt - b.plddt);

  // Auto-scale axes with 10% padding around data range
  const plddtValues = data.map((p) => p.plddt);
  const iptmValues = data.map((p) => p.iptm);
  const xDomain: [number, number] = data.length
    ? (() => {
        const min = Math.min(...plddtValues);
        const max = Math.max(...plddtValues);
        const pad = (max - min) * 0.1 || 0.05;
        return [Math.max(0, min - pad), Math.min(1, max + pad)];
      })()
    : [0, 1];
  const yDomain: [number, number] = data.length
    ? (() => {
        const min = Math.min(...iptmValues);
        const max = Math.max(...iptmValues);
        const pad = (max - min) * 0.1 || 0.05;
        return [Math.max(0, min - pad), Math.min(1, max + pad)];
      })()
    : [0, 1];

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          Pareto Front: pLDDT vs ipTM
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Folding confidence vs binding interface quality
        </p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              opacity={0.5}
            />
            <XAxis
              type="number"
              dataKey="plddt"
              name="pLDDT"
              domain={xDomain}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={{ stroke: "var(--color-border)" }}
              label={{
                value: "pLDDT (folding confidence)",
                position: "bottom",
                offset: 5,
                fontSize: 10,
                fill: "var(--color-muted-foreground)",
              }}
            />
            <YAxis
              type="number"
              dataKey="iptm"
              name="ipTM"
              domain={yDomain}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={{ stroke: "var(--color-border)" }}
              label={{
                value: "ipTM",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fontSize: 10,
                fill: "var(--color-muted-foreground)",
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const point = payload[0].payload as ParetoPoint;
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-foreground">
                        {point.candidateId}
                      </p>
                      <p className="text-muted-foreground">
                        pLDDT: {point.plddt.toFixed(3)}
                      </p>
                      <p className="text-muted-foreground">
                        ipTM: {point.iptm.toFixed(3)}
                      </p>
                      {point.isOnFront && (
                        <p className="text-chart-3 font-medium mt-1">
                          Pareto Optimal
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine
              x={0.8}
              stroke="var(--color-accent)"
              strokeDasharray="5 5"
              opacity={0.4}
            />
            <ReferenceLine
              y={0.8}
              stroke="var(--color-accent)"
              strokeDasharray="5 5"
              opacity={0.4}
            />
            {/* Other candidates */}
            <Scatter
              name="Candidates"
              data={otherPoints}
              fill="var(--color-primary)"
              fillOpacity={0.4}
              onClick={(data) => onSelect(data.candidateId)}
              cursor="pointer"
            />
            {/* Pareto front points */}
            <Scatter
              name="Pareto Front"
              data={sortedFront}
              fill="var(--color-chart-3)"
              shape="star"
              onClick={(data) => onSelect(data.candidateId)}
              cursor="pointer"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary opacity-40" />
          <span className="text-xs text-muted-foreground">Candidates</span>
        </div>
        <div className="flex items-center gap-2">
          <Star className="w-3 h-3 text-chart-3 fill-chart-3" />
          <span className="text-xs text-muted-foreground">Pareto Front</span>
        </div>
      </div>
    </div>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
