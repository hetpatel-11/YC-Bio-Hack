"use client";

import { useState } from "react";
import type { InsertionSite } from "@/lib/types";

interface InsertionDiagramProps {
  sites: InsertionSite[];
  selectedPosition: number | null;
  onSelectPosition?: (position: number) => void;
}

// GPCR with 7 transmembrane helices. The FP (orange blob) always attaches
// on the extracellular (outer) surface — the small molecule binds outside the cell.
// The green intracellular reporter activates regardless of which loop is selected.

const NUM_HELICES = 7;
const HELIX_WIDTH = 24;
const HELIX_HEIGHT = 82;
const HELIX_GAP = 14;
const HELIX_COLOR = "#b040a0";
const HELIX_STROKE = "#7a1a7a";

const SVG_W = 600;
const SVG_H = 280;

// Membrane sits in the middle
const MEMBRANE_Y = 110;
const MEMBRANE_H = 44;

const BLOCK_W = NUM_HELICES * HELIX_WIDTH + (NUM_HELICES - 1) * HELIX_GAP;
const BLOCK_X = (SVG_W - BLOCK_W) / 2;

function helixCx(i: number) {
  return BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP) + HELIX_WIDTH / 2;
}

// Map an insertion position to which inter-helix gap (0 = before H1 n-term, 1 = between H1-H2, … 6 = between H6-H7)
// We have 5 sites; spread them across loops 1-5
function positionToLoopIndex(position: number, allPositions: number[]): number {
  const sorted = [...allPositions].sort((a, b) => b - a);
  const idx = sorted.indexOf(position);
  // Map to loops 1–5  (between helices i and i+1)
  return Math.min(Math.max(idx + 1, 1), 5);
}

// Loop path: connects the top/bottom edge of two adjacent helices with a bezier arc
function loopPath(x1: number, x2: number, baseY: number, up: boolean, amp = 26): string {
  const mid = (x1 + x2) / 2;
  const peak = up ? baseY - amp : baseY + amp;
  return `M ${x1} ${baseY} Q ${mid} ${peak} ${x2} ${baseY}`;
}

function FpBlob({ cx, cy, r, active }: { cx: number; cy: number; r: number; active: boolean }) {
  return (
    <g>
      {active && (
        <circle cx={cx} cy={cy} r={r + 12} fill="#f97316" opacity={0.15} />
      )}
      <path
        d={`
          M ${cx} ${cy - r}
          C ${cx + r * 0.9} ${cy - r * 1.1}, ${cx + r * 1.3} ${cy - r * 0.3}, ${cx + r * 0.9} ${cy + r * 0.4}
          C ${cx + r * 0.6} ${cy + r * 1.1}, ${cx - r * 0.4} ${cy + r * 1.2}, ${cx - r * 0.9} ${cy + r * 0.5}
          C ${cx - r * 1.4} ${cy - r * 0.1}, ${cx - r * 1.1} ${cy - r * 0.9}, ${cx} ${cy - r}
          Z
        `}
        fill="#f97316"
        stroke="#ea580c"
        strokeWidth={1.2}
        opacity={0.92}
      />
      <ellipse cx={cx - r * 0.28} cy={cy - r * 0.38} rx={r * 0.28} ry={r * 0.18} fill="white" opacity={0.32} />
    </g>
  );
}

export function InsertionDiagram({ sites, selectedPosition, onSelectPosition }: InsertionDiagramProps) {
  const sortedSites = [...sites].sort((a, b) => b.score - a.score);
  const activePosition = selectedPosition ?? sortedSites[0]?.position ?? null;

  const allPositions = sites.map((s) => s.position);
  const activeLoopIndex =
    activePosition !== null ? positionToLoopIndex(activePosition, allPositions) : 2;

  // The FP always sits on the EXTRACELLULAR side (outer surface of cell)
  // It lands at the extracellular end of the active loop
  const loopHelixA = activeLoopIndex - 1;
  const loopHelixB = activeLoopIndex;
  const fpX = (helixCx(loopHelixA) + helixCx(loopHelixB)) / 2;
  const fpY = MEMBRANE_Y - 60; // always above the membrane (extracellular)

  // Reporter glows whenever any FP is inserted (always activated since binding always happens)
  const reporterActive = activePosition !== null;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">FP Insertion Site Visualization</h2>
        <p className="text-xs text-muted-foreground mt-1">
          The fluorescent protein (orange) binds on the extracellular surface. Select a candidate
          to see which loop it targets.
        </p>
      </div>

      <div className="flex justify-center overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W}
          height={SVG_H}
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
            fill="#e2e8f0"
            rx={3}
          />
          <rect
            x={BLOCK_X - 24}
            y={MEMBRANE_Y + MEMBRANE_H / 2}
            width={BLOCK_W + 48}
            height={MEMBRANE_H / 2}
            fill="#cbd5e1"
            rx={3}
          />
          {/* Phospholipid heads */}
          {Array.from({ length: 20 }).map((_, i) => {
            const x = BLOCK_X - 14 + i * ((BLOCK_W + 28) / 20);
            return (
              <g key={i}>
                <ellipse cx={x} cy={MEMBRANE_Y + 7} rx={5} ry={4} fill="#94a3b8" opacity={0.55} />
                <ellipse cx={x} cy={MEMBRANE_Y + MEMBRANE_H - 7} rx={5} ry={4} fill="#94a3b8" opacity={0.55} />
              </g>
            );
          })}

          {/* ── N-terminus extracellular tail ── */}
          <path
            d={`M ${helixCx(0)} ${MEMBRANE_Y - 10} C ${helixCx(0) - 18} ${MEMBRANE_Y - 46}, ${helixCx(0) - 36} ${MEMBRANE_Y - 56}, ${helixCx(0) - 46} ${MEMBRANE_Y - 42}`}
            fill="none"
            stroke="#4a1a7a"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={helixCx(0) - 52} y={MEMBRANE_Y - 40} fontSize={8} fill="#6b7280" textAnchor="middle">N</text>

          {/* ── C-terminus intracellular tail ── */}
          <path
            d={`M ${helixCx(NUM_HELICES - 1)} ${MEMBRANE_Y + HELIX_HEIGHT - 10} C ${helixCx(NUM_HELICES - 1) + 18} ${MEMBRANE_Y + HELIX_HEIGHT + 18}, ${helixCx(NUM_HELICES - 1) + 28} ${MEMBRANE_Y + HELIX_HEIGHT + 36}, ${helixCx(NUM_HELICES - 1) + 18} ${MEMBRANE_Y + HELIX_HEIGHT + 46}`}
            fill="none"
            stroke="#4a1a7a"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <text x={helixCx(NUM_HELICES - 1) + 28} y={MEMBRANE_Y + HELIX_HEIGHT + 52} fontSize={8} fill="#6b7280" textAnchor="middle">C</text>

          {/* ── Connecting loops ── */}
          {Array.from({ length: NUM_HELICES - 1 }).map((_, i) => {
            const loopIdx = i + 1;
            // Loops alternate: odd = extracellular, even = intracellular
            const up = loopIdx % 2 === 1;
            const x1 = helixCx(i) + HELIX_WIDTH / 2 - 1;
            const x2 = helixCx(i + 1) - HELIX_WIDTH / 2 + 1;
            const baseY = up ? MEMBRANE_Y - 10 : MEMBRANE_Y + HELIX_HEIGHT - 10;
            const isActive = loopIdx === activeLoopIndex;
            return (
              <path
                key={i}
                d={loopPath(x1, x2, baseY, up, isActive ? 30 : 22)}
                fill="none"
                stroke={isActive ? "#7a1a7a" : "#4a1a7a"}
                strokeWidth={isActive ? 2.5 : 1.8}
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

          {/* ── Intracellular reporter (green ball) ── */}
          {reporterActive && (
            <circle
              cx={helixCx(3)}
              cy={MEMBRANE_Y + HELIX_HEIGHT + 32}
              r={24}
              fill="#22c55e"
              opacity={0.2}
              filter="url(#glow)"
            />
          )}
          <circle
            cx={helixCx(3)}
            cy={MEMBRANE_Y + HELIX_HEIGHT + 32}
            r={11}
            fill={reporterActive ? "#22c55e" : "#86efac"}
            stroke={reporterActive ? "#16a34a" : "#4ade80"}
            strokeWidth={1.5}
          />
          <circle cx={helixCx(3) - 3} cy={MEMBRANE_Y + HELIX_HEIGHT + 28} r={3.5} fill="white" opacity={0.45} />
          <text
            x={helixCx(3) + 16}
            y={MEMBRANE_Y + HELIX_HEIGHT + 36}
            fontSize={9}
            fill="#16a34a"
            fontWeight="600"
          >
            reporter
          </text>

          {/* ── FP blob — always extracellular ── */}
          <FpBlob cx={fpX} cy={fpY} r={20} active={reporterActive} />

          {/* FP label */}
          <text x={fpX} y={fpY - 28} fontSize={9} fill="#ea580c" textAnchor="middle" fontWeight="700">
            FP@{activePosition ?? "—"}
          </text>

          {/* Arrow from FP down to insertion loop */}
          <line
            x1={fpX}
            y1={fpY + 22}
            x2={fpX}
            y2={MEMBRANE_Y - 14}
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd="url(#arrowOrange)"
          />

          {/* ── GPCR badge ── */}
          <text x={SVG_W - 10} y={SVG_H - 8} fontSize={9} fill="#d1d5db" textAnchor="end">
            7-TM GPCR
          </text>
        </svg>
      </div>

      {/* ── Insertion site selector ── */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-2 font-medium">
          Candidate extracellular insertion positions:
        </p>
        <div className="flex flex-wrap gap-2">
          {sortedSites.map((site) => {
            const isSelected = site.position === activePosition;
            const loopIdx = positionToLoopIndex(site.position, allPositions);
            const up = loopIdx % 2 === 1;
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
                <span
                  className={`text-[10px] px-1 rounded ${
                    up
                      ? "bg-blue-100 text-blue-600"
                      : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {up ? "ECL" : "ICL"}
                </span>
                <span className="opacity-60">{(site.score * 100).toFixed(0)}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
