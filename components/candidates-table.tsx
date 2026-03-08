"use client";

import type { Candidate } from "@/lib/types";
import { Star, Eye } from "lucide-react";

interface CandidatesTableProps {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CandidatesTable({
  candidates,
  selectedId,
  onSelect,
}: CandidatesTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          Top 5 Candidates
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ranked by combined Tamarind validation scores
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Rank
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                FP
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Position
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Local
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                pLDDT
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                ipTM
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Pareto
              </th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr
                key={candidate.id}
                className={`border-b border-border/50 transition-colors cursor-pointer ${
                  selectedId === candidate.id
                    ? "bg-primary/10"
                    : "hover:bg-secondary/50"
                }`}
                onClick={() => onSelect(candidate.id)}
              >
                <td className="px-4 py-3">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-xs font-medium">
                    {candidate.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      candidate.fpName === "mVenus"
                        ? "bg-chart-3/20 text-chart-3"
                        : candidate.fpName === "GFP"
                        ? "bg-accent/20 text-accent"
                        : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {candidate.fpName}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  @{candidate.insertionPosition}
                </td>
                <td className="px-4 py-3">
                  <ScoreBar value={candidate.scores.localFitness} />
                </td>
                <td className="px-4 py-3">
                  <ScoreBar value={candidate.scores.plddt} color="primary" />
                </td>
                <td className="px-4 py-3">
                  <ScoreBar value={candidate.scores.iptm} color="accent" />
                </td>
                <td className="px-4 py-3">
                  {candidate.isOnParetoFront && (
                    <Star className="w-4 h-4 text-chart-3 fill-chart-3" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(candidate.id);
                    }}
                    aria-label="View candidate details"
                  >
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreBar({
  value,
  color = "muted",
}: {
  value: number;
  color?: "primary" | "accent" | "muted";
}) {
  const colorClasses = {
    primary: "bg-primary",
    accent: "bg-accent",
    muted: "bg-muted-foreground",
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClasses[color]}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
