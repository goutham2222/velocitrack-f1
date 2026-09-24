"use client";

import React, { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CameraMode, InterpolatedDriverState } from "@/types/telemetry";

interface CameraRigProps {
  mode: CameraMode;
  focusedDriver: InterpolatedDriverState | null;
}

export function CameraRig({ mode, focusedDriver }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const currentTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const currentCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 300, 200));

  useFrame((_, delta) => {
    if (mode === "chase" && focusedDriver) {
      // Driver position in Three.js coordinates
      const driverPos = new THREE.Vector3(
        focusedDriver.x,
        (focusedDriver.z || 0) + 2.0,
        focusedDriver.y
      );

      // Desired camera target: looking slightly ahead of the driver
      const targetLook = new THREE.Vector3(
        driverPos.x,
        driverPos.y + 1.5,
        driverPos.z
      );

      // Desired camera position: elevated chase angle
      const desiredCamPos = new THREE.Vector3(
        driverPos.x + 25.0,
        driverPos.y + 20.0,
        driverPos.z + 25.0
      );

      // Smooth damping (lerp) for cinematic broadcast tracking
      const lerpSpeed = Math.min(1.0, delta * 4.5);
      camera.position.lerp(desiredCamPos, lerpSpeed);
      currentTargetRef.current.lerp(targetLook, lerpSpeed);
      camera.lookAt(currentTargetRef.current);

      if (controlsRef.current) {
        controlsRef.current.target.copy(currentTargetRef.current);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={mode === "orbit"}
      enableDamping={true}
      dampingFactor={0.06}
      maxPolarAngle={Math.PI / 2.05} // prevent going below ground
      minDistance={10}
      maxDistance={1200}
    />
  );
}

