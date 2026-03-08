"use client";

import type { InsertionSite } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface InsertionChartProps {
  sites: InsertionSite[];
  selectedPosition: number | null;
}

export function InsertionChart({ sites, selectedPosition }: InsertionChartProps) {
  const data = sites.map((site) => ({
    ...site,
    label: `@${site.position}`,
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          FP Insertion Site Scores
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Optimal loop regions for fluorescent protein insertion
        </p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 40, right: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              opacity={0.5}
              horizontal={true}
              vertical={false}
            />
            <XAxis
              type="number"
              domain={[0, 1]}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={{ stroke: "var(--color-border)" }}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
              width={45}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const site = payload[0].payload as InsertionSite & {
                    label: string;
                  };
                  return (
                    <div className="bg-card border border-border rounded-md px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-foreground">
                        Position {site.position}
                      </p>
                      <p className="text-muted-foreground">
                        Score: {site.score.toFixed(3)}
                      </p>
                      <p className="text-muted-foreground font-mono">
                        Context: {site.loopContext}
                      </p>
                      <p className="text-muted-foreground">
                        Construct: {site.constructLength} AA
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.position === selectedPosition
                      ? "var(--color-primary)"
                      : "var(--color-primary)"
                  }
                  fillOpacity={entry.position === selectedPosition ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
