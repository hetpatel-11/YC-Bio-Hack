"use client";

import type { Candidate } from "@/lib/types";
import { RotateCcw, ZoomIn, ZoomOut, Box } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";

interface ProteinViewerProps {
  candidate: Candidate | null;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x+b.x, y: a.y+b.y, z: a.z+b.z }; }
function scale(a: Vec3, s: number): Vec3 { return { x: a.x*s, y: a.y*s, z: a.z*s }; }
function normalize(a: Vec3): Vec3 {
  const l = Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z) || 1;
  return scale(a, 1/l);
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x };
}
function dot(a: Vec3, b: Vec3): number { return a.x*b.x + a.y*b.y + a.z*b.z; }
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x-b.x, y: a.y-b.y, z: a.z-b.z }; }

// Catmull-Rom spline interpolation
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
    z: 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3),
  };
}

type SecStruct = "helix" | "sheet" | "coil";

interface Segment {
  points: Vec3[];
  type: SecStruct;
  isInsertionSite?: boolean;
}

// Deterministic pseudo-random from seed
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildProteinStructure(sequence: string, insertionPos: number): Segment[] {
  const rand = seededRand(sequence.length * 137 + 42);
  const segments: Segment[] = [];
  const totalResidues = Math.min(sequence?.length || 120, 140);

  // Define secondary structure blocks
  const blocks: { start: number; length: number; type: SecStruct }[] = [];
  let pos = 0;
  while (pos < totalResidues) {
    const r = rand();
    if (r < 0.45) {
      const len = 12 + Math.floor(rand() * 10);
      blocks.push({ start: pos, length: Math.min(len, totalResidues - pos), type: "helix" });
      pos += Math.min(len, totalResidues - pos);
    } else if (r < 0.65) {
      const len = 5 + Math.floor(rand() * 6);
      blocks.push({ start: pos, length: Math.min(len, totalResidues - pos), type: "sheet" });
      pos += Math.min(len, totalResidues - pos);
    } else {
      const len = 3 + Math.floor(rand() * 5);
      blocks.push({ start: pos, length: Math.min(len, totalResidues - pos), type: "coil" });
      pos += Math.min(len, totalResidues - pos);
    }
  }

  // Generate backbone control points per block
  let curPos: Vec3 = { x: 0, y: -60, z: 0 };
  let curDir: Vec3 = { x: 0, y: 1, z: 0 };

  for (const block of blocks) {
    const pts: Vec3[] = [];

    if (block.type === "helix") {
      // Helix: advance along a main axis while revolving
      const helixAxis = normalize({
        x: (rand() - 0.5) * 0.4,
        y: 0.8 + rand() * 0.2,
        z: (rand() - 0.5) * 0.4,
      });
      const helixRadius = 3.5;
      const helixRise = 1.55; // Angstroms per residue
      const helixTurn = (2 * Math.PI) / 3.6; // residues per turn

      // Build local frame perpendicular to helix axis
      const up: Vec3 = Math.abs(helixAxis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      const perp1 = normalize(cross(helixAxis, up));
      const perp2 = cross(helixAxis, perp1);

      for (let i = 0; i < block.length; i++) {
        const phase = i * helixTurn;
        const offset: Vec3 = add(scale(perp1, Math.cos(phase) * helixRadius), scale(perp2, Math.sin(phase) * helixRadius));
        const axisOffset: Vec3 = scale(helixAxis, i * helixRise);
        pts.push(add(add(curPos, axisOffset), offset));
      }
      // Advance curPos to end of helix
      curPos = add(curPos, scale(helixAxis, block.length * helixRise));
      curDir = helixAxis;

    } else if (block.type === "sheet") {
      // Beta strand: more linear with slight wave
      const strandDir = normalize({
        x: curDir.x + (rand() - 0.5) * 0.5,
        y: curDir.y + (rand() - 0.5) * 0.3,
        z: curDir.z + (rand() - 0.5) * 0.5,
      });
      const stepLen = 3.2;
      const wavePerp = normalize(cross(strandDir, { x: 0, y: 0, z: 1 }));

      for (let i = 0; i < block.length; i++) {
        const wave = Math.sin(i * Math.PI) * 0.8;
        pts.push(add(add(curPos, scale(strandDir, i * stepLen)), scale(wavePerp, wave)));
      }
      curPos = add(curPos, scale(strandDir, block.length * stepLen));
      curDir = strandDir;

    } else {
      // Coil: random walk with smoothing tendency
      const coilStep = 3.8;
      for (let i = 0; i < block.length; i++) {
        curDir = normalize({
          x: curDir.x * 0.6 + (rand() - 0.5) * 0.8,
          y: curDir.y * 0.6 + (rand() - 0.5) * 0.4 + 0.2,
          z: curDir.z * 0.6 + (rand() - 0.5) * 0.8,
        });
        curPos = add(curPos, scale(curDir, coilStep));
        pts.push({ ...curPos });
      }
    }

    const isInsertion = insertionPos >= block.start && insertionPos < block.start + block.length;
    segments.push({ points: pts, type: block.type, isInsertionSite: isInsertion });
  }

  return segments;
}

// Rotate a Vec3 around Y then X
function rotatePoint(p: Vec3, rotY: number, rotX: number): Vec3 {
  const x1 = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
  const z1 = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);
  const y1 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = p.y * Math.sin(rotX) + z1 * Math.cos(rotX);
  return { x: x1, y: y1, z: z2 };
}

function project(p: Vec3, cx: number, cy: number, zoom: number): { x: number; y: number; z: number; scale: number } {
  const fov = 320 * zoom;
  const s = fov / (fov + p.z);
  return { x: cx + p.x * s, y: cy + p.y * s, z: p.z, scale: s };
}

// Generate neon green color with depth-based shading
function neonGreen(z: number, alpha: number, bright: boolean): string {
  const depth = Math.max(0, Math.min(1, (z + 120) / 240));
  const base = bright ? 1.0 : 0.55 + depth * 0.45;
  const r = Math.floor(0   * base);
  const g = Math.floor(255 * base);
  const b = Math.floor(30  * base);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ProteinViewer({ candidate }: ProteinViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotY, setRotY] = useState(0.4);
  const [rotX, setRotX] = useState(0.25);
  const [zoom, setZoom] = useState(1);
  const [isAnimating, setIsAnimating] = useState(true);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseRotY = useRef(0.4);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (startTimeRef.current === null) startTimeRef.current = time;
    const elapsed = time - startTimeRef.current;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    const currentRotY = isAnimating ? baseRotY.current + elapsed * 0.0006 : rotY;
    const currentRotX = rotX;

    const segments = buildProteinStructure(
      candidate?.sequence || "ACDEFGHIKLMNPQRSTVWY".repeat(7),
      candidate?.insertionPosition ?? -1
    );

    // Clear with pure black
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    // Collect all drawable primitives with z-order
    type Primitive = {
      z: number;
      draw: () => void;
    };
    const primitives: Primitive[] = [];

    for (const seg of segments) {
      const pts = seg.points;
      if (pts.length < 2) continue;

      // Smooth via Catmull-Rom: generate many sub-points
      const splinePts: Vec3[] = [];
      const subdivisions = 6;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let s = 0; s < subdivisions; s++) {
          splinePts.push(catmullRom(p0, p1, p2, p3, s / subdivisions));
        }
      }
      splinePts.push(pts[pts.length - 1]);

      if (seg.type === "helix") {
        // Draw helix as thick ribbon tube with cross-section circles
        const tubeRadius = 2.4 * zoom;

        for (let i = 0; i < splinePts.length - 1; i++) {
          const rA = rotatePoint(splinePts[i], currentRotY, currentRotX);
          const rB = rotatePoint(splinePts[i+1], currentRotY, currentRotX);
          const pA = project(rA, cx, cy, zoom);
          const pB = project(rB, cx, cy, zoom);
          const avgZ = (rA.z + rB.z) / 2;
          const isInsertion = seg.isInsertionSite;

          primitives.push({
            z: avgZ,
            draw: () => {
              const alpha = isInsertion ? 1.0 : 0.92;
              const lineW = tubeRadius * ((pA.scale + pB.scale) / 2) * 2.2;

              // Outer glow
              ctx.beginPath();
              ctx.moveTo(pA.x, pA.y);
              ctx.lineTo(pB.x, pB.y);
              ctx.lineWidth = lineW * 2.5;
              ctx.strokeStyle = isInsertion
                ? `rgba(255,200,0,0.12)`
                : `rgba(0,255,30,0.08)`;
              ctx.lineCap = "round";
              ctx.stroke();

              // Mid glow
              ctx.beginPath();
              ctx.moveTo(pA.x, pA.y);
              ctx.lineTo(pB.x, pB.y);
              ctx.lineWidth = lineW * 1.4;
              ctx.strokeStyle = isInsertion
                ? `rgba(255,180,0,0.35)`
                : `rgba(0,255,30,0.25)`;
              ctx.stroke();

              // Core ribbon
              ctx.beginPath();
              ctx.moveTo(pA.x, pA.y);
              ctx.lineTo(pB.x, pB.y);
              ctx.lineWidth = lineW * 0.7;
              ctx.strokeStyle = isInsertion
                ? neonGreen(avgZ, alpha, true).replace("rgba(0,255,30", "rgba(255,220,0")
                : neonGreen(avgZ, alpha, true);
              ctx.stroke();

              // Highlight streak (top of helix cylinder)
              ctx.beginPath();
              ctx.moveTo(pA.x - 0.5, pA.y - 0.5);
              ctx.lineTo(pB.x - 0.5, pB.y - 0.5);
              ctx.lineWidth = lineW * 0.2;
              ctx.strokeStyle = isInsertion
                ? `rgba(255,255,200,0.7)`
                : `rgba(180,255,180,0.6)`;
              ctx.stroke();
            },
          });
        }

      } else if (seg.type === "sheet") {
        // Draw as flat arrow ribbon
        for (let i = 0; i < splinePts.length - 1; i++) {
          const rA = rotatePoint(splinePts[i], currentRotY, currentRotX);
          const rB = rotatePoint(splinePts[i+1], currentRotY, currentRotX);
          const pA = project(rA, cx, cy, zoom);
          const pB = project(rB, cx, cy, zoom);
          const avgZ = (rA.z + rB.z) / 2;

          primitives.push({
            z: avgZ,
            draw: () => {
              const w = 5 * zoom * ((pA.scale + pB.scale) / 2);
              const dx = pB.x - pA.x;
              const dy = pB.y - pA.y;
              const len = Math.sqrt(dx*dx + dy*dy) || 1;
              const nx = -dy/len * w;
              const ny = dx/len * w;

              ctx.beginPath();
              ctx.moveTo(pA.x + nx, pA.y + ny);
              ctx.lineTo(pB.x + nx, pB.y + ny);
              ctx.lineTo(pB.x - nx, pB.y - ny);
              ctx.lineTo(pA.x - nx, pA.y - ny);
              ctx.closePath();

              // Glow fill
              ctx.fillStyle = `rgba(0,255,30,0.07)`;
              ctx.fill();
              ctx.strokeStyle = neonGreen(avgZ, 0.85, false);
              ctx.lineWidth = 1;
              ctx.stroke();

              // Bright edge
              ctx.beginPath();
              ctx.moveTo(pA.x + nx*0.5, pA.y + ny*0.5);
              ctx.lineTo(pB.x + nx*0.5, pB.y + ny*0.5);
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = neonGreen(avgZ, 0.9, true);
              ctx.stroke();
            },
          });
        }

      } else {
        // Coil: thin tube line
        for (let i = 0; i < splinePts.length - 1; i++) {
          const rA = rotatePoint(splinePts[i], currentRotY, currentRotX);
          const rB = rotatePoint(splinePts[i+1], currentRotY, currentRotX);
          const pA = project(rA, cx, cy, zoom);
          const pB = project(rB, cx, cy, zoom);
          const avgZ = (rA.z + rB.z) / 2;

          primitives.push({
            z: avgZ,
            draw: () => {
              ctx.beginPath();
              ctx.moveTo(pA.x, pA.y);
              ctx.lineTo(pB.x, pB.y);
              ctx.lineWidth = 1.2 * zoom;
              ctx.strokeStyle = neonGreen(avgZ, 0.7, false);
              ctx.lineCap = "round";
              ctx.stroke();
            },
          });
        }
      }
    }

    // Sort back-to-front (painter's algorithm)
    primitives.sort((a, b) => a.z - b.z);
    for (const p of primitives) p.draw();

    // Draw FP insertion site glow sphere
    if (candidate?.insertionPosition != null && candidate.insertionPosition >= 0) {
      const allPts: Vec3[] = segments.flatMap(s => s.points);
      const idx = Math.min(candidate.insertionPosition, allPts.length - 1);
      const rp = rotatePoint(allPts[idx], currentRotY, currentRotX);
      const pp = project(rp, cx, cy, zoom);
      const r = 12 * pp.scale;

      const grd = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, r * 2.5);
      grd.addColorStop(0, "rgba(255,240,0,0.9)");
      grd.addColorStop(0.3, "rgba(255,180,0,0.5)");
      grd.addColorStop(1, "rgba(255,100,0,0)");
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Candidate label
    if (candidate) {
      ctx.font = "bold 11px 'Inter', system-ui, sans-serif";
      ctx.fillStyle = "rgba(0,255,30,0.6)";
      ctx.fillText(candidate.id, 10, H - 12);
    }

    if (isAnimating) {
      animationRef.current = requestAnimationFrame(draw);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, rotX, rotY, zoom, isAnimating]);

  useEffect(() => {
    startTimeRef.current = null;
    baseRotY.current = rotY;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [draw]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2.5));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.4));
  const handleReset = () => { setZoom(1); setRotY(0.4); setRotX(0.25); };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">3D Structure Preview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {candidate ? `Predicted fold — ${candidate.id}` : "Select a candidate to view"}
          </p>
        </div>
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
            onClick={() => { baseRotY.current = rotY; setIsAnimating(a => !a); }}
            className={`p-1.5 rounded-md transition-colors ${isAnimating ? "bg-primary/10 text-primary" : "hover:bg-secondary"}`}
            aria-label={isAnimating ? "Pause rotation" : "Start rotation"}
          >
            <Box className={`w-4 h-4 ${isAnimating ? "text-primary" : "text-muted-foreground"}`} />
          </button>
        </div>
      </div>

      <div className="relative bg-black" style={{ aspectRatio: "1/1" }}>
        <canvas ref={canvasRef} width={420} height={420} className="w-full h-full" />
        {!candidate && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No candidate selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
