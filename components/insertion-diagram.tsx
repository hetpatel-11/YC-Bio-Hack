"use client";

import type { Candidate, InsertionSite } from "@/lib/types";
import { useState } from "react";

interface InsertionDiagramProps {
  sites: InsertionSite[];
  selectedPosition: number | null;
  selectedCandidate?: Candidate | null;
  onSelectPosition?: (position: number) => void;
}

const NUM_HELICES = 7;
const HELIX_WIDTH = 24;
const HELIX_HEIGHT = 82;
const HELIX_GAP = 14;
const HELIX_COLOR = "#7c3aed";
const HELIX_STROKE = "#5b21b6";
const ICL3_COLOR = "#06b6d4";
const CPGFP_COLOR = "#22c55e";
const CPGFP_STROKE = "#15803d";
const INSERTION_COLOR = "#f97316";
const INSERTION_STROKE = "#ea580c";
const REPORTER_COLOR = "#eab308";
const REPORTER_STROKE = "#a16207";

const SVG_W = 600;
const SVG_H = 280;

// Membrane sits in the middle
const MEMBRANE_Y = 110;
const MEMBRANE_H = 44;
const ICL3_START = 205;
const ICL3_END = 252;

const BLOCK_W = NUM_HELICES * HELIX_WIDTH + (NUM_HELICES - 1) * HELIX_GAP;
const BLOCK_X = (SVG_W - BLOCK_W) / 2;

function helixCx(i: number) {
  return BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP) + HELIX_WIDTH / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Loop path: connects edges of two adjacent helices with a bezier arc
function loopPath(x1: number, x2: number, baseY: number, up: boolean, amp = 24): string {
  const mid = (x1 + x2) / 2;
  const peak = up ? baseY - amp : baseY + amp;
  return `M ${x1} ${baseY} Q ${mid} ${peak} ${x2} ${baseY}`;
}

function quadBezierY(t: number, y0: number, y1: number, y2: number) {
  const u = 1 - t;
  return u * u * y0 + 2 * u * t * y1 + t * t * y2;
}

function FpBlob({ cx, cy, r, active }: { cx: number; cy: number; r: number; active: boolean }) {
  return (
    <g>
      {active && (
        <circle cx={cx} cy={cy} r={r + 10} fill={CPGFP_COLOR} opacity={0.15} />
      )}
      <path
        d={`
          M ${cx} ${cy - r}
          C ${cx + r * 0.9} ${cy - r * 1.1}, ${cx + r * 1.3} ${cy - r * 0.3}, ${cx + r * 0.9} ${cy + r * 0.4}
          C ${cx + r * 0.6} ${cy + r * 1.1}, ${cx - r * 0.4} ${cy + r * 1.2}, ${cx - r * 0.9} ${cy + r * 0.5}
          C ${cx - r * 1.4} ${cy - r * 0.1}, ${cx - r * 1.1} ${cy - r * 0.9}, ${cx} ${cy - r}
          Z
        `}
        fill={CPGFP_COLOR}
        stroke={CPGFP_STROKE}
        strokeWidth={1.2}
        opacity={0.92}
      />
      <ellipse cx={cx - r * 0.28} cy={cy - r * 0.38} rx={r * 0.28} ry={r * 0.18} fill="white" opacity={0.32} />
    </g>
  );
}

export function InsertionDiagram({
  sites,
  selectedPosition,
  selectedCandidate = null,
  onSelectPosition,
}: InsertionDiagramProps) {
  const [zoom, setZoom] = useState(1);
  const sortedSites = [...sites].sort((a, b) => b.score - a.score);
  const activePosition =
    selectedCandidate?.insertionPosition ?? selectedPosition ?? sortedSites[0]?.position ?? null;
  const activeSite =
    activePosition !== null
      ? sortedSites.find((site) => site.position === activePosition) ?? null
      : null;

  // ICL3 is between TM5 and TM6 in this topology model.
  const loopHelixA = 4;
  const loopHelixB = 5;
  const x1 = helixCx(loopHelixA) + HELIX_WIDTH / 2 - 1;
  const x2 = helixCx(loopHelixB) - HELIX_WIDTH / 2 + 1;
  const baseY = MEMBRANE_Y + HELIX_HEIGHT - 10;
  const peakY = baseY + 30;

  const insertionNorm =
    activePosition !== null
      ? clamp((activePosition - ICL3_START) / (ICL3_END - ICL3_START), 0, 1)
      : 0.5;
  const insertionX = x1 + (x2 - x1) * insertionNorm;
  const insertionY = quadBezierY(insertionNorm, baseY, peakY, baseY);

  const fpX = insertionX;
  const fpY = insertionY + 22;

  const reporterAttached = Boolean(
    selectedCandidate?.pdbData &&
      selectedCandidate.sequence &&
      Number.isFinite(selectedCandidate.insertionPosition)
  );
  const signalStrength = reporterAttached && selectedCandidate
    ? clamp(selectedCandidate.scores.plddt * 0.65 + selectedCandidate.scores.iptm * 0.35, 0, 1)
    : 0;
  const reporterX = fpX + 42;
  const reporterY = fpY + 18;
  const glowRadius = 15 + signalStrength * 18;
  const glowOpacity = 0.12 + signalStrength * 0.38;
  const pulseDurationSec = (2.8 - signalStrength * 1.6).toFixed(2);
  const pulseRadiusLow = Math.max(10, glowRadius * 0.72).toFixed(2);
  const pulseRadiusHigh = glowRadius.toFixed(2);
  const pulseOpacityLow = Math.max(0.08, glowOpacity * 0.42).toFixed(3);
  const pulseOpacityHigh = glowOpacity.toFixed(3);
  const zoomPercent = Math.round(zoom * 100);

  const zoomOut = () => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))));
  const zoomIn = () => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))));

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">FP Insertion Site Visualization</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Data-driven ICL3 insertion model (SSTR2 residues {ICL3_START}-{ICL3_END}).
            cpGFP is attached at the selected insertion residue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary"
            aria-label="Zoom out insertion diagram"
          >
            -
          </button>
          <span className="text-[11px] text-muted-foreground w-10 text-center">{zoomPercent}%</span>
          <button
            type="button"
            onClick={zoomIn}
            className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary"
            aria-label="Zoom in insertion diagram"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex justify-center overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W * zoom}
          height={SVG_H * zoom}
          className="max-w-full"
          aria-label="GPCR FP insertion site diagram"
        >
          <defs>
            <marker id="arrowOrange" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 z" fill="#f97316" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ── Extracellular label ── */}
          <text x={BLOCK_X - 8} y={MEMBRANE_Y - 8} fontSize={9} fill="#9ca3af" textAnchor="end" fontStyle="italic">
            extracellular
          </text>

          {/* ── Intracellular label ── */}
          <text x={BLOCK_X - 8} y={MEMBRANE_Y + MEMBRANE_H + 14} fontSize={9} fill="#9ca3af" textAnchor="end" fontStyle="italic">
            intracellular
          </text>

          {/* ── Lipid bilayer ── */}
          <rect
            x={BLOCK_X - 24}
            y={MEMBRANE_Y}
            width={BLOCK_W + 48}
            height={MEMBRANE_H / 2}
            fill="#d9f99d"
            rx={3}
          />
          <rect
            x={BLOCK_X - 24}
            y={MEMBRANE_Y + MEMBRANE_H / 2}
            width={BLOCK_W + 48}
            height={MEMBRANE_H / 2}
            fill="#bef264"
            rx={3}
          />
          {/* Phospholipid heads */}
          {Array.from({ length: 20 }).map((_, i) => {
            const x = BLOCK_X - 14 + i * ((BLOCK_W + 28) / 20);
            return (
              <g key={i}>
                <ellipse cx={x} cy={MEMBRANE_Y + 7} rx={5} ry={4} fill="#a3e635" opacity={0.65} />
                <ellipse cx={x} cy={MEMBRANE_Y + MEMBRANE_H - 7} rx={5} ry={4} fill="#a3e635" opacity={0.65} />
              </g>
            );
          })}

          {/* ── N-terminus extracellular tail ── */}
          <path
            d={`M ${helixCx(0)} ${MEMBRANE_Y - 10} C ${helixCx(0) - 18} ${MEMBRANE_Y - 46}, ${helixCx(0) - 36} ${MEMBRANE_Y - 56}, ${helixCx(0) - 46} ${MEMBRANE_Y - 42}`}
            fill="none"
            stroke="#1e3a8a"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={helixCx(0) - 52} y={MEMBRANE_Y - 40} fontSize={8} fill="#6b7280" textAnchor="middle">N</text>

          {/* ── C-terminus intracellular tail ── */}
          <path
            d={`M ${helixCx(NUM_HELICES - 1)} ${MEMBRANE_Y + HELIX_HEIGHT - 10} C ${helixCx(NUM_HELICES - 1) + 18} ${MEMBRANE_Y + HELIX_HEIGHT + 18}, ${helixCx(NUM_HELICES - 1) + 28} ${MEMBRANE_Y + HELIX_HEIGHT + 36}, ${helixCx(NUM_HELICES - 1) + 18} ${MEMBRANE_Y + HELIX_HEIGHT + 46}`}
            fill="none"
            stroke="#1e3a8a"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={helixCx(NUM_HELICES - 1) + 28} y={MEMBRANE_Y + HELIX_HEIGHT + 52} fontSize={8} fill="#6b7280" textAnchor="middle">C</text>

          {/* ── Connecting loops ── */}
          {Array.from({ length: NUM_HELICES - 1 }).map((_, i) => {
            const isIcl3 = i === loopHelixA;
            const up = i % 2 === 1;
            const loopStartX = helixCx(i) + HELIX_WIDTH / 2 - 1;
            const loopEndX = helixCx(i + 1) - HELIX_WIDTH / 2 + 1;
            const loopBaseY = up ? MEMBRANE_Y - 10 : MEMBRANE_Y + HELIX_HEIGHT - 10;
            return (
              <path
                key={i}
                d={loopPath(loopStartX, loopEndX, loopBaseY, up, isIcl3 ? 30 : 18)}
                fill="none"
                stroke={isIcl3 ? ICL3_COLOR : "#64748b"}
                strokeWidth={isIcl3 ? 2.6 : 1.3}
                strokeLinecap="round"
              />
            );
          })}

          {/* ── Transmembrane helices ── */}
          {Array.from({ length: NUM_HELICES }).map((_, i) => (
            <rect
              key={i}
              x={BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP)}
              y={MEMBRANE_Y - 12}
              width={HELIX_WIDTH}
              height={HELIX_HEIGHT}
              rx={6}
              fill={HELIX_COLOR}
              stroke={HELIX_STROKE}
              strokeWidth={1.5}
            />
          ))}

          {/* ICL3 position marker (real residue index within 205-252 window) */}
          {activePosition !== null && (
            <g>
              <circle cx={insertionX} cy={insertionY} r={4.4} fill={INSERTION_COLOR} stroke={INSERTION_STROKE} strokeWidth={1} />
              <text x={insertionX} y={insertionY + 18} fontSize={8} fill={INSERTION_COLOR} textAnchor="middle">
                ICL3 @{activePosition}
              </text>
            </g>
          )}

          {/* FP module attached at insertion site */}
          <FpBlob cx={fpX} cy={fpY} r={18} active={reporterAttached} />
          <text x={fpX} y={fpY - 26} fontSize={9} fill={CPGFP_STROKE} textAnchor="middle" fontWeight="700">
            cpGFP
          </text>

          {/* Physical attachment tether (insertion -> cpGFP -> reporter) */}
          <line
            x1={insertionX}
            y1={insertionY + 5}
            x2={fpX}
            y2={fpY - 16}
            stroke={INSERTION_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd="url(#arrowOrange)"
          />
          <line
            x1={fpX + 18}
            y1={fpY + 6}
            x2={reporterX - 13}
            y2={reporterY - 2}
            stroke={reporterAttached ? REPORTER_COLOR : "#94a3b8"}
            strokeWidth={2}
          />

          {/* Reporter pulse is gated by real attachment + confidence scores from the selected candidate */}
          {reporterAttached && (
            <circle
              cx={reporterX}
              cy={reporterY}
              r={glowRadius}
              fill={REPORTER_COLOR}
              opacity={glowOpacity}
              filter="url(#glow)"
            >
              <animate
                attributeName="opacity"
                values={`${pulseOpacityLow};${pulseOpacityHigh};${pulseOpacityLow}`}
                dur={`${pulseDurationSec}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values={`${pulseRadiusLow};${pulseRadiusHigh};${pulseRadiusLow}`}
                dur={`${pulseDurationSec}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
          <circle
            cx={reporterX}
            cy={reporterY}
            r={11}
            fill={reporterAttached ? REPORTER_COLOR : "#cbd5e1"}
            stroke={reporterAttached ? REPORTER_STROKE : "#94a3b8"}
            strokeWidth={1.5}
          />
          <circle cx={reporterX - 3} cy={reporterY - 4} r={3.5} fill="white" opacity={0.45} />
          <text
            x={reporterX + 16}
            y={reporterY + 4}
            fontSize={9}
            fill={reporterAttached ? REPORTER_STROKE : "#64748b"}
            fontWeight="600"
          >
            reporter {reporterAttached ? "attached" : "detached"}
          </text>
          <text x={reporterX} y={reporterY + 24} fontSize={8} fill="#9ca3af" textAnchor="middle">
            signal {(signalStrength * 100).toFixed(0)}%
          </text>

          {/* ── GPCR badge ── */}
          <text x={SVG_W - 10} y={SVG_H - 8} fontSize={9} fill="#d1d5db" textAnchor="end">
            7-TM GPCR
          </text>
        </svg>
      </div>

      {/* ── Insertion site selector ── */}
      <div className="mt-4 border-t border-border pt-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
          <LegendItem color={HELIX_COLOR} label="TM helices (SSTR2)" />
          <LegendItem color={ICL3_COLOR} label="ICL3 loop (205-252)" />
          <LegendItem color={CPGFP_COLOR} label="cpGFP insertion" />
          <LegendItem color={INSERTION_COLOR} label="Insertion residue" />
          <LegendItem color={REPORTER_COLOR} label="Reporter (attached)" />
        </div>

        <p className="text-xs text-muted-foreground mb-2 font-medium">
          Candidate ICL3 insertion positions:
        </p>
        <div className="flex flex-wrap gap-2">
          {sortedSites.map((site) => {
            const isSelected = site.position === activePosition;
            return (
              <button
                key={site.position}
                onClick={() => onSelectPosition?.(site.position)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground"
                }`}
              >
                <span className="font-mono">@{site.position}</span>
                <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700">ICL3</span>
                <span className="opacity-60">{(site.score * 100).toFixed(0)}%</span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {activeSite
            ? `Selected site @${activeSite.position} with score ${(activeSite.score * 100).toFixed(1)}%. Reporter glow uses real pLDDT/ipTM from the selected candidate.`
            : "Select a site to inspect insertion attachment."}
        </p>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}
