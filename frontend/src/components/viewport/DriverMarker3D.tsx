"use client";

import React, { useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { CameraMode, InterpolatedDriverState } from "@/types/telemetry";

interface DriverMarker3DProps {
  driver: InterpolatedDriverState;
  isFocused: boolean;
  onSelect: (code: string) => void;
  showLabels?: boolean;
  cameraMode?: CameraMode;
}

export function DriverMarker3D({
  driver,
  isFocused,
  onSelect,
  showLabels = true,
}: DriverMarker3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Unmount completely if driver is retired/DNF, DNS, or inactive (clears ghost cars from track surface)
  if (driver.is_dnf || driver.is_active === false || driver.is_dns || (!driver.x && !driver.y && !driver.z)) {
    return null;
  }

  // Determine if driver is currently in pit lane
  const isPitting = Boolean(driver.is_pitting || driver.pitStatus?.includes("PIT"));
  const markerColor = isPitting ? "#F59E0B" : driver.teamColor;

  // Driver label is shown for all cars (including the focused car in Chase Cam) whenever labels are enabled
  const shouldRenderLabel = showLabels;

  // Position in Three.js coordinates: [x, z_elev + offset, -y]
  const pos: [number, number, number] = [
    driver.x,
    (driver.z || 0) + 1.2,
    -driver.y,
  ];

  return (
    <group
      ref={groupRef}
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(driver.code);
      }}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* 3D Car Marker (Aerodynamic Pod / Sphere) */}
      <mesh castShadow>
        <sphereGeometry args={[isFocused ? 2.2 : 1.8, 16, 16]} />
        <meshStandardMaterial
          color={markerColor}
          emissive={markerColor}
          emissiveIntensity={isPitting ? 0.9 : isFocused ? 0.6 : 0.25}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Ground Projection Halo Ring */}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, isFocused ? 3.5 : 2.5, 32]} />
        <meshBasicMaterial
          color={markerColor}
          transparent
          opacity={isPitting ? 0.9 : isFocused ? 0.8 : 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floating Acronym Tag & Pit Indicator */}
      {shouldRenderLabel && (
        <Html
          position={[0, 4.5, 0]}
          center
          distanceFactor={100}
          zIndexRange={[15, 0]}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect(driver.code);
            }}
            className={`cursor-pointer px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 shadow-xl select-none ${
              isFocused
                ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-black/80 font-black"
                : "hover:scale-105 opacity-90 hover:opacity-100"
            }`}
            style={{
              backgroundColor: isPitting ? "rgba(24, 18, 5, 0.92)" : "rgba(11, 14, 20, 0.9)",
              border: `1.5px solid ${markerColor}`,
              boxShadow: isPitting ? "0 0 14px rgba(245, 158, 11, 0.6)" : undefined,
              color: "#FFFFFF",
            }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: markerColor }}
            />
            <span>{driver.code}</span>
            {isPitting && (
              <span className="px-1 py-0.2 rounded bg-amber-500 text-black text-[9px] font-black uppercase tracking-wider animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]">
                PIT{driver.pit_duration ? ` ${driver.pit_duration.toFixed(0)}s` : ""}
              </span>
            )}
            {isFocused && (
              <span className="text-[9px] text-slate-300 font-normal border-l border-white/20 pl-1">
                {Math.round(driver.speed)} km/h
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
