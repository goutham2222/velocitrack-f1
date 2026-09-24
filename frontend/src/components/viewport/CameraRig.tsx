"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CameraMode, InterpolatedDriverState } from "@/types/telemetry";

interface CameraRigProps {
  mode: CameraMode;
  focusedDriver: InterpolatedDriverState | null;
  origin?: [number, number, number];
  defaultHeight?: number;
  defaultDistance?: number;
  resetTrigger?: number;
  disabled?: boolean;
}

export function CameraRig({
  mode,
  focusedDriver,
  origin = [0, 0, 0],
  defaultHeight = 240,
  defaultDistance = 220,
  resetTrigger = 0,
  disabled = false,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const currentTargetRef = useRef<THREE.Vector3>(
    new THREE.Vector3(origin[0], origin[1], origin[2])
  );
  const isTransitioningRef = useRef<boolean>(false);
  const lastModeRef = useRef<CameraMode>(mode);
  const lastResetTriggerRef = useRef<number>(resetTrigger);

  // Target overview vectors
  const targetOrigin = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const targetPos = new THREE.Vector3(
    origin[0],
    origin[1] + defaultHeight,
    origin[2] + defaultDistance
  );

  // Trigger smooth transition back to overview when mode switches from chase to orbit or resetTrigger fires
  useEffect(() => {
    if (lastModeRef.current === "chase" && mode === "orbit") {
      isTransitioningRef.current = true;
    }
    lastModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (resetTrigger !== lastResetTriggerRef.current) {
      lastResetTriggerRef.current = resetTrigger;
      isTransitioningRef.current = true;
    }
  }, [resetTrigger]);

  useFrame((_, delta) => {
    if (mode === "chase" && focusedDriver) {
      isTransitioningRef.current = false;

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

      // Smooth damping for cinematic broadcast tracking
      const lerpSpeed = Math.min(1.0, delta * 4.5);
      camera.position.lerp(desiredCamPos, lerpSpeed);
      currentTargetRef.current.lerp(targetLook, lerpSpeed);
      camera.lookAt(currentTargetRef.current);

      if (controlsRef.current) {
        controlsRef.current.target.copy(currentTargetRef.current);
      }
    } else if (isTransitioningRef.current) {
      // Smoothly interpolate camera.position and controls.target back to the circuit overview
      const lerpFactor = Math.min(1.0, delta * 2.0);
      camera.position.lerp(targetPos, lerpFactor);
      currentTargetRef.current.lerp(targetOrigin, lerpFactor);
      camera.lookAt(currentTargetRef.current);

      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetOrigin, lerpFactor);
        controlsRef.current.update();
      }

      // Once the distance delta is below a threshold, release isTransitioning and hand control back to OrbitControls
      const posDist = camera.position.distanceTo(targetPos);
      const targetDist = currentTargetRef.current.distanceTo(targetOrigin);
      if (posDist < 3.0 && targetDist < 1.5) {
        isTransitioningRef.current = false;
        if (controlsRef.current) {
          controlsRef.current.target.copy(targetOrigin);
          controlsRef.current.update();
        }
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={mode === "orbit" && !isTransitioningRef.current && !disabled}
      enableDamping={true}
      dampingFactor={0.06}
      maxPolarAngle={Math.PI / 2.05} // prevent going below ground
      minDistance={15}
      maxDistance={1500}
    />
  );
}
