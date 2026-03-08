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

    // Generate a procedural protein-like structure based on sequence
    const generateStructure = (sequence: string) => {
      const points: Array<{ x: number; y: number; z: number; type: string }> = [];
      const length = Math.min(sequence?.length || 100, 150);
      
      let x = 0, y = 0, z = 0;
      let angle = 0;
      let helixPhase = 0;
      
      for (let i = 0; i < length; i++) {
        // Simulate secondary structure (helix, sheet, coil)
        const structureType = i % 20 < 8 ? "helix" : i % 20 < 14 ? "sheet" : "coil";
        
        if (structureType === "helix") {
          // Alpha helix pattern
          const helixRadius = 8;
          const helixPitch = 3;
          x = helixRadius * Math.cos(helixPhase);
          y += helixPitch;
          z = helixRadius * Math.sin(helixPhase);
          helixPhase += 0.6;
        } else if (structureType === "sheet") {
          // Beta sheet - more linear with zigzag
          x += Math.sin(angle) * 6;
          y += 4;
          z += Math.cos(angle) * 2;
          angle += 0.3;
        } else {
          // Random coil
          x += (Math.random() - 0.5) * 10;
          y += 3 + Math.random() * 2;
          z += (Math.random() - 0.5) * 10;
        }
        
        points.push({ x, y: y - length * 1.5, z, type: structureType });
      }
      
      return points;
    };

    const structure = generateStructure(candidate?.sequence || "");
    
    // Helper: project a single 3D point at a given animation time
    const project = (p: { x: number; y: number; z: number }, rotX: number, rotY: number) => {
      const x1 = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
      const z1 = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
      const y1 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
      const z2 = p.y * Math.sin(rotX) + z1 * Math.cos(rotX);
      const sc = (300 * zoom) / (300 + z2);
      return { x: centerX + x1 * sc, y: centerY + y1 * sc, z: z2, scale: sc };
    };

    // Draw a ribbon segment between two projected points with a given half-width
    const drawRibbonSegment = (
      ax: number, ay: number,
      bx: number, by: number,
      halfW: number,
      fillColor: string,
      strokeColor: string,
      alpha: number
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = (-dy / len) * halfW;
      const ny = (dx / len) * halfW;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(ax - nx, ay - ny);
      ctx.lineTo(ax + nx, ay + ny);
      ctx.lineTo(bx + nx, by + ny);
      ctx.lineTo(bx - nx, by - ny);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // Draw an arrowhead for a beta-strand terminus
    const drawArrowHead = (
      ax: number, ay: number,
      bx: number, by: number,
      halfW: number,
      fillColor: string,
      alpha: number
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = (-dy / len) * halfW * 2;
      const ny = (dx / len) * halfW * 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ax + nx, ay + ny);
      ctx.lineTo(ax - nx, ay - ny);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const draw = (time: number) => {
      ctx.fillStyle = "rgba(22, 22, 30, 1)";
      ctx.fillRect(0, 0, width, height);

      const rotX = rotation.x;
      const rotY = isAnimating ? rotation.y + time * 0.0005 : rotation.y;

      // Project all points
      const projected = structure.map((p) => project(p, rotX, rotY));

      // Collect segments grouped by run of same type, sorted by average z
      type Segment = {
        type: string;
        indices: number[];
        avgZ: number;
      };
      const segments: Segment[] = [];
      let i = 0;
      while (i < structure.length) {
        const t = structure[i].type;
        const run: number[] = [i];
        let j = i + 1;
        while (j < structure.length && structure[j].type === t) {
          run.push(j);
          j++;
        }
        const avgZ = run.reduce((s, k) => s + projected[k].z, 0) / run.length;
        segments.push({ type: t, indices: run, avgZ });
        i = j;
      }

      // Sort segments back-to-front
      segments.sort((a, b) => b.avgZ - a.avgZ);

      for (const seg of segments) {
        const { type, indices } = seg;

        if (type === "coil") {
          // Thin tube line for coil
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (let k = 1; k < indices.length; k++) {
            const prev = projected[indices[k - 1]];
            const curr = projected[indices[k]];
            const depthAlpha = Math.min(1, 0.5 + curr.scale * 0.3);
            ctx.globalAlpha = depthAlpha;
            ctx.strokeStyle = `rgba(148, 163, 184, 0.9)`;
            ctx.lineWidth = Math.max(1, 2 * curr.scale * zoom);
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else if (type === "helix") {
          // Ribbon helix: alternating thick ribbon slices to simulate a coiled appearance
          const ribbonHalfW = 7 * zoom;
          for (let k = 1; k < indices.length; k++) {
            const prev = projected[indices[k - 1]];
            const curr = projected[indices[k]];
            const depthAlpha = Math.min(1, 0.55 + curr.scale * 0.25);
            // Alternate darker/lighter to give the coil cross-hatch feel
            const shade = k % 2 === 0 ? "rgba(45, 212, 191, 1)" : "rgba(20, 160, 140, 1)";
            const stroke = "rgba(10, 100, 90, 0.8)";
            drawRibbonSegment(
              prev.x, prev.y, curr.x, curr.y,
              ribbonHalfW * (0.7 + 0.3 * Math.abs(Math.sin(k * 0.9))),
              shade, stroke, depthAlpha
            );
          }
        } else if (type === "sheet") {
          // Flat ribbon for beta-sheet body, arrow at the end
          const ribbonHalfW = 6 * zoom;
          for (let k = 1; k < indices.length - 1; k++) {
            const prev = projected[indices[k - 1]];
            const curr = projected[indices[k]];
            const depthAlpha = Math.min(1, 0.55 + curr.scale * 0.25);
            drawRibbonSegment(
              prev.x, prev.y, curr.x, curr.y,
              ribbonHalfW,
              "rgba(250, 204, 21, 1)",
              "rgba(180, 140, 10, 0.8)",
              depthAlpha
            );
          }
          // Arrow tip at final segment
          if (indices.length >= 2) {
            const lastIdx = indices.length - 1;
            const prev = projected[indices[lastIdx - 1]];
            const curr = projected[indices[lastIdx]];
            const depthAlpha = Math.min(1, 0.55 + curr.scale * 0.25);
            drawArrowHead(
              prev.x, prev.y, curr.x, curr.y,
              ribbonHalfW,
              "rgba(250, 204, 21, 1)",
              depthAlpha
            );
          }
        }
      }

      // Draw FP insertion site highlight
      if (candidate?.insertionPosition) {
        const insertIdx = Math.min(
          candidate.insertionPosition,
          projected.length - 1
        );
        const insertPoint = projected[insertIdx];
        if (insertPoint) {
          const gradient = ctx.createRadialGradient(
            insertPoint.x, insertPoint.y, 0,
            insertPoint.x, insertPoint.y, 20 * insertPoint.scale
          );
          gradient.addColorStop(0, "rgba(34, 211, 238, 0.8)");
          gradient.addColorStop(0.5, "rgba(34, 211, 238, 0.3)");
          gradient.addColorStop(1, "rgba(34, 211, 238, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(insertPoint.x, insertPoint.y, 20 * insertPoint.scale, 0, Math.PI * 2);
          ctx.fill();
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

      ctx.fillStyle = "#facc15";
      ctx.fillRect(60, height - 35, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Sheet", 76, height - 25);

      ctx.fillStyle = "#64748b";
      ctx.fillRect(115, height - 35, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Coil", 131, height - 25);

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
