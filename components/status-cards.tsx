"use client";

import type { PipelineStatus } from "@/lib/types";
import { Activity, Zap, Target, Database } from "lucide-react";

interface StatusCardsProps {
  status: PipelineStatus;
}

export function StatusCards({ status }: StatusCardsProps) {
  const apiUsagePercent = (status.apiCalls.used / status.apiCalls.max) * 100;

  const phaseLabels: Record<PipelineStatus["currentPhase"], string> = {
    idle: "Idle",
    ga_search: "GA Search",
    esmfold_batch: "ESMFold Batch",
    af2_batch: "AlphaFold2 Batch",
    complete: "Complete",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm text-muted-foreground">Pipeline Status</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">
            {phaseLabels[status.currentPhase]}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{
                width: `${
                  (status.gaProgress.currentGeneration /
                    status.gaProgress.totalGenerations) *
                  100
                }%`,
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Gen {status.gaProgress.currentGeneration}/
            {status.gaProgress.totalGenerations}
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-accent/10">
            <Target className="w-4 h-4 text-accent" />
          </div>
          <span className="text-sm text-muted-foreground">Best Fitness</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">
            {status.gaProgress.bestFitness.toFixed(3)}
          </span>
          <span className="text-sm text-muted-foreground">/ 1.000</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mean: {status.gaProgress.meanFitness.toFixed(3)}
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-chart-3/10">
            <Zap className="w-4 h-4 text-chart-3" />
          </div>
          <span className="text-sm text-muted-foreground">API Budget</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">
            {status.apiCalls.used}
          </span>
          <span className="text-sm text-muted-foreground">
            / {status.apiCalls.max} calls
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                apiUsagePercent > 90
                  ? "bg-destructive"
                  : apiUsagePercent > 70
                  ? "bg-chart-3"
                  : "bg-accent"
              }`}
              style={{ width: `${apiUsagePercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {Math.round(apiUsagePercent)}%
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-chart-4/10">
            <Database className="w-4 h-4 text-chart-4" />
          </div>
          <span className="text-sm text-muted-foreground">Candidates</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">
            {status.candidatesFound}
          </span>
          <span className="text-sm text-muted-foreground">found</span>
        </div>
        <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
          <span>ESMFold: {status.apiCalls.esmfoldCalls}</span>
          <span>AF2: {status.apiCalls.af2Calls}</span>
        </div>
      </div>
    </div>
  );
}
