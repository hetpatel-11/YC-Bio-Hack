"use client";

import type { Candidate } from "@/lib/types";
import { RotateCcw, ZoomIn, ZoomOut, Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ProteinViewerProps {
  candidate: Candidate | null;
}

export function ProteinViewer({ candidate }: ProteinViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0.3, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isAnimating, setIsAnimating] = useState(true);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Seeded pseudo-random for deterministic per-candidate variation
    const seededRand = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    };
    const seedVal = (candidate?.sequence || "ACDEF")
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = seededRand(seedVal);

    // Build a zigzag accordion structure:
    // N helices that tilt alternately left/right, connected by short loops
    const generateStructure = (_sequence: string) => {
      const points: Array<{ x: number; y: number; z: number; type: string }> = [];

      const NUM_HELICES = 7;          // 7-TM GPCR-like bundle
      const HELIX_RESIDUES = 18;      // residues per helix
      const LOOP_RESIDUES = 5;        // residues per connecting loop
      const HELIX_RADIUS = 5;         // coil radius of alpha helix
      const HELIX_PITCH = 3.2;        // rise per residue along helix axis
      const TILT = 0.38;              // radians: alternating tilt left/right
      const BUNDLE_SPREAD = 14;       // lateral spread between helices in bundle

      // Y centres for each helix (evenly spaced going up)
      const totalHeight = NUM_HELICES * HELIX_RESIDUES * HELIX_PITCH * 0.5;

      for (let h = 0; h < NUM_HELICES; h++) {
        const tiltDir = h % 2 === 0 ? 1 : -1;           // alternating tilt
        const xOffset = (h - (NUM_HELICES - 1) / 2) * BUNDLE_SPREAD * 0.6;
        const zOffset = (rand() - 0.5) * 8;

        // Helix axis direction (tilted in XY plane)
        const axisX = Math.sin(TILT * tiltDir);
        const axisY = Math.cos(TILT);
        const axisZ = 0.15 * tiltDir;                     // slight depth tilt

        // Start Y: distribute helices evenly across vertical range
        const startY = -totalHeight * 0.5 + h * (totalHeight / NUM_HELICES);

        // Draw helix residues
        for (let r = 0; r < HELIX_RESIDUES; r++) {
          const t = r / HELIX_RESIDUES;
          const along = r * HELIX_PITCH * 0.5;             // progress along axis
          const phase = r * 0.6 + h * 1.1;                // helix coil phase
          // Helix cross-section (perpendicular to axis)
          const perpX = Math.cos(phase) * HELIX_RADIUS;
          const perpZ = Math.sin(phase) * HELIX_RADIUS;

          points.push({
            x: xOffset + axisX * along + perpX,
            y: startY + axisY * along,
            z: zOffset + axisZ * along + perpZ,
            type: "helix",
          });
          void t;
        }

        // Connecting loop to next helix (skip after last)
        if (h < NUM_HELICES - 1) {
          const loopEndX = ((h + 1) - (NUM_HELICES - 1) / 2) * BUNDLE_SPREAD * 0.6;
          const loopEndZ = (rand() - 0.5) * 8;
          const loopStartY = startY + axisY * HELIX_RESIDUES * HELIX_PITCH * 0.5;
          const nextStartY = -totalHeight * 0.5 + (h + 1) * (totalHeight / NUM_HELICES);
          // Bulge outward for extracellular / intracellular loops
          const bulge = (h % 2 === 0 ? 1 : -1) * (8 + rand() * 6);

          for (let l = 0; l < LOOP_RESIDUES; l++) {
            const lt = (l + 1) / (LOOP_RESIDUES + 1);
            const bx = bulge * Math.sin(lt * Math.PI);
            points.push({
              x: xOffset + (loopEndX - xOffset) * lt + bx,
              y: loopStartY + (nextStartY - loopStartY) * lt,
              z: zOffset + (loopEndZ - zOffset) * lt,
              type: "coil",
            });
          }
        }
      }

      return points;
    };

    const structure = generateStructure(candidate?.sequence || "");
    
    const draw = (time: number) => {
      ctx.fillStyle = "rgba(22, 22, 30, 1)";
      ctx.fillRect(0, 0, width, height);

      // Apply rotation
      const rotX = rotation.x;
      const rotY = isAnimating ? rotation.y + time * 0.0005 : rotation.y;
      
      // Project 3D points to 2D
      const projected = structure.map((p) => {
        // Rotate around Y axis
        const x1 = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
        const z1 = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
        
        // Rotate around X axis
        const y1 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
        const z2 = p.y * Math.sin(rotX) + z1 * Math.cos(rotX);
        
        // Perspective projection
        const scale = (300 * zoom) / (300 + z2);
        
        return {
          x: centerX + x1 * scale,
          y: centerY + y1 * scale,
          z: z2,
          type: p.type,
          scale,
        };
      });

      // Sort by z-depth for proper rendering
      const sortedIndices = projected
        .map((_, i) => i)
        .sort((a, b) => projected[b].z - projected[a].z);

      // Draw connections (backbone)
      ctx.lineWidth = 3 * zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      for (let i = 1; i < sortedIndices.length; i++) {
        const idx = sortedIndices[i];
        if (idx === 0) continue;
        
        const curr = projected[idx];
        const prev = projected[idx - 1];
        
        // Color based on structure type
        let color: string;
        if (structure[idx].type === "helix") {
          color = `rgba(45, 212, 191, ${0.4 + curr.scale * 0.2})`; // Teal for helix
        } else {
          color = `rgba(148, 163, 184, ${0.3 + curr.scale * 0.15})`; // Gray for coil
        }
        
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }

      // Draw FP insertion site highlight
      if (candidate?.insertionPosition) {
        const insertIdx = Math.min(
          candidate.insertionPosition,
          projected.length - 1
        );
        const insertPoint = projected[insertIdx];
        if (insertPoint) {
          // Glow effect
          const gradient = ctx.createRadialGradient(
            insertPoint.x,
            insertPoint.y,
            0,
            insertPoint.x,
            insertPoint.y,
            20 * insertPoint.scale
          );
          gradient.addColorStop(0, "rgba(34, 211, 238, 0.8)");
          gradient.addColorStop(0.5, "rgba(34, 211, 238, 0.3)");
          gradient.addColorStop(1, "rgba(34, 211, 238, 0)");
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(insertPoint.x, insertPoint.y, 20 * insertPoint.scale, 0, Math.PI * 2);
          ctx.fill();
          
          // Core point
          ctx.fillStyle = "#22d3ee";
          ctx.beginPath();
          ctx.arc(insertPoint.x, insertPoint.y, 6 * insertPoint.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw legend
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Structure:", 10, height - 45);
      
      ctx.fillStyle = "#2dd4bf";
      ctx.fillRect(10, height - 35, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Helix", 26, height - 25);
      
      ctx.fillStyle = "#64748b";
      ctx.fillRect(70, height - 35, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Loop", 86, height - 25);
      
      if (candidate?.insertionPosition) {
        ctx.fillStyle = "#22d3ee";
        ctx.beginPath();
        ctx.arc(180, height - 29, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("FP Site", 190, height - 25);
      }

      if (isAnimating) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [candidate, rotation, zoom, isAnimating]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation({ x: 0.3, y: 0 });
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            3D Structure Preview
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {candidate
              ? `Predicted fold for ${candidate.id}`
              : "Select a candidate to view"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            aria-label="Reset view"
          >
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className={`p-1.5 rounded-md transition-colors ${
              isAnimating ? "bg-primary/20 text-primary" : "hover:bg-secondary"
            }`}
            aria-label={isAnimating ? "Stop rotation" : "Start rotation"}
          >
            <Box
              className={`w-4 h-4 ${
                isAnimating ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="relative aspect-square bg-[#16161e]">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full h-full"
        />
        {!candidate && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No candidate selected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
