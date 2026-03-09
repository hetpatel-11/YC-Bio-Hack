"use client";

import type { Candidate } from "@/lib/types";
import { Box, Maximize2, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ProteinViewerProps {
  candidate: Candidate | null;
}

const RECEPTOR_LENGTH = 369;
const CPGFP_SEQUENCE =
  "MTTFKIESRIHGNLNGEKFELVGGGVGEEGRLEIEMKTKDKPLAFSPFLLSHCMGYGFYH" +
  "FASFPKGTKNIYLHAATNGGYTNTRKEIYEDGGILEVNFRYTYEFNKIIGDVECIGHGFP" +
  "SQSPIFKDTIVKSCPTVDLMLPMSGNIIASSYARAFQLKDGSFYTAEVKNNIDFKNPIHE" +
  "SFSKSGPMFTHRRVEETHTKENLAMVEYQQVFNSAPRDM";

type RegionLayout = {
  insertion: number | null;
  fpStart: number | null;
  fpEnd: number | null;
  linkerNStart: number | null;
  linkerNEnd: number | null;
  linkerCStart: number | null;
  linkerCEnd: number | null;
  receptorSuffixStart: number | null;
  sequenceLength: number;
};

function getRegionLayout(candidate: Candidate | null): RegionLayout {
  if (!candidate) {
    return {
      insertion: null,
      fpStart: null,
      fpEnd: null,
      linkerNStart: null,
      linkerNEnd: null,
      linkerCStart: null,
      linkerCEnd: null,
      receptorSuffixStart: null,
      sequenceLength: 0,
    };
  }

  const sequence = candidate.sequence;
  const fpStart0 = sequence.indexOf(CPGFP_SEQUENCE);
  const fpStart = fpStart0 >= 0 ? fpStart0 + 1 : null;
  const fpEnd = fpStart0 >= 0 ? fpStart0 + CPGFP_SEQUENCE.length : null;
  const insertion = Number.isFinite(candidate.insertionPosition)
    ? Math.max(1, Math.round(candidate.insertionPosition))
    : null;

  const suffixLen = insertion !== null ? Math.max(0, RECEPTOR_LENGTH - insertion) : 0;
  const receptorSuffixStart =
    insertion !== null && suffixLen > 0
      ? Math.max(1, sequence.length - suffixLen + 1)
      : null;

  const linkerNStart = insertion !== null ? insertion + 1 : null;
  const linkerNEnd =
    linkerNStart !== null && fpStart !== null && fpStart - 1 >= linkerNStart
      ? fpStart - 1
      : null;
  const linkerCStart = fpEnd !== null ? fpEnd + 1 : null;
  const linkerCEnd =
    linkerCStart !== null &&
    receptorSuffixStart !== null &&
    receptorSuffixStart - 1 >= linkerCStart
      ? receptorSuffixStart - 1
      : null;

  return {
    insertion,
    fpStart,
    fpEnd,
    linkerNStart,
    linkerNEnd,
    linkerCStart,
    linkerCEnd,
    receptorSuffixStart,
    sequenceLength: sequence.length,
  };
}

function inRange(value: number, start: number | null, end: number | null) {
  return start !== null && end !== null && value >= start && value <= end;
}

function regionForResidue(resno: number, layout: RegionLayout) {
  if (layout.insertion !== null && resno === layout.insertion) {
    return { label: "Insertion site", color: "#f97316" };
  }
  if (inRange(resno, layout.fpStart, layout.fpEnd)) {
    return { label: "cpGFP region", color: "#22c55e" };
  }
  if (inRange(resno, layout.linkerNStart, layout.linkerNEnd)) {
    return { label: "N-linker", color: "#f59e0b" };
  }
  if (inRange(resno, layout.linkerCStart, layout.linkerCEnd)) {
    return { label: "C-linker", color: "#06b6d4" };
  }
  return { label: "SSTR2 receptor", color: "#a855f7" };
}

function receptorSelection(layout: RegionLayout) {
  const ranges: string[] = [];
  if (layout.insertion !== null && layout.insertion >= 1) {
    ranges.push(`1-${layout.insertion}`);
  }
  if (
    layout.receptorSuffixStart !== null &&
    layout.sequenceLength > 0 &&
    layout.receptorSuffixStart <= layout.sequenceLength
  ) {
    ranges.push(`${layout.receptorSuffixStart}-${layout.sequenceLength}`);
  }
  return ranges.length > 0 ? ranges.join(" or ") : "polymer";
}

export function ProteinViewer({ candidate }: ProteinViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const regionLayoutRef = useRef<RegionLayout>(getRegionLayout(null));

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSpinning, setIsSpinning] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    residue: string;
    region: string;
    color: string;
  } | null>(null);

  // Initialize NGL Stage once
  useEffect(() => {
    if (!mountRef.current) return;
    let stage: any = null;

    const init = async () => {
      const NGL = await import("ngl");
      if (!mountRef.current) return;

      stage = new NGL.Stage(mountRef.current, {
        backgroundColor: "#16161e",
        quality: "medium",
        impostor: true,
      });
      const onHovered = (pickingProxy: any) => {
        if (!pickingProxy) {
          setHoverInfo(null);
          return;
        }
        const atom = pickingProxy.atom ?? pickingProxy.closestBondAtom ?? null;
        if (!atom) {
          setHoverInfo(null);
          return;
        }
        const resno = Number(atom.resno);
        if (!Number.isFinite(resno)) {
          setHoverInfo(null);
          return;
        }
        const region = regionForResidue(resno, regionLayoutRef.current);
        const pos = pickingProxy.mouse?.position;
        setHoverInfo({
          x: typeof pos?.x === "number" ? pos.x + 12 : 12,
          y: typeof pos?.y === "number" ? pos.y + 12 : 12,
          residue: `${atom.resname ?? "UNK"} ${resno}`,
          region: region.label,
          color: region.color,
        });
      };
      stage.signals.hovered.add(onHovered);
      stageRef.current = stage;
      setSceneReady(true);
    };

    init();

    return () => {
      setHoverInfo(null);
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  // Load PDB whenever candidate or scene changes
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !sceneReady) return;

    const pdbUrl = candidate?.pdbData ?? "/api/pdb";
    const regionLayout = getRegionLayout(candidate);
    regionLayoutRef.current = regionLayout;

    stage.removeAllComponents();
    setError(null);
    setHoverInfo(null);
    setIsLoading(true);

    stage
      .loadFile(pdbUrl, { ext: "pdb", defaultRepresentation: false })
      .then((component: any) => {
        component.addRepresentation("cartoon", {
          sele: receptorSelection(regionLayout),
          colorScheme: "uniform",
          colorValue: "#a855f7",
          smoothSheet: true,
          quality: "high",
          opacity: 1,
        });
        if (
          regionLayout.linkerNStart !== null &&
          regionLayout.linkerNEnd !== null &&
          regionLayout.linkerNEnd >= regionLayout.linkerNStart
        ) {
          component.addRepresentation("cartoon", {
            sele: `${regionLayout.linkerNStart}-${regionLayout.linkerNEnd}`,
            colorScheme: "uniform",
            colorValue: "#f59e0b",
            opacity: 0.95,
          });
        }
        if (regionLayout.fpStart !== null && regionLayout.fpEnd !== null) {
          component.addRepresentation("cartoon", {
            sele: `${regionLayout.fpStart}-${regionLayout.fpEnd}`,
            colorScheme: "uniform",
            colorValue: "#22c55e",
            opacity: 1,
          });
        }
        if (
          regionLayout.linkerCStart !== null &&
          regionLayout.linkerCEnd !== null &&
          regionLayout.linkerCEnd >= regionLayout.linkerCStart
        ) {
          component.addRepresentation("cartoon", {
            sele: `${regionLayout.linkerCStart}-${regionLayout.linkerCEnd}`,
            colorScheme: "uniform",
            colorValue: "#06b6d4",
            opacity: 0.95,
          });
        }
        if (regionLayout.insertion !== null) {
          component.addRepresentation("ball+stick", {
            sele: `${regionLayout.insertion}`,
            colorScheme: "uniform",
            colorValue: "#f97316",
            scale: 2.3,
          });
        }
        component.addRepresentation("ball+stick", {
          sele: "hetero and not water",
          colorScheme: "element",
        });
        component.autoView(500);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load PDB";
        setError(msg);
        setIsLoading(false);
      });
  }, [candidate, sceneReady]);

  // Spin toggle
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setSpin(isSpinning ? [0, 1, 0] : null);
  }, [isSpinning]);

  // Resize NGL canvas whenever expanded changes
  useEffect(() => {
    const timer = setTimeout(() => stageRef.current?.handleResize(), 60);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  const handleReset = () => stageRef.current?.autoView(400);
  const handleZoomIn = () => stageRef.current?.viewer.zoom(0.8);
  const handleZoomOut = () => stageRef.current?.viewer.zoom(-0.8);

  const toolbar = (
    <div className="flex items-center gap-1">
      <button onClick={handleZoomOut} className="p-1.5 rounded-md hover:bg-secondary transition-colors" aria-label="Zoom out">
        <ZoomOut className="w-4 h-4 text-muted-foreground" />
      </button>
      <button onClick={handleZoomIn} className="p-1.5 rounded-md hover:bg-secondary transition-colors" aria-label="Zoom in">
        <ZoomIn className="w-4 h-4 text-muted-foreground" />
      </button>
      <button onClick={handleReset} className="p-1.5 rounded-md hover:bg-secondary transition-colors" aria-label="Reset view">
        <RotateCcw className="w-4 h-4 text-muted-foreground" />
      </button>
      <button
        onClick={() => setIsSpinning((p) => !p)}
        className={`p-1.5 rounded-md transition-colors ${isSpinning ? "bg-primary/20 text-primary" : "hover:bg-secondary"}`}
        aria-label={isSpinning ? "Stop spin" : "Start spin"}
      >
        <Box className={`w-4 h-4 ${isSpinning ? "text-primary" : "text-muted-foreground"}`} />
      </button>
      <button
        onClick={() => setIsExpanded((p) => !p)}
        className="p-1.5 rounded-md hover:bg-secondary transition-colors"
        aria-label={isExpanded ? "Collapse" : "Expand"}
      >
        {isExpanded
          ? <Minimize2 className="w-4 h-4 text-muted-foreground" />
          : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
      </button>
      {isExpanded && (
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors ml-1"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );

  return (
    <div
      className={
        isExpanded
          ? "fixed inset-0 z-50 flex flex-col bg-card border border-border"
          : "bg-card border border-border rounded-lg overflow-hidden"
      }
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">3D Structure Preview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {candidate
              ? `NGL viewer — ${candidate.id}`
              : "Latest structure · cartoon + residueindex coloring"}
          </p>
        </div>
        {toolbar}
      </div>

      {/* Canvas */}
      <div className={`relative bg-[#16161e] ${isExpanded ? "flex-1" : "aspect-square"}`}>
        <div ref={mountRef} className="absolute inset-0" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
            <p className="text-sm text-muted-foreground">Loading structure…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}

        {hoverInfo && !isLoading && !error && (
          <div
            className="absolute z-20 px-2 py-1 rounded border border-border bg-black/80 text-[11px] text-white pointer-events-none"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div className="font-semibold">{hoverInfo.residue}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: hoverInfo.color }}
              />
              <span>{hoverInfo.region}</span>
            </div>
          </div>
        )}

        {!error && (
          <div className="absolute left-2 bottom-2 z-10 rounded-md bg-black/45 border border-border/60 p-2 text-[10px] text-slate-100">
            <div className="font-semibold mb-1">Region Colors</div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#a855f7]" />
              <span>SSTR2 receptor</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e]" />
              <span>cpGFP</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" />
              <span>N-linker</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#06b6d4]" />
              <span>C-linker</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#f97316]" />
              <span>Insertion residue</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
