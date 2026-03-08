"use client";

import type { InsertionSite } from "@/lib/types";

interface InsertionDiagramProps {
  sites: InsertionSite[];
  selectedPosition: number | null;
  onSelectPosition?: (position: number) => void;
}

// GPCR has 7 transmembrane helices. We render them as purple rectangles
// spanning the lipid bilayer, connected by extracellular and intracellular loops.
// The FP (orange blob) is placed at the selected insertion loop.
// The green reporter glows when the FP is in the activated (intracellular) position.

const NUM_HELICES = 7;
const HELIX_WIDTH = 22;
const HELIX_HEIGHT = 80;
const HELIX_GAP = 12;
const HELIX_COLOR = "#b040a0";
const HELIX_STROKE = "#7a1a7a";

// SVG canvas dimensions
const SVG_W = 560;
const SVG_H = 260;

// Membrane band
const MEMBRANE_Y = 110;
const MEMBRANE_H = 40;

// Total helix block width
const BLOCK_W = NUM_HELICES * HELIX_WIDTH + (NUM_HELICES - 1) * HELIX_GAP;
const BLOCK_X = (SVG_W - BLOCK_W) / 2;

// Helix x-centers
function helixX(i: number) {
  return BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP) + HELIX_WIDTH / 2;
}

// Map an insertion position (sequence number) to a helix loop index (0 = before h1, 1 = between h1-h2, etc.)
// We have 5 mock sites mapped to loops between helices 2-3, 3-4, 4-5, 5-6, 6-7
// Extracellular loops are between even-odd helix pairs, intracellular between odd-even
function positionToLoopIndex(position: number): number {
  // Sort sites by position and assign loop indices 1..5 (loops between helices)
  const sorted = [142, 120, 100, 78, 55].sort((a, b) => b - a);
  const idx = sorted.indexOf(position);
  return idx === -1 ? 2 : idx + 1; // loops 1..5
}

// Is this loop extracellular (top) or intracellular (bottom)?
function isExtracellular(loopIndex: number) {
  // Loops 1,3,5 are extracellular; 2,4 are intracellular (alternating for a 7-TM GPCR)
  return loopIndex % 2 === 1;
}

// Build the SVG path for a loop connecting two adjacent helices
function loopPath(
  x1: number,
  x2: number,
  baseY: number,
  extracellular: boolean,
  amplitude: number = 28
): string {
  const midX = (x1 + x2) / 2;
  const peakY = extracellular ? baseY - amplitude : baseY + amplitude;
  return `M ${x1} ${baseY} Q ${midX} ${peakY} ${x2} ${baseY}`;
}

// Organic blob shape for the FP
function FpBlob({
  cx,
  cy,
  r,
  color,
  label,
  glow,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  label: string;
  glow?: boolean;
}) {
  const id = `fpBlob-${label}`;
  return (
    <g>
      {glow && (
        <circle cx={cx} cy={cy} r={r + 10} fill={color} opacity={0.18} />
      )}
      {/* Organic shape using a path */}
      <path
        d={`
          M ${cx} ${cy - r}
          C ${cx + r * 0.9} ${cy - r * 1.1}, ${cx + r * 1.3} ${cy - r * 0.3}, ${cx + r * 0.9} ${cy + r * 0.4}
          C ${cx + r * 0.6} ${cy + r * 1.1}, ${cx - r * 0.4} ${cy + r * 1.2}, ${cx - r * 0.9} ${cy + r * 0.5}
          C ${cx - r * 1.4} ${cy - r * 0.1}, ${cx - r * 1.1} ${cy - r * 0.9}, ${cx} ${cy - r}
          Z
        `}
        fill={color}
        stroke={color}
        strokeWidth={1}
        opacity={0.9}
      />
      {/* Highlight */}
      <ellipse
        cx={cx - r * 0.25}
        cy={cy - r * 0.35}
        rx={r * 0.3}
        ry={r * 0.2}
        fill="white"
        opacity={0.35}
      />
    </g>
  );
}

export function InsertionDiagram({
  sites,
  selectedPosition,
  onSelectPosition,
}: InsertionDiagramProps) {
  const sortedSites = [...sites].sort((a, b) => b.score - a.score);
  const activePosition = selectedPosition ?? sortedSites[0]?.position ?? null;

  const activeLoopIndex = activePosition !== null ? positionToLoopIndex(activePosition) : 2;
  const fpIsExtracellular = isExtracellular(activeLoopIndex);
  const isActivated = !fpIsExtracellular; // glow when intracellular

  // The loop is between helix [loopIndex-1] and helix [loopIndex]
  const loopHelixA = activeLoopIndex - 1; // 0-based left helix
  const loopHelixB = activeLoopIndex;     // 0-based right helix

  // FP position at midpoint of the active loop
  const fpX = (helixX(loopHelixA) + helixX(loopHelixB)) / 2;
  const fpY = fpIsExtracellular ? MEMBRANE_Y - 58 : MEMBRANE_Y + MEMBRANE_H + 54;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          FP Insertion Site Visualization
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select an insertion position to see where the fluorescent protein is placed on the GPCR
        </p>
      </div>

      {/* SVG Diagram */}
      <div className="flex justify-center overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W}
          height={SVG_H}
          className="max-w-full"
          style={{ fontFamily: "inherit" }}
        >
          {/* ── Lipid bilayer ── */}
          {/* Outer leaflet */}
          <rect
            x={BLOCK_X - 20}
            y={MEMBRANE_Y}
            width={BLOCK_W + 40}
            height={MEMBRANE_H / 2}
            fill="#d8d8e8"
            rx={3}
            opacity={0.7}
          />
          {/* Inner leaflet */}
          <rect
            x={BLOCK_X - 20}
            y={MEMBRANE_Y + MEMBRANE_H / 2}
            width={BLOCK_W + 40}
            height={MEMBRANE_H / 2}
            fill="#c8c8dc"
            rx={3}
            opacity={0.7}
          />
          {/* Phospholipid head dashes */}
          {Array.from({ length: 18 }).map((_, i) => {
            const x = BLOCK_X - 10 + i * ((BLOCK_W + 20) / 18);
            return (
              <g key={i}>
                <ellipse cx={x} cy={MEMBRANE_Y + 6} rx={5} ry={4} fill="#a0a0c0" opacity={0.5} />
                <ellipse cx={x} cy={MEMBRANE_Y + MEMBRANE_H - 6} rx={5} ry={4} fill="#a0a0c0" opacity={0.5} />
              </g>
            );
          })}

          {/* ── Transmembrane helices ── */}
          {Array.from({ length: NUM_HELICES }).map((_, i) => {
            const x = BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP);
            return (
              <rect
                key={i}
                x={x}
                y={MEMBRANE_Y - 10}
                width={HELIX_WIDTH}
                height={HELIX_HEIGHT}
                rx={5}
                fill={HELIX_COLOR}
                stroke={HELIX_STROKE}
                strokeWidth={1.5}
              />
            );
          })}

          {/* ── Extracellular N-terminus tail ── */}
          <path
            d={`M ${helixX(0)} ${MEMBRANE_Y - 10} C ${helixX(0) - 20} ${MEMBRANE_Y - 50}, ${helixX(0) - 40} ${MEMBRANE_Y - 60}, ${helixX(0) - 50} ${MEMBRANE_Y - 45}`}
            fill="none"
            stroke="#2d1a4a"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* ── Intracellular C-terminus tail ── */}
          <path
            d={`M ${helixX(NUM_HELICES - 1)} ${MEMBRANE_Y + HELIX_HEIGHT - 10} C ${helixX(NUM_HELICES - 1) + 20} ${MEMBRANE_Y + HELIX_HEIGHT + 20}, ${helixX(NUM_HELICES - 1) + 30} ${MEMBRANE_Y + HELIX_HEIGHT + 40}, ${helixX(NUM_HELICES - 1) + 20} ${MEMBRANE_Y + HELIX_HEIGHT + 50}`}
            fill="none"
            stroke="#2d1a4a"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* ── Connecting loops ── */}
          {Array.from({ length: NUM_HELICES - 1 }).map((_, i) => {
            const loopIdx = i + 1; // 1-based
            const extracell = isExtracellular(loopIdx);
            const x1 = helixX(i) + HELIX_WIDTH / 2 - 2;
            const x2 = helixX(i + 1) - HELIX_WIDTH / 2 + 2;
            const baseY = extracell
              ? MEMBRANE_Y - 10
              : MEMBRANE_Y + HELIX_HEIGHT - 10;
            const isActive = loopIdx === activeLoopIndex;
            return (
              <path
                key={i}
                d={loopPath(x1, x2, baseY, extracell, isActive ? 32 : 24)}
                fill="none"
                stroke={isActive ? "#4a1a5a" : "#2d1a4a"}
                strokeWidth={isActive ? 2.5 : 2}
                strokeLinecap="round"
              />
            );
          })}

          {/* ── Intracellular reporter (green ball) ── */}
          {/* Glow when activated */}
          {isActivated && (
            <circle
              cx={helixX(3)}
              cy={MEMBRANE_Y + HELIX_HEIGHT + 30}
              r={22}
              fill="#22c55e"
              opacity={0.25}
            />
          )}
          <circle
            cx={helixX(3)}
            cy={MEMBRANE_Y + HELIX_HEIGHT + 30}
            r={10}
            fill={isActivated ? "#22c55e" : "#4ade80"}
            stroke={isActivated ? "#16a34a" : "#22c55e"}
            strokeWidth={1.5}
          />
          {/* Highlight */}
          <circle
            cx={helixX(3) - 3}
            cy={MEMBRANE_Y + HELIX_HEIGHT + 26}
            r={3}
            fill="white"
            opacity={0.5}
          />

          {/* ── Fluorescent Protein blob ── */}
          <FpBlob
            cx={fpX}
            cy={fpY}
            r={18}
            color="#f97316"
            label="fp"
            glow={isActivated}
          />

          {/* ── Labels ── */}
          <text
            x={BLOCK_X - 22}
            y={MEMBRANE_Y - 2}
            fontSize={9}
            fill="#6b7280"
            textAnchor="end"
          >
            extracellular
          </text>
          <text
            x={BLOCK_X - 22}
            y={MEMBRANE_Y + MEMBRANE_H + 10}
            fontSize={9}
            fill="#6b7280"
            textAnchor="end"
          >
            intracellular
          </text>
          <text
            x={helixX(3) + 14}
            y={MEMBRANE_Y + HELIX_HEIGHT + 34}
            fontSize={9}
            fill="#22c55e"
          >
            reporter
          </text>

          {/* FP label */}
          <text
            x={fpX}
            y={fpY + (fpIsExtracellular ? -24 : 30)}
            fontSize={9}
            fill="#f97316"
            textAnchor="middle"
            fontWeight="600"
          >
            FP ({sites.find((s) => s.position === activePosition)?.position ?? "?"})
          </text>

          {/* Dashed arrow from FP label to blob */}
          <line
            x1={fpX}
            y1={fpY + (fpIsExtracellular ? -20 : 26)}
            x2={fpX}
            y2={fpY + (fpIsExtracellular ? -20 : 22)}
            stroke="#f97316"
            strokeWidth={1}
            strokeDasharray="3 2"
            markerEnd="url(#arrow)"
          />
          <defs>
            <marker
              id="arrow"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L6,3 z" fill="#f97316" />
            </marker>
          </defs>

          {/* ── GPCR label ── */}
          <text
            x={SVG_W - 12}
            y={SVG_H - 10}
            fontSize={9}
            fill="#6b7280"
            textAnchor="end"
          >
            7-TM GPCR
          </text>
        </svg>
      </div>

      {/* ── Insertion site selector ── */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-2">
          Candidate insertion positions (click to select):
        </p>
        <div className="flex flex-wrap gap-2">
          {sortedSites.map((site) => {
            const isSelected = site.position === activePosition;
            const loopIdx = positionToLoopIndex(site.position);
            const extracell = isExtracellular(loopIdx);
            return (
              <button
                key={site.position}
                onClick={() => onSelectPosition?.(site.position)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary hover:text-foreground"
                }`}
              >
                <span className="font-mono">@{site.position}</span>
                <span
                  className={`text-[10px] px-1 rounded ${
                    extracell
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                >
                  {extracell ? "ECL" : "ICL"}
                </span>
                <span className="text-[10px] opacity-70">
                  {(site.score * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
