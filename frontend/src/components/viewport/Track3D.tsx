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

      {/* Start / Finish Line */}
      {centerlinePoints.length > 0 && (
        <group position={[centerlinePoints[0].x, centerlinePoints[0].y + 0.1, centerlinePoints[0].z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[14, 2]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          <Html position={[0, 8, 0]} center distanceFactor={120} zIndexRange={[100, 0]}>
            <div className="px-2 py-0.5 rounded bg-black/80 border border-white/40 text-[10px] font-mono font-bold tracking-widest text-white shadow-lg pointer-events-none">
              START / FINISH
            </div>
          </Html>
        </group>
      )}

      {/* Elevated Turn Markers with Non-Clipping Badges */}
      {circuit.turns.map((turn) => {
        const surfaceY = turn.z || 0.1;
        const elevatedY = surfaceY + 12.0; // Elevate +Y units above track surface to eliminate clipping
        return (
          <group
            key={`turn-${turn.number}-${turn.name || ""}`}
            position={[turn.x, elevatedY, turn.y]}
          >
            {/* Vertical Marker Guide Pin to Track Surface */}
            <mesh position={[0, -5.5, 0]} renderOrder={2}>
              <cylinderGeometry args={[0.15, 0.15, 11, 8]} />
              <meshBasicMaterial
                color="#0284c7"
                transparent
                opacity={0.45}
                depthTest={false}
              />
            </mesh>

            {/* Glowing Turn Apex Anchor Dot */}
            <mesh position={[0, 0, 0]} renderOrder={3}>
              <sphereGeometry args={[0.7, 16, 16]} />
              <meshBasicMaterial color="#38bdf8" depthTest={false} />
            </mesh>

            {/* Floating Elevated Turn Badge */}
            <Html
              position={[0, 1.8, 0]}
              center
              distanceFactor={135}
              zIndexRange={[100, 0]}
            >
              <div className="flex flex-col items-center pointer-events-none select-none">
                <div className="w-6 h-6 rounded-full bg-slate-950/95 border-2 border-sky-400 text-[11px] font-mono font-black text-sky-200 flex items-center justify-center shadow-[0_0_10px_rgba(56,189,248,0.6)]">
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

