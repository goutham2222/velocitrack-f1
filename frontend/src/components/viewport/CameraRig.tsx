"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CameraMode, InterpolatedDriverState, CircuitGeometry } from "@/types/telemetry";

interface CameraRigProps {
  mode: CameraMode;
  focusedDriver: InterpolatedDriverState | null;
  circuit: CircuitGeometry;
  resetTrigger?: number;
  disabled?: boolean;
}

export function CameraRig({
  mode,
  focusedDriver,
  circuit,
  resetTrigger = 0,
  disabled = false,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const isTransitioningRef = useRef<boolean>(false);
  const lastModeRef = useRef<CameraMode>(mode);
  const lastResetTriggerRef = useRef<number>(resetTrigger);
  const isInitializedRef = useRef<boolean>(false);
  const currentCircuitNameRef = useRef<string>("");

  // 1. Compute true 3D Bounding Box and Bounding Sphere from circuit coordinate vertices
  const { sphere, idealDistance, overviewPos, overviewCenter } = React.useMemo(() => {
    const box = new THREE.Box3();
    if (circuit && circuit.centerline && circuit.centerline.length > 0) {
      for (const pt of circuit.centerline) {
        // Map [X, Z_elev, Y] to Three.js coordinates [x, y, z]
        box.expandByPoint(new THREE.Vector3(pt[0], pt[2] || 0.1, pt[1]));
      }
    } else {
      box.set(new THREE.Vector3(-150, 0, -150), new THREE.Vector3(150, 10, 150));
    }

    const s = box.getBoundingSphere(new THREE.Sphere());
    const persCamera = camera as THREE.PerspectiveCamera;
    const fovInRad = ((persCamera.fov || 48) * Math.PI) / 180;
    // Ideal camera distance dynamically calculated with 15% margin padding
    const distance = (Math.max(20, s.radius) / Math.sin(fovInRad / 2)) * 1.15;
    const pos = new THREE.Vector3(
      s.center.x,
      s.center.y + distance * 0.7,
      s.center.z + distance * 0.7
    );
    const center = s.center.clone();

    return {
      sphere: s,
      idealDistance: distance,
      overviewPos: pos,
      overviewCenter: center,
    };
  }, [circuit, camera]);

  const currentTargetRef = useRef<THREE.Vector3>(overviewCenter.clone());

  // 2. Center OrbitControls.target and auto-fit camera position whenever a new session/circuit loads
  useEffect(() => {
    const circuitChanged = currentCircuitNameRef.current !== circuit.circuit_name;
    currentCircuitNameRef.current = circuit.circuit_name;

    if (!isInitializedRef.current || circuitChanged) {
      isInitializedRef.current = true;
      if (mode === "orbit") {
        camera.position.set(overviewPos.x, overviewPos.y, overviewPos.z);
        currentTargetRef.current.copy(overviewCenter);
        camera.lookAt(overviewCenter);
        if (controlsRef.current) {
          controlsRef.current.target.copy(overviewCenter);
          controlsRef.current.update();
        }
      }
    }
  }, [circuit, overviewPos, overviewCenter, camera, mode]);

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

      // Desired camera position: close-up elevated chase angle
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
      const lerpFactor = Math.min(1.0, delta * 2.5);
      camera.position.lerp(overviewPos, lerpFactor);
      currentTargetRef.current.lerp(overviewCenter, lerpFactor);
      camera.lookAt(currentTargetRef.current);

      if (controlsRef.current) {
        controlsRef.current.target.lerp(overviewCenter, lerpFactor);
        controlsRef.current.update();
      }

      // Once the distance delta is below a threshold, release isTransitioning and hand control back to OrbitControls
      const posDist = camera.position.distanceTo(overviewPos);
      const targetDist = currentTargetRef.current.distanceTo(overviewCenter);
      if (
        posDist < Math.max(3.0, idealDistance * 0.02) &&
        targetDist < Math.max(1.5, idealDistance * 0.01)
      ) {
        isTransitioningRef.current = false;
        if (controlsRef.current) {
          controlsRef.current.target.copy(overviewCenter);
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
      minDistance={10}
      maxDistance={Math.max(2500, idealDistance * 3.5)}
    />
  );
}
