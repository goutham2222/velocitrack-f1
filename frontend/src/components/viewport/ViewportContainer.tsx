"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import {
  CircuitGeometry,
  InterpolatedDriverState,
  CameraMode,
  ViewportMode,
} from "@/types/telemetry";
import { Track3D } from "./Track3D";
import { DriverMarker3D } from "./DriverMarker3D";
import { CameraRig } from "./CameraRig";
import { Track2D } from "./Track2D";

interface ViewportContainerProps {
  circuit: CircuitGeometry;
  drivers: Record<string, InterpolatedDriverState>;
  focusedDriver: InterpolatedDriverState | null;
  cameraMode: CameraMode;
  viewportMode: ViewportMode;
  onSelectDriver: (code: string) => void;
  onDeselectDriver?: () => void;
  onToggleViewportMode: (mode: ViewportMode) => void;
  resetTrigger?: number;
  isInteractionDisabled?: boolean;
  showDriverLabels?: boolean;
}

export function ViewportContainer({
  circuit,
  drivers,
  focusedDriver,
  cameraMode,
  viewportMode,
  onSelectDriver,
  onDeselectDriver,
  onToggleViewportMode,
  resetTrigger = 0,
  isInteractionDisabled = false,
  showDriverLabels = true,
}: ViewportContainerProps) {
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);

  // Detect WebGL capability
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        setHasWebGL(false);
      }
    } catch {
      setHasWebGL(false);
    }
  }, []);

  // Compute circuit geometrical center for camera positioning
  const circuitCenter: [number, number, number] = useMemo(() => {
    if (!circuit || !circuit.centerline || circuit.centerline.length === 0) {
      return [0, 0, 0];
    }
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    const count = circuit.centerline.length;
    for (const pt of circuit.centerline) {
      sumX += pt[0];
      sumZ += pt[1]; // In Three.js: X = X, Y = Elevation(Z), Z = Y
      sumY += pt[2] || 0;
    }
    return [sumX / count, sumY / count, sumZ / count];
  }, [circuit]);

  // If user selected 2D mode or device lacks WebGL
  if (viewportMode === "2d" || !hasWebGL) {
    return (
      <Track2D
        circuit={circuit}
        drivers={drivers}
        focusedDriver={focusedDriver}
        onSelectDriver={onSelectDriver}
        onDeselectDriver={onDeselectDriver}
        isInteractionDisabled={isInteractionDisabled}
        showDriverLabels={showDriverLabels}
      />
    );
  }

  const driverList = Object.values(drivers);

  return (
    <div
      className={`relative w-full h-full bg-titanium-950 overflow-hidden ${
        isInteractionDisabled ? "pointer-events-none select-none" : ""
      }`}
    >
      <Canvas
        camera={{
          position: [circuitCenter[0], 240, circuitCenter[2] + 220],
          fov: 48,
          near: 0.5,
          far: 2500,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        onPointerMissed={(e) => {
          if (e.type === "click" && onDeselectDriver) {
            onDeselectDriver();
          }
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(new THREE.Color("#0b0e14"));
          scene.fog = new THREE.FogExp2("#0b0e14", 0.0012);
        }}
      >
        {/* Cinematic Studio & Sun Lighting */}
        <ambientLight intensity={1.2} />
        <directionalLight
          position={[250, 400, 200]}
          intensity={2.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-250, 200, -200]} intensity={0.8} color="#94a3b8" />

        {/* Ambient Ground Grid */}
        <gridHelper
          args={[3000, 60, "#1e293b", "#0f172a"]}
          position={[circuitCenter[0], -0.2, circuitCenter[2]]}
        />

        {/* 3D Track & Environment */}
        <Track3D circuit={circuit} />

        {/* Dynamic Drivers */}
        {driverList.map((drv) => (
          <DriverMarker3D
            key={drv.code}
            driver={drv}
            isFocused={focusedDriver?.code === drv.code}
            onSelect={onSelectDriver}
            showLabels={showDriverLabels}
          />
        ))}

        {/* Camera Control Rig with Smooth Lerp Overview Transition */}
        <CameraRig
          mode={cameraMode}
          focusedDriver={focusedDriver}
          origin={circuitCenter}
          defaultHeight={240}
          defaultDistance={220}
          resetTrigger={resetTrigger}
          disabled={isInteractionDisabled}
        />
      </Canvas>
    </div>
  );
}
