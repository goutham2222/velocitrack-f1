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
  zoomPercent?: number;
  onZoomChange?: (zoom: number) => void;
}

export function CameraRig({
  mode,
  focusedDriver,
  circuit,
  resetTrigger = 0,
  disabled = false,
  zoomPercent,
  onZoomChange,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, gl } = useThree();
  const isTransitioningRef = useRef<boolean>(false);
  const lastModeRef = useRef<CameraMode>(mode);
  const lastResetTriggerRef = useRef<number>(resetTrigger);
  const isInitializedRef = useRef<boolean>(false);
  const currentCircuitNameRef = useRef<string>("");
  const onZoomChangeRef = useRef(onZoomChange);
  const lastExternalZoomRef = useRef<number | undefined>(zoomPercent);
  const isInternalZoomRef = useRef<boolean>(false);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

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

  // 3. Wheel listener for Cursor-Anchored Zoom (like Google Maps, CAD, and GIS tools)
  useEffect(() => {
    const dom = gl.domElement;
    if (!dom) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle custom cursor-anchored zoom in free orbit mode
      if (mode !== "orbit" || isTransitioningRef.current || disabled) return;

      e.preventDefault();
      e.stopPropagation();

      const persCamera = camera as THREE.PerspectiveCamera;
      const rect = dom.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Create ray from camera through cursor
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), persCamera);

      // Horizontal ground plane at the height of controls target
      const currentTarget = controlsRef.current ? controlsRef.current.target : currentTargetRef.current;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -currentTarget.y);
      const hitPoint = new THREE.Vector3();
      const hasHit = raycaster.ray.intersectPlane(plane, hitPoint);

      // If pointing at sky or horizon, fallback pivot is the current orbit target
      const pivot = (hasHit && persCamera.position.y > currentTarget.y + 0.5) ? hitPoint : currentTarget;

      // Smooth exponential zoom factor
      const factor = Math.min(1.35, Math.max(0.65, Math.pow(1.0014, e.deltaY)));
      const currentDistance = persCamera.position.distanceTo(currentTarget);
      const minDistance = 12;
      const maxDistance = Math.max(3000, idealDistance * 3.5);

      // Clamp factor to min/max distance limits
      let clampedFactor = factor;
      if (currentDistance * factor < minDistance) {
        clampedFactor = minDistance / currentDistance;
      } else if (currentDistance * factor > maxDistance) {
        clampedFactor = maxDistance / currentDistance;
      }

      if (Math.abs(clampedFactor - 1.0) > 0.0001) {
        // Move camera position and controls target relative to cursor pivot
        persCamera.position.x = pivot.x + (persCamera.position.x - pivot.x) * clampedFactor;
        persCamera.position.y = pivot.y + (persCamera.position.y - pivot.y) * clampedFactor;
        persCamera.position.z = pivot.z + (persCamera.position.z - pivot.z) * clampedFactor;

        if (controlsRef.current) {
          controlsRef.current.target.x = pivot.x + (controlsRef.current.target.x - pivot.x) * clampedFactor;
          controlsRef.current.target.y = pivot.y + (controlsRef.current.target.y - pivot.y) * clampedFactor;
          controlsRef.current.target.z = pivot.z + (controlsRef.current.target.z - pivot.z) * clampedFactor;
          currentTargetRef.current.copy(controlsRef.current.target);
          controlsRef.current.update();
        }

        // Synchronize zoom level with external HUD controls
        const newDist = persCamera.position.distanceTo(currentTargetRef.current);
        const currentZoom = Math.round((idealDistance / newDist) * 100);
        isInternalZoomRef.current = true;
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(Math.min(300, Math.max(30, currentZoom)));
        }
      }
    };

    dom.addEventListener("wheel", handleWheel, { passive: false });
    return () => dom.removeEventListener("wheel", handleWheel);
  }, [camera, gl, mode, disabled, idealDistance]);

  // 4. Respond to external zoom changes (e.g. from Zoom Bar slider or +/- buttons)
  useEffect(() => {
    if (zoomPercent === undefined || mode !== "orbit" || isTransitioningRef.current) return;
    if (isInternalZoomRef.current) {
      isInternalZoomRef.current = false;
      return;
    }
    if (zoomPercent === lastExternalZoomRef.current) return;
    lastExternalZoomRef.current = zoomPercent;

    const persCamera = camera as THREE.PerspectiveCamera;
    const target = controlsRef.current ? controlsRef.current.target : currentTargetRef.current;
    const targetDist = idealDistance / (zoomPercent / 100);
    const viewDir = persCamera.position.clone().sub(target);
    if (viewDir.lengthSq() > 0.001) {
      viewDir.setLength(targetDist);
      persCamera.position.copy(target).add(viewDir);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    }
  }, [zoomPercent, mode, idealDistance, camera]);

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
        if (onZoomChangeRef.current) {
          onZoomChangeRef.current(100);
        }
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={mode === "orbit" && !isTransitioningRef.current && !disabled}
      enableZoom={false} // Managed via custom cursor-anchored zoom handler
      enablePan={mode === "orbit" && !isTransitioningRef.current && !disabled}
      enableRotate={mode === "orbit" && !isTransitioningRef.current && !disabled}
      enableDamping={true}
      dampingFactor={0.06}
      maxPolarAngle={Math.PI / 2.05} // prevent going below ground
      minDistance={10}
      maxDistance={Math.max(2500, idealDistance * 3.5)}
    />
  );
}
