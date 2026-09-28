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
  zoomPercent?: number;
  onZoomChange?: (zoom: number) => void;
  rotate2DTrigger?: number;
  resetRotation2DTrigger?: number;
  onRotation2DChange?: (deg: number) => void;
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
  zoomPercent,
  onZoomChange,
  rotate2DTrigger = 0,
  resetRotation2DTrigger = 0,
  onRotation2DChange,
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

  // Compute true 3D Bounding Box and Bounding Sphere for camera initial framing and grid scaling
  const { sphereCenter, initialCamPos, gridRadius } = useMemo(() => {
    const box = new THREE.Box3();
    if (circuit && circuit.centerline && circuit.centerline.length > 0) {
      for (const pt of circuit.centerline) {
        box.expandByPoint(new THREE.Vector3(pt[0], pt[2] || 0.1, pt[1]));
      }
    } else {
      box.set(new THREE.Vector3(-150, 0, -150), new THREE.Vector3(150, 10, 150));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fovInRad = (48 * Math.PI) / 180;
    const distance = (Math.max(20, sphere.radius) / Math.sin(fovInRad / 2)) * 1.15;
    return {
      sphereCenter: [sphere.center.x, sphere.center.y, sphere.center.z] as [number, number, number],
      initialCamPos: [
        sphere.center.x,
        sphere.center.y + distance * 0.7,
        sphere.center.z + distance * 0.7,
      ] as [number, number, number],
      gridRadius: Math.max(3000, sphere.radius * 3.5),
    };
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
        zoomPercent={zoomPercent}
        onZoomChange={onZoomChange}
        rotateTrigger={rotate2DTrigger}
        resetRotationTrigger={resetRotation2DTrigger}
        onRotationChange={onRotation2DChange}
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
          position: initialCamPos,
          fov: 48,
          near: 0.5,
          far: 8000,
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
          scene.fog = new THREE.FogExp2("#0b0e14", 0.0008);
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
          args={[gridRadius, 60, "#1e293b", "#0f172a"]}
          position={[sphereCenter[0], -0.2, sphereCenter[2]]}
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

        {/* Camera Control Rig with Smooth Dynamic Lerp Overview Transition */}
        <CameraRig
          mode={cameraMode}
          focusedDriver={focusedDriver}
          circuit={circuit}
          resetTrigger={resetTrigger}
          disabled={isInteractionDisabled}
          zoomPercent={zoomPercent}
          onZoomChange={onZoomChange}
        />
      </Canvas>
    </div>
  );
}
