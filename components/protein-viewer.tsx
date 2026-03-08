"use client";

import type { Candidate } from "@/lib/types";
import { Box, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ProteinViewerProps {
  candidate: Candidate | null;
}

function disposeObject(object: unknown) {
  const typedObject = object as {
    geometry?: { dispose?: () => void };
    material?:
      | { dispose?: () => void }
      | Array<{ dispose?: () => void }>;
    children?: unknown[];
  };

  if (typedObject.geometry?.dispose) {
    typedObject.geometry.dispose();
  }

  if (Array.isArray(typedObject.material)) {
    for (const material of typedObject.material) {
      material.dispose?.();
    }
  } else {
    typedObject.material?.dispose?.();
  }

  if (typedObject.children) {
    for (const child of typedObject.children) {
      disposeObject(child);
    }
  }
}

export function ProteinViewer({ candidate }: ProteinViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const modelGroupRef = useRef<any>(null);
  const threeRef = useRef<any>(null);
  const pdbLoaderRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const initialViewRef = useRef<{
    position: any;
    target: any;
    zoom: number;
  } | null>(null);

  const [isAnimating, setIsAnimating] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const clearModel = () => {
    const group = modelGroupRef.current;
    if (!group) return;

    const children = [...group.children];
    for (const child of children) {
      group.remove(child);
      disposeObject(child);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const initScene = async () => {
      if (!mountRef.current) return;

      const [THREE, { OrbitControls }, { PDBLoader }] =
        await Promise.all([
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("three/examples/jsm/loaders/PDBLoader.js"),
        ]);

      if (cancelled || !mountRef.current) return;

      threeRef.current = THREE;
      pdbLoaderRef.current = new PDBLoader();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x16161e);

      const width = mountRef.current.clientWidth || 400;
      const height = mountRef.current.clientHeight || 400;

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
      camera.position.set(45, 25, 70);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      mountRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = true;
      controls.autoRotate = isAnimating;
      controls.autoRotateSpeed = 1.1;
      controls.minDistance = 10;
      controls.maxDistance = 600;

      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
      keyLight.position.set(60, 80, 90);
      const fillLight = new THREE.DirectionalLight(0x88aacc, 0.45);
      fillLight.position.set(-70, 30, -50);

      const modelGroup = new THREE.Group();
      scene.add(modelGroup);
      scene.add(ambient);
      scene.add(keyLight);
      scene.add(fillLight);

      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      controlsRef.current = controls;
      modelGroupRef.current = modelGroup;

      const animate = () => {
        if (cancelled) return;
        animationRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      resizeObserver = new ResizeObserver(() => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth || 400;
        const h = mountRef.current.clientHeight || 400;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      });
      resizeObserver.observe(mountRef.current);
      if (!cancelled) setSceneReady(true);
    };

    initScene();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      controlsRef.current?.dispose?.();
      clearModel();

      if (sceneRef.current) {
        disposeObject(sceneRef.current);
      }

      if (rendererRef.current) {
        rendererRef.current.dispose?.();
        const dom = rendererRef.current.domElement as HTMLElement | undefined;
        if (dom && dom.parentElement) {
          dom.parentElement.removeChild(dom);
        }
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAnimating;
    }
  }, [isAnimating]);

  useEffect(() => {
    const loader = pdbLoaderRef.current;
    const THREE = threeRef.current;
    const group = modelGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!loader || !THREE || !group || !camera || !controls || !renderer || !scene) {
      return;
    }

    clearModel();
    setError(null);
    setSourceLabel(null);

    const pdbUrl = candidate?.pdbData ?? "/api/pdb";
    setIsLoading(true);

    loader.load(
      pdbUrl,
      (result: any) => {
        clearModel();

        const atoms = new THREE.Points(
          result.geometryAtoms,
          new THREE.PointsMaterial({
            size: 0.32,
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            sizeAttenuation: true,
          })
        );

        const bonds = new THREE.LineSegments(
          result.geometryBonds,
          new THREE.LineBasicMaterial({
            color: 0x8a94a5,
            transparent: true,
            opacity: 0.36,
          })
        );

        group.add(bonds);
        group.add(atoms);

        const atomRecords = Array.isArray(result.json?.atoms) ? result.json.atoms : [];
        const insertionPosition = candidate?.insertionPosition;
        if (atomRecords.length > 0 && insertionPosition) {
          const insertionPositions: number[] = [];
          for (const atom of atomRecords) {
            if (Number(atom?.resi) === insertionPosition) {
              insertionPositions.push(atom.x, atom.y, atom.z);
            }
          }

          if (insertionPositions.length > 0) {
            const highlightGeometry = new THREE.BufferGeometry();
            highlightGeometry.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(insertionPositions, 3)
            );
            const highlight = new THREE.Points(
              highlightGeometry,
              new THREE.PointsMaterial({
                color: 0x22d3ee,
                size: 0.6,
                transparent: true,
                opacity: 0.95,
              })
            );
            group.add(highlight);
          }
        }

        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3()).length();
          const distance = Math.max(size * 0.85, 40);

          camera.near = 0.1;
          camera.far = Math.max(1500, distance * 8);
          camera.position.set(
            center.x + distance * 0.24,
            center.y + distance * 0.18,
            center.z + distance
          );
          camera.zoom = 1;
          camera.updateProjectionMatrix();

          controls.target.copy(center);
          controls.update();

          initialViewRef.current = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            zoom: camera.zoom,
          };
          setZoom(camera.zoom);
        }

        renderer.render(scene, camera);
        setSourceLabel(pdbUrl ?? null);
        setIsLoading(false);
      },
      undefined,
      (loadError: unknown) => {
        clearModel();
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load PDB structure";
        setError(message);
        setIsLoading(false);
      }
    );
  }, [candidate, sceneReady]);

  const updateZoom = (multiplier: number) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const nextZoom = Math.max(0.35, Math.min(4, camera.zoom * multiplier));
    camera.zoom = nextZoom;
    camera.updateProjectionMatrix();
    setZoom(nextZoom);
  };

  const handleReset = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const initialView = initialViewRef.current;
    if (!camera || !controls || !initialView) return;

    camera.position.copy(initialView.position);
    camera.zoom = initialView.zoom;
    camera.updateProjectionMatrix();
    controls.target.copy(initialView.target);
    controls.update();
    setZoom(initialView.zoom);
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">3D Structure Preview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {candidate
              ? `Three.js PDB view for ${candidate.id}`
              : "Latest PDB from results/ via /api/pdb"}
          </p>
          {sourceLabel && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 font-mono">
              {sourceLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateZoom(0.84)}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => updateZoom(1.2)}
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
            onClick={() => setIsAnimating((prev) => !prev)}
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
        <div ref={mountRef} className="absolute inset-0" />
        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/35 text-[10px] text-muted-foreground">
          zoom {zoom.toFixed(2)}x
        </div>

        {!candidate && !sourceLabel && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Waiting for results PDB...</p>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <p className="text-sm text-muted-foreground">Loading PDB structure...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
