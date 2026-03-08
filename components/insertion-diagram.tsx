"use client";

import type { InsertionSite } from "@/lib/types";

interface InsertionDiagramProps {
  sites: InsertionSite[];
  selectedPosition: number | null;
  onSelectPosition?: (position: number) => void;
}

// SSTR2 GPCR topology (N-terminus extracellular):
//   Loop 1 (TM1→TM2): ICL1 — intracellular, not mutable
//   Loop 2 (TM2→TM3): ECL1 — extracellular, res 83–89,  somatostatin binding
//   Loop 3 (TM3→TM4): ICL2 — intracellular, res 117–124
//   Loop 4 (TM4→TM5): ECL2 — extracellular, res 149–173, somatostatin binding
//   Loop 5 (TM5→TM6): ICL3 — intracellular, res 205–252, ← cpGFP insertion
//   Loop 6 (TM6→TM7): ECL3 — extracellular, res 281–287, somatostatin binding

const NUM_HELICES = 7;
const HELIX_WIDTH = 24;
const HELIX_HEIGHT = 80;
const HELIX_GAP = 14;
const HELIX_COLOR = "#b040a0";
const HELIX_STROKE = "#7a1a7a";

const SVG_W = 600;
const SVG_H = 390;

const MEMBRANE_Y = 140;
const MEMBRANE_H = 44;

const BLOCK_W = NUM_HELICES * HELIX_WIDTH + (NUM_HELICES - 1) * HELIX_GAP;
const BLOCK_X = (SVG_W - BLOCK_W) / 2;

function helixCx(i: number) {
  return BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP) + HELIX_WIDTH / 2;
}

// even loop index = ECL (up), odd = ICL (down)
function isEcl(loopIdx: number) { return loopIdx % 2 === 0; }

function loopPath(x1: number, x2: number, baseY: number, up: boolean, amp: number): string {
  const mid = (x1 + x2) / 2;
  const peak = up ? baseY - amp : baseY + amp;
  return `M ${x1} ${baseY} Q ${mid} ${peak} ${x2} ${baseY}`;
}

// Residue ranges for each loop (1-indexed, SSTR2)
const LOOP_INFO: Record<number, { name: string; res: string; ecl: boolean }> = {
  1: { name: "ICL1", res: "",         ecl: false },
  2: { name: "ECL1", res: "83–89",    ecl: true  },
  3: { name: "ICL2", res: "117–124",  ecl: false },
  4: { name: "ECL2", res: "149–173",  ecl: true  },
  5: { name: "ICL3", res: "205–252",  ecl: false },
  6: { name: "ECL3", res: "281–287",  ecl: true  },
};

// ECL loop indices (for somatostatin binding arrows)
const ECL_LOOPS = [2, 4, 6];
// ICL3 is loop 5
const ICL3_LOOP = 5;

function loopMidX(loopIdx: number) {
  const helixA = loopIdx - 1;
  const helixB = loopIdx;
  return (helixCx(helixA) + helixCx(helixB)) / 2;
}

function FpBlob({ cx, cy, r, active }: { cx: number; cy: number; r: number; active: boolean }) {
  return (
    <g>
      {active && <circle cx={cx} cy={cy} r={r + 14} fill="#f97316" opacity={0.13} />}
      <path
        d={`M ${cx} ${cy - r}
            C ${cx + r * 0.9} ${cy - r * 1.1}, ${cx + r * 1.3} ${cy - r * 0.3}, ${cx + r * 0.9} ${cy + r * 0.4}
            C ${cx + r * 0.6} ${cy + r * 1.1}, ${cx - r * 0.4} ${cy + r * 1.2}, ${cx - r * 0.9} ${cy + r * 0.5}
            C ${cx - r * 1.4} ${cy - r * 0.1}, ${cx - r * 1.1} ${cy - r * 0.9}, ${cx} ${cy - r} Z`}
        fill="#f97316" stroke="#ea580c" strokeWidth={1.2} opacity={0.93}
      />
      <ellipse cx={cx - r * 0.28} cy={cy - r * 0.38} rx={r * 0.28} ry={r * 0.18} fill="white" opacity={0.32} />
    </g>
  );
}

function SstBlob({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={38} ry={16} fill="#38bdf8" opacity={0.18} stroke="#0284c7" strokeWidth={1} strokeDasharray="3 2" />
      <ellipse cx={cx} cy={cy} rx={26} ry={11} fill="#38bdf8" opacity={0.35} />
      <text x={cx} y={cy + 4} fontSize={9} fill="#0c4a6e" textAnchor="middle" fontWeight="700">SST-28</text>
    </g>
  );
}

export function InsertionDiagram({ sites, selectedPosition, onSelectPosition }: InsertionDiagramProps) {
  const sortedSites = [...sites].sort((a, b) => b.score - a.score);
  const activePosition = selectedPosition ?? sortedSites[0]?.position ?? null;

  // cpGFP is always at ICL3
  const fpX = loopMidX(ICL3_LOOP);
  const icl3BaseY = MEMBRANE_Y + HELIX_HEIGHT - 10;
  const fpY = icl3BaseY + 70;

  // Somatostatin sits above the 3 ECL loops
  const sstX = loopMidX(4); // ECL2 — roughly centered
  const sstY = 28;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">SSTR2 Biosensor — Insertion Diagram</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Somatostatin-28 (blue) binds the <strong>extracellular loops (ECL1/2/3)</strong>.
          cpGFP (orange) is inserted into <strong>ICL3</strong> (TM5→TM6, residues 205–252).
          Ligand binding deforms ICL3 → cpGFP fluorescence change.
        </p>
      </div>

      <div className="flex justify-center overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W}
          height={SVG_H}
          className="max-w-full"
          aria-label="SSTR2 cpGFP biosensor insertion diagram"
        >
          <defs>
            <marker id="arrowBlue" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 z" fill="#0284c7" />
            </marker>
            <marker id="arrowOrange" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 z" fill="#f97316" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ── Somatostatin-28 ligand (extracellular) ── */}
          <SstBlob cx={sstX} cy={sstY} />
          <text x={sstX} y={sstY - 19} fontSize={8} fill="#0369a1" textAnchor="middle">
            somatostatin-28 (ligand)
          </text>

          {/* Dashed arrows from SST-28 down to each ECL peak */}
          {ECL_LOOPS.map((loopIdx) => {
            const ex = loopMidX(loopIdx);
            const peakY = MEMBRANE_Y - 10 - 30; // ECL arc peak approx
            return (
              <line key={loopIdx}
                x1={sstX} y1={sstY + 16}
                x2={ex} y2={peakY}
                stroke="#0284c7" strokeWidth={1.2} strokeDasharray="4 3"
                markerEnd="url(#arrowBlue)"
              />
            );
          })}

          {/* ── Side labels ── */}
          <text x={BLOCK_X - 10} y={MEMBRANE_Y - 10} fontSize={9} fill="#9ca3af" textAnchor="end" fontStyle="italic">extracellular</text>
          <text x={BLOCK_X - 10} y={MEMBRANE_Y + MEMBRANE_H + 14} fontSize={9} fill="#9ca3af" textAnchor="end" fontStyle="italic">intracellular</text>

          {/* ── Lipid bilayer ── */}
          <rect x={BLOCK_X - 24} y={MEMBRANE_Y} width={BLOCK_W + 48} height={MEMBRANE_H / 2} fill="#e2e8f0" rx={3} />
          <rect x={BLOCK_X - 24} y={MEMBRANE_Y + MEMBRANE_H / 2} width={BLOCK_W + 48} height={MEMBRANE_H / 2} fill="#cbd5e1" rx={3} />
          {Array.from({ length: 20 }).map((_, i) => {
            const x = BLOCK_X - 14 + i * ((BLOCK_W + 28) / 20);
            return (
              <g key={i}>
                <ellipse cx={x} cy={MEMBRANE_Y + 7} rx={5} ry={4} fill="#94a3b8" opacity={0.55} />
                <ellipse cx={x} cy={MEMBRANE_Y + MEMBRANE_H - 7} rx={5} ry={4} fill="#94a3b8" opacity={0.55} />
              </g>
            );
          })}

          {/* ── N-terminus ── */}
          <path d={`M ${helixCx(0)} ${MEMBRANE_Y - 10} C ${helixCx(0) - 18} ${MEMBRANE_Y - 40}, ${helixCx(0) - 34} ${MEMBRANE_Y - 50}, ${helixCx(0) - 44} ${MEMBRANE_Y - 36}`}
            fill="none" stroke="#4a1a7a" strokeWidth={2} strokeLinecap="round" />
          <text x={helixCx(0) - 50} y={MEMBRANE_Y - 34} fontSize={8} fill="#6b7280" textAnchor="middle">N</text>

          {/* ── C-terminus ── */}
          <path d={`M ${helixCx(NUM_HELICES - 1)} ${MEMBRANE_Y + HELIX_HEIGHT - 10} C ${helixCx(NUM_HELICES - 1) + 18} ${MEMBRANE_Y + HELIX_HEIGHT + 18}, ${helixCx(NUM_HELICES - 1) + 26} ${MEMBRANE_Y + HELIX_HEIGHT + 34}, ${helixCx(NUM_HELICES - 1) + 16} ${MEMBRANE_Y + HELIX_HEIGHT + 44}`}
            fill="none" stroke="#4a1a7a" strokeWidth={2} strokeLinecap="round" />
          <text x={helixCx(NUM_HELICES - 1) + 26} y={MEMBRANE_Y + HELIX_HEIGHT + 50} fontSize={8} fill="#6b7280" textAnchor="middle">C</text>

          {/* ── Connecting loops + labels ── */}
          {Array.from({ length: NUM_HELICES - 1 }).map((_, i) => {
            const loopIdx = i + 1;
            const ecl = isEcl(loopIdx);
            const up = ecl;
            const x1 = helixCx(i) + HELIX_WIDTH / 2 - 1;
            const x2 = helixCx(i + 1) - HELIX_WIDTH / 2 + 1;
            const baseY = up ? MEMBRANE_Y - 10 : MEMBRANE_Y + HELIX_HEIGHT - 10;
            const isICL3 = loopIdx === ICL3_LOOP;
            const amp = isICL3 ? 36 : ecl ? 28 : 20;
            const info = LOOP_INFO[loopIdx];
            const midX = (x1 + x2) / 2;
            const labelY = up
              ? baseY - amp - 8
              : baseY + amp + 14;

            return (
              <g key={i}>
                <path
                  d={loopPath(x1, x2, baseY, up, amp)}
                  fill="none"
                  stroke={isICL3 ? "#f97316" : ecl ? "#0284c7" : "#4a1a7a"}
                  strokeWidth={isICL3 ? 2.8 : ecl ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeDasharray={ecl ? "none" : isICL3 ? "none" : "none"}
                />
                {/* Loop name label */}
                <text x={midX} y={labelY} fontSize={8} fill={isICL3 ? "#ea580c" : ecl ? "#0369a1" : "#6b7280"} textAnchor="middle" fontWeight={isICL3 || ecl ? "700" : "400"}>
                  {info.name}
                </text>
                {/* Residue range sub-label */}
                {info.res && (
                  <text x={midX} y={labelY + 10} fontSize={7} fill="#9ca3af" textAnchor="middle">
                    {info.res}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Transmembrane helices ── */}
          {Array.from({ length: NUM_HELICES }).map((_, i) => (
            <g key={i}>
              <rect
                x={BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP)}
                y={MEMBRANE_Y - 12}
                width={HELIX_WIDTH}
                height={HELIX_HEIGHT}
                rx={6}
                fill={HELIX_COLOR}
                stroke={HELIX_STROKE}
                strokeWidth={1.5}
              />
              <text
                x={BLOCK_X + i * (HELIX_WIDTH + HELIX_GAP) + HELIX_WIDTH / 2}
                y={MEMBRANE_Y + HELIX_HEIGHT / 2 - 2}
                fontSize={7}
                fill="white"
                textAnchor="middle"
                fontWeight="600"
                opacity={0.8}
              >
                {i + 1}
              </text>
            </g>
          ))}

          {/* ── cpGFP blob at ICL3 (intracellular) ── */}
          <FpBlob cx={fpX} cy={fpY} r={24} active={activePosition !== null} />
          <text x={fpX} y={fpY + 36} fontSize={9} fill="#ea580c" textAnchor="middle" fontWeight="700">
            cpGFP{activePosition ? ` @${activePosition}` : " @ICL3"}
          </text>
          <text x={fpX} y={fpY + 47} fontSize={7.5} fill="#9ca3af" textAnchor="middle">
            ΔF/F signal output
          </text>

          {/* Arrow from cpGFP up to ICL3 loop */}
          <line
            x1={fpX} y1={fpY - 26}
            x2={fpX} y2={icl3BaseY + 38}
            stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 3"
            markerEnd="url(#arrowOrange)"
          />

          {/* ── GPCR badge ── */}
          <text x={SVG_W - 10} y={SVG_H - 8} fontSize={9} fill="#d1d5db" textAnchor="end">SSTR2 · 7-TM GPCR</text>
        </svg>
      </div>

      {/* ── Insertion site selector ── */}
      {sortedSites.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            ICL3 insertion positions (residues 205–252):
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
                  <span className="text-[10px] px-1 rounded bg-orange-100 text-orange-700">ICL3</span>
                  <span className="opacity-60">{(site.score * 100).toFixed(0)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
