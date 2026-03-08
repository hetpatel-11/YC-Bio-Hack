"use client";

import type { Candidate } from "@/lib/types";
import { Box, Maximize2, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ProteinViewerProps {
  candidate: Candidate | null;
}

export function ProteinViewer({ candidate }: ProteinViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSpinning, setIsSpinning] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);

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
      stageRef.current = stage;
      setSceneReady(true);
    };

    init();

    return () => {
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  // Load PDB whenever candidate or scene changes
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !sceneReady) return;

    const pdbUrl = candidate?.pdbData ?? "/api/pdb";

    stage.removeAllComponents();
    setError(null);
    setIsLoading(true);

    stage
      .loadFile(pdbUrl, { ext: "pdb", defaultRepresentation: false })
      .then((component: any) => {
        component.addRepresentation("cartoon", {
          colorScheme: "residueindex",
          smoothSheet: true,
          quality: "high",
        });
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
      </div>
    </div>
  );
}
