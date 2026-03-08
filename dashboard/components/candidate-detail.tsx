"use client";

import type { Candidate } from "@/lib/types";
import { Copy, Download, Star, X } from "lucide-react";
import { useState } from "react";

interface CandidateDetailProps {
  candidate: Candidate | null;
  onClose: () => void;
}

export function CandidateDetail({ candidate, onClose }: CandidateDetailProps) {
  const [copied, setCopied] = useState(false);

  if (!candidate) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center justify-center h-full min-h-[300px]">
        <div className="text-muted-foreground text-center">
          <p className="text-sm">Select a candidate to view details</p>
          <p className="text-xs mt-1">
            Click on any row in the table or point in the chart
          </p>
        </div>
      </div>
    );
  }

  const copySequence = async () => {
    await navigator.clipboard.writeText(candidate.sequence);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Candidate Details
          </h2>
          {candidate.isOnParetoFront && (
            <Star className="w-4 h-4 text-chart-3 fill-chart-3" />
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-secondary transition-colors"
          aria-label="Close details"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Header info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary text-sm font-semibold">
              #{candidate.rank}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {candidate.id}
              </p>
              <p className="text-xs text-muted-foreground">
                {candidate.fpName} @ position {candidate.insertionPosition}
              </p>
            </div>
          </div>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              candidate.fpName === "mVenus"
                ? "bg-chart-3/20 text-chart-3"
                : candidate.fpName === "GFP"
                ? "bg-accent/20 text-accent"
                : "bg-destructive/20 text-destructive"
            }`}
          >
            {candidate.fpName}
          </span>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3">
          <ScoreCard
            label="Local Fitness"
            value={candidate.scores.localFitness}
            description="TMbed + FP + MPNN"
          />
          <ScoreCard
            label="pLDDT"
            value={candidate.scores.plddt}
            description="Folding confidence"
            highlight
          />
          <ScoreCard
            label="pTM"
            value={candidate.scores.ptm}
            description="Overall fold"
          />
          <ScoreCard
            label="ipTM"
            value={candidate.scores.iptm}
            description="Interface quality"
            highlight
          />
        </div>

        {/* Local score breakdown */}
        <div className="border border-border rounded-md p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Local Score Breakdown
          </p>
          <div className="space-y-2">
            <ScoreRow
              label="TMbed (topology)"
              value={candidate.scores.tmbed}
              weight={0.4}
            />
            <ScoreRow
              label="FP Brightness"
              value={candidate.scores.fpBrightness}
              weight={0.35}
            />
            <ScoreRow
              label="ProteinMPNN"
              value={candidate.scores.proteinmpnn}
              weight={0.25}
            />
          </div>
        </div>

        {/* Sequence */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">
              Sequence ({candidate.sequence.length} AA)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={copySequence}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                aria-label="Copy sequence"
              >
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                aria-label="Download FASTA"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
          <div className="relative">
            <pre className="bg-secondary/50 rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto max-h-24 overflow-y-auto break-all whitespace-pre-wrap">
              {candidate.sequence}
            </pre>
            {copied && (
              <div className="absolute top-1 right-1 px-2 py-1 bg-accent text-accent-foreground text-xs rounded">
                Copied!
              </div>
            )}
          </div>
        </div>

        {/* Linker info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div>
            <span className="text-foreground font-medium">Linker:</span>{" "}
            <span className="font-mono">{candidate.linker}</span>
          </div>
          <div>
            <span className="text-foreground font-medium">Insert pos:</span>{" "}
            <span className="font-mono">{candidate.insertionPosition}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md p-3 ${
        highlight ? "bg-primary/10 border border-primary/20" : "bg-secondary/50"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value.toFixed(3)}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs text-foreground w-10 text-right">
        {value.toFixed(2)}
      </span>
      <span className="text-xs text-muted-foreground w-8">
        x{weight.toFixed(2)}
      </span>
    </div>
  );
}
