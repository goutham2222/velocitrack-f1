"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { CircuitGeometry } from "@/types/telemetry";

interface Track3DProps {
  circuit: CircuitGeometry;
}

export function Track3D({ circuit }: Track3DProps) {
  const { ribbonGeometry, kerbLeftGeometry, kerbRightGeometry, centerlinePoints } = useMemo(() => {
    if (!circuit || !circuit.centerline || circuit.centerline.length < 3) {
      return {
        ribbonGeometry: null,
        kerbLeftGeometry: null,
        kerbRightGeometry: null,
        centerlinePoints: [],
      };
    }

    const pts = circuit.centerline.map(
      (p) => new THREE.Vector3(p[0], p[2] || 0.1, p[1]) // Note: map [X, Z_elev, Y] to Three.js coordinates
    );

    // Create closed smooth curve
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const numPoints = 800;
    const samplePoints = curve.getPoints(numPoints);

    // Track width in meters
    const trackWidth = 14.0;
    const kerbWidth = 1.2;

    const vertices: number[] = [];
    const kerbLeftVerts: number[] = [];
    const kerbRightVerts: number[] = [];
    const indices: number[] = [];
    const kerbIndices: number[] = [];

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= numPoints; i++) {
      const idx = i % numPoints;
      const pt = samplePoints[idx];
      const nextPt = samplePoints[(idx + 1) % numPoints];
      const tangent = new THREE.Vector3().subVectors(nextPt, pt).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Left and right track edges
      const left = new THREE.Vector3().copy(pt).addScaledVector(normal, trackWidth / 2);
      const right = new THREE.Vector3().copy(pt).addScaledVector(normal, -trackWidth / 2);

      // Outer kerbs
      const outerLeft = new THREE.Vector3().copy(left).addScaledVector(normal, kerbWidth);
      const outerRight = new THREE.Vector3().copy(right).addScaledVector(normal, -kerbWidth);

      // Track ribbon vertices
      vertices.push(left.x, left.y, left.z);
      vertices.push(right.x, right.y, right.z);

      // Kerb vertices
      kerbLeftVerts.push(left.x, left.y + 0.05, left.z);
      kerbLeftVerts.push(outerLeft.x, outerLeft.y + 0.05, outerLeft.z);

      kerbRightVerts.push(right.x, right.y + 0.05, right.z);
      kerbRightVerts.push(outerRight.x, outerRight.y + 0.05, outerRight.z);

      if (i < numPoints) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);

        kerbIndices.push(base, base + 1, base + 2);
        kerbIndices.push(base + 1, base + 3, base + 2);
      }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    ribbonGeo.setIndex(indices);
    ribbonGeo.computeVertexNormals();

    const kerbLeftGeo = new THREE.BufferGeometry();
    kerbLeftGeo.setAttribute("position", new THREE.Float32BufferAttribute(kerbLeftVerts, 3));
    kerbLeftGeo.setIndex(kerbIndices);
    kerbLeftGeo.computeVertexNormals();

    const kerbRightGeo = new THREE.BufferGeometry();
    kerbRightGeo.setAttribute("position", new THREE.Float32BufferAttribute(kerbRightVerts, 3));
    kerbRightGeo.setIndex(kerbIndices);
    kerbRightGeo.computeVertexNormals();

    return {
      ribbonGeometry: ribbonGeo,
      kerbLeftGeometry: kerbLeftGeo,
      kerbRightGeometry: kerbRightGeo,
      centerlinePoints: pts,
    };
  }, [circuit]);

  if (!ribbonGeometry) return null;

  return (
    <group>
      {/* Asphalt Surface */}
      <mesh geometry={ribbonGeometry} receiveShadow>
        <meshStandardMaterial
          color="#151b26"
          roughness={0.85}
          metalness={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Track Edge Kerbs (Red & White Neon Theme) */}
      {kerbLeftGeometry && (
        <mesh geometry={kerbLeftGeometry}>
          <meshStandardMaterial
            color="#E10600"
            roughness={0.4}
            metalness={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {kerbRightGeometry && (
        <mesh geometry={kerbRightGeometry}>
          <meshStandardMaterial
            color="#E10600"
            roughness={0.4}
            metalness={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* High-Visibility Start / Finish Line & Illuminated Overhead Gantry */}
      {centerlinePoints.length > 1 && (() => {
        const p0 = centerlinePoints[0];
        const p1 = centerlinePoints[1];
        const tangent = new THREE.Vector3().subVectors(p1, p0).normalize();
        const angleY = Math.atan2(tangent.x, tangent.z);
        const trackHalfWidth = 8.5;
        const gantryHeight = 11.0;

        return (
          <group position={[p0.x, p0.y, p0.z]} rotation={[0, angleY, 0]}>
            {/* Checkered Road Finish Line */}
            <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
              <planeGeometry args={[16, 2.4]} />
              <meshBasicMaterial color="#FFFFFF" depthTest={true} />
            </mesh>
            <mesh position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
              <planeGeometry args={[15.6, 0.5]} />
              <meshBasicMaterial color="#E10600" depthTest={true} />
            </mesh>

            {/* Overhead Gantry: Left Pillar */}
            <mesh position={[-trackHalfWidth - 1.5, gantryHeight / 2, 0]}>
              <boxGeometry args={[0.8, gantryHeight, 0.8]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
            </mesh>

            {/* Overhead Gantry: Right Pillar */}
            <mesh position={[trackHalfWidth + 1.5, gantryHeight / 2, 0]}>
              <boxGeometry args={[0.8, gantryHeight, 0.8]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
            </mesh>

            {/* Overhead Crossbar Truss */}
            <mesh position={[0, gantryHeight, 0]}>
              <boxGeometry args={[trackHalfWidth * 2 + 4, 1.2, 1.6]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
            </mesh>

            {/* 5 FIA Starting Lights (Glowing Neon Red) */}
            {[-4, -2, 0, 2, 4].map((xOff, idx) => (
              <mesh
                key={`start-light-${idx}`}
                position={[xOff, gantryHeight - 1.2, 0.9]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
                <meshBasicMaterial color="#ef4444" />
              </mesh>
            ))}

            {/* Overhead Illuminated START / FINISH Sign */}
            <Html position={[0, gantryHeight + 2.5, 0]} center distanceFactor={140} zIndexRange={[100, 0]}>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-black/90 border-2 border-red-500 text-[11px] font-mono font-black tracking-widest text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] pointer-events-none select-none whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>START / FINISH</span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>
            </Html>
          </group>
        );
      })()}

      {/* Elevated Turn Markers with True Track Surface Y Lookup */}
      {circuit.turns.map((turn) => {
        // Dynamically find nearest track centerline vertex height so markers NEVER sink underground
        let closestY = 0;
        let minDistSq = Infinity;
        for (let i = 0; i < centerlinePoints.length; i++) {
          const cp = centerlinePoints[i];
          const dSq = (cp.x - turn.x) ** 2 + (cp.z - turn.y) ** 2;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            closestY = cp.y;
          }
        }
        const surfaceY = minDistSq < 60000 ? closestY : (turn.z || 0.1);
        const elevatedY = surfaceY + 15.0; // Consistently elevated 15m above true asphalt surface
        const pinHeight = 14.0;

        return (
          <group
            key={`turn-${turn.number}-${turn.name || ""}`}
            position={[turn.x, elevatedY, turn.y]}
          >
            {/* Vertical Marker Guide Pin down to Track Surface */}
            <mesh position={[0, -pinHeight / 2, 0]} renderOrder={2}>
              <cylinderGeometry args={[0.2, 0.2, pinHeight, 8]} />
              <meshBasicMaterial
                color="#0284c7"
                transparent
                opacity={0.5}
                depthTest={false}
              />
            </mesh>

            {/* Glowing Turn Apex Anchor Dot */}
            <mesh position={[0, 0, 0]} renderOrder={3}>
              <sphereGeometry args={[0.8, 16, 16]} />
              <meshBasicMaterial color="#38bdf8" depthTest={false} />
            </mesh>

            {/* Floating Elevated Turn Badge */}
            <Html
              position={[0, 2.0, 0]}
              center
              distanceFactor={135}
              zIndexRange={[100, 0]}
            >
              <div className="flex flex-col items-center pointer-events-none select-none">
                <div className="w-6 h-6 rounded-full bg-slate-950/95 border-2 border-sky-400 text-[11px] font-mono font-black text-sky-200 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.7)]">
                  {turn.number}
                </div>
                {turn.name && turn.name !== `Turn ${turn.number}` && (
                  <div className="mt-1 px-1.5 py-0.5 bg-black/90 border border-white/10 rounded text-[9px] font-mono font-semibold text-slate-300 whitespace-nowrap shadow-md">
                    {turn.name}
                  </div>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

