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
        } else if (structure[idx].type === "sheet") {
          color = `rgba(250, 204, 21, ${0.4 + curr.scale * 0.2})`; // Yellow for sheet
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
