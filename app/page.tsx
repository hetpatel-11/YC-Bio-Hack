"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Header } from "@/components/header";
import { StatusCards } from "@/components/status-cards";
import { CandidatesTable } from "@/components/candidates-table";
import { ParetoChart } from "@/components/pareto-chart";
import { CandidateDetail } from "@/components/candidate-detail";
import { InsertionChart } from "@/components/insertion-chart";
import { InsertionDiagram } from "@/components/insertion-diagram";
import { ProteinViewer } from "@/components/protein-viewer";
import type { Candidate, InsertionSite, ParetoPoint, PipelineStatus } from "@/lib/types";

type DashboardPayload = {
  candidates: Candidate[];
  status: PipelineStatus;
  paretoData: ParetoPoint[];
  insertionSites: InsertionSite[];
  meta?: {
    mode: "live" | "none";
    sourceFile: string | null;
    tamarindConfigured: boolean;
    anthropicConfigured: boolean;
    running: boolean;
    pid: number | null;
    logFile: string;
    recentLogTail: string[];
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch dashboard data (${response.status})`);
  }
  return (await response.json()) as DashboardPayload;
};

const EMPTY_STATUS: PipelineStatus = {
  currentPhase: "idle",
  gaProgress: {
    currentGeneration: 0,
    totalGenerations: 90,
    bestFitness: 0,
    meanFitness: 0,
  },
  apiCalls: {
    used: 0,
    max: 95,
    esmfoldCalls: 0,
    af2Calls: 0,
  },
  candidatesFound: 0,
};

export default function DashboardPage() {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const { data, error, isLoading, mutate } = useSWR("/api/pipeline", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const candidates = data?.candidates ?? [];
  const status = data?.status ?? EMPTY_STATUS;
  const paretoData = data?.paretoData ?? [];
  const insertionSites = data?.insertionSites ?? [];
  const meta = data?.meta;

  const runAction = async (action: "refresh" | "start_pipeline" | "stop_pipeline") => {
    setIsActionPending(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      setActionMessage(payload.message ?? "Action completed");
      await mutate();
    } catch {
      setActionMessage("Action failed");
    } finally {
      setIsActionPending(false);
    }
  };

  useEffect(() => {
    if (candidates.length === 0) {
      if (selectedCandidateId !== null) {
        setSelectedCandidateId(null);
      }
      return;
    }

    const selectedExists = candidates.some((c) => c.id === selectedCandidateId);
    if (!selectedCandidateId || !selectedExists) {
      setSelectedCandidateId(candidates[0].id);
    }
  }, [candidates, selectedCandidateId]);

  const selectedCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">
        <StatusCards status={status} />

        {isLoading && (
          <div className="bg-card border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
            Loading pipeline results...
          </div>
        )}

        {error && (
          <div className="bg-card border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
            Failed to load live pipeline data from <code>/api/pipeline</code>.
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Backend Runtime</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mode: <span className="font-medium">{meta?.mode ?? "none"}</span>
                {" • "}
                Source: <span className="font-mono">{meta?.sourceFile ?? "none"}</span>
                {" • "}
                Tamarind key:{" "}
                <span className={meta?.tamarindConfigured ? "text-accent" : "text-destructive"}>
                  {meta?.tamarindConfigured ? "configured" : "missing"}
                </span>
                {" • "}
                Claude key:{" "}
                <span className={meta?.anthropicConfigured ? "text-accent" : "text-destructive"}>
                  {meta?.anthropicConfigured ? "configured" : "missing"}
                </span>
                {" • "}
                Process:{" "}
                <span className={meta?.running ? "text-accent" : "text-muted-foreground"}>
                  {meta?.running ? `running (pid ${meta.pid})` : "stopped"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runAction("refresh")}
                disabled={isActionPending}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={() => runAction("start_pipeline")}
                disabled={isActionPending || Boolean(meta?.running)}
                className="px-3 py-1.5 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                Start Pipeline
              </button>
              <button
                onClick={() => runAction("stop_pipeline")}
                disabled={isActionPending || !meta?.running}
                className="px-3 py-1.5 text-xs rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </div>

          {actionMessage && (
            <p className="text-xs text-muted-foreground">{actionMessage}</p>
          )}

          {meta?.recentLogTail && meta.recentLogTail.length > 0 && (
            <pre className="bg-secondary/50 rounded-md p-3 text-xs text-muted-foreground overflow-x-auto max-h-40 overflow-y-auto">
              {meta.recentLogTail.join("\n")}
            </pre>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CandidatesTable
              candidates={candidates}
              selectedId={selectedCandidateId}
              onSelect={setSelectedCandidateId}
            />

            <InsertionDiagram
              sites={insertionSites}
              selectedPosition={selectedCandidate?.insertionPosition || null}
              selectedCandidate={selectedCandidate}
              onSelectPosition={(pos) => {
                const match = candidates.find((c) => c.insertionPosition === pos);
                if (match) setSelectedCandidateId(match.id);
              }}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ParetoChart
                data={paretoData}
                selectedId={selectedCandidateId}
                onSelect={setSelectedCandidateId}
              />
              <InsertionChart
                sites={insertionSites}
                selectedPosition={selectedCandidate?.insertionPosition || null}
              />
            </div>
          </div>

          <div className="space-y-6">
            <CandidateDetail
              candidate={selectedCandidate}
              onClose={() => setSelectedCandidateId(null)}
            />
            <ProteinViewer candidate={selectedCandidate} />
          </div>
        </div>
      </main>
    </div>
  );
}
