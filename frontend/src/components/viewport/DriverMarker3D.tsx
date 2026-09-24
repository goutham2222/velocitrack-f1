"use client";

import React, { useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { InterpolatedDriverState } from "@/types/telemetry";

interface DriverMarker3DProps {
  driver: InterpolatedDriverState;
  isFocused: boolean;
  onSelect: (code: string) => void;
}

export function DriverMarker3D({ driver, isFocused, onSelect }: DriverMarker3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Position in Three.js coordinates: [x, z + offset, y]
  const pos: [number, number, number] = [
    driver.x,
    (driver.z || 0) + 1.2,
    driver.y,
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
          color={driver.teamColor}
          emissive={driver.teamColor}
          emissiveIntensity={isFocused ? 0.6 : 0.25}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Ground Projection Halo Ring */}
      <mesh position={[0, -0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, isFocused ? 3.5 : 2.5, 32]} />
        <meshBasicMaterial
          color={driver.teamColor}
          transparent
          opacity={isFocused ? 0.8 : 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Floating Acronym Tag */}
      <Html
        position={[0, 4.5, 0]}
        center
        distanceFactor={100}
        zIndexRange={[90, 0]}
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
            backgroundColor: "rgba(11, 14, 20, 0.9)",
            border: `1.5px solid ${driver.teamColor}`,
            color: "#FFFFFF",
          }}
        >
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: driver.teamColor }}
          />
          <span>{driver.code}</span>
          {isFocused && (
            <span className="text-[9px] text-slate-300 font-normal border-l border-white/20 pl-1">
              {Math.round(driver.speed)} km/h
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}
