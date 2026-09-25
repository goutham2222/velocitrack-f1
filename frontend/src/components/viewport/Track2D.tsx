"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { CircuitGeometry, InterpolatedDriverState } from "@/types/telemetry";
import { ZoomIn, ZoomOut, Compass, RotateCw } from "lucide-react";

interface Track2DProps {
  circuit: CircuitGeometry;
  drivers: Record<string, InterpolatedDriverState>;
  focusedDriver: InterpolatedDriverState | null;
  onSelectDriver: (code: string) => void;
  onDeselectDriver?: () => void;
  isInteractionDisabled?: boolean;
  showDriverLabels?: boolean;
  zoomPercent?: number;
  onZoomChange?: (zoom: number) => void;
}

export function Track2D({
  circuit,
  drivers,
  focusedDriver,
  onSelectDriver,
  onDeselectDriver,
  isInteractionDisabled = false,
  showDriverLabels = true,
  zoomPercent,
  onZoomChange,
}: Track2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Targets and smoothly interpolated values for 60 FPS damping
  const targetScaleRef = useRef<number>(0.9);
  const currentScaleRef = useRef<number>(0.9);
  const targetOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetRotationRef = useRef<number>(0);
  const currentRotationRef = useRef<number>(0);

  // Synchronize callbacks and external zoom props
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  const lastExternalZoomRef = useRef<number | undefined>(zoomPercent);
  const isInternalZoomRef = useRef<boolean>(false);

  // Mouse interaction state refs
  const isDraggingRef = useRef<boolean>(false);
  const isRotatingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const clickStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMouseAngleRef = useRef<number>(0);

  // Reactive state for HUD overlay display (angle and zoom)
  const [hudRotationDeg, setHudRotationDeg] = useState<number>(0);
  const [hudScalePercent, setHudScalePercent] = useState<number>(100);

  // Compute track bounds for auto-centering
  const bounds = React.useMemo(() => {
    if (!circuit || !circuit.centerline || circuit.centerline.length === 0) {
      return { minX: -200, maxX: 200, minY: -200, maxY: 200, width: 400, height: 400, centerX: 0, centerY: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const pt of circuit.centerline) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(10, maxX - minX),
      height: Math.max(10, maxY - minY),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [circuit]);

  // Synchronize with external Zoom Bar slider or button changes
  useEffect(() => {
    if (zoomPercent === undefined) return;
    if (isInternalZoomRef.current) {
      isInternalZoomRef.current = false;
      return;
    }
    if (zoomPercent === lastExternalZoomRef.current) return;
    lastExternalZoomRef.current = zoomPercent;

    const newTargetScale = (zoomPercent / 100) * 0.9;
    targetScaleRef.current = Math.max(0.3, Math.min(6.0, newTargetScale));
  }, [zoomPercent]);

  // Smooth Cursor-Anchored Zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (isInteractionDisabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - canvas.clientWidth / 2;
    const mouseY = e.clientY - rect.top - canvas.clientHeight / 2;

    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.3, Math.min(6.0, targetScaleRef.current * factor));
    const actualFactor = newScale / targetScaleRef.current;

    // Anchor zoom at mouse coordinates so cursor stays locked to the same map point
    targetOffsetRef.current = {
      x: mouseX - (mouseX - targetOffsetRef.current.x) * actualFactor,
      y: mouseY - (mouseY - targetOffsetRef.current.y) * actualFactor,
    };
    targetScaleRef.current = newScale;

    isInternalZoomRef.current = true;
    const reportedPercent = Math.round((newScale / 0.9) * 100);
    if (onZoomChangeRef.current) {
      onZoomChangeRef.current(reportedPercent);
    }
  };

  // Mouse Down: Left click = Pan, Right click or Alt+click = Circular Rotate
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isInteractionDisabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const isRotate = e.button === 2 || e.altKey || e.shiftKey;

    if (isRotate) {
      isRotatingRef.current = true;
      lastMouseAngleRef.current = Math.atan2(mouseY - centerY, mouseX - centerX);
    } else if (e.button === 0) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX - targetOffsetRef.current.x,
        y: e.clientY - targetOffsetRef.current.y,
      };
      clickStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Mouse Move: Apply Pan or Circular Rotation
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isInteractionDisabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isRotatingRef.current) {
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
      let deltaAngle = currentAngle - lastMouseAngleRef.current;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

      targetRotationRef.current += deltaAngle;
      lastMouseAngleRef.current = currentAngle;
    } else if (isDraggingRef.current) {
      targetOffsetRef.current = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
    }
  };

  // Mouse Up: Complete Drag or Check Driver Selection Hit-Testing
  const handleMouseUp = (e: React.MouseEvent) => {
    if (isInteractionDisabled) {
      isDraggingRef.current = false;
      isRotatingRef.current = false;
      return;
    }

    const wasRotating = isRotatingRef.current;
    const wasDragging = isDraggingRef.current;
    isRotatingRef.current = false;
    isDraggingRef.current = false;

    if (wasRotating) return;

    // Check if stationary click (< 6px movement)
    const moveDist = Math.hypot(
      e.clientX - clickStartRef.current.x,
      e.clientY - clickStartRef.current.y
    );

    if (wasDragging && moveDist < 6) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const fitScale =
        Math.min(width / bounds.width, height / bounds.height) * 0.75 * currentScaleRef.current;

      // Transform click coordinate through current rotation, offset, and scale
      const dx = clickX - (width / 2 + currentOffsetRef.current.x);
      const dy = clickY - (height / 2 + currentOffsetRef.current.y);
      const angle = currentRotationRef.current;
      const rx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
      const ry = dx * Math.sin(-angle) + dy * Math.cos(-angle);

      const worldX = bounds.centerX + rx / fitScale;
      const worldY = bounds.centerY - ry / fitScale;

      let clickedDriverCode: string | null = null;
      const driverList = Object.values(drivers);
      for (const drv of driverList) {
        const dist = Math.hypot(worldX - drv.x, worldY - drv.y) * fitScale;
        if (dist < 22) {
          clickedDriverCode = drv.code;
          break;
        }
      }

      if (clickedDriverCode) {
        onSelectDriver(clickedDriverCode);
      } else if (onDeselectDriver) {
        onDeselectDriver();
      }
    }
  };

  const resetView = useCallback(() => {
    targetScaleRef.current = 0.9;
    targetOffsetRef.current = { x: 0, y: 0 };
    targetRotationRef.current = 0;
    isInternalZoomRef.current = true;
    if (onZoomChangeRef.current) {
      onZoomChangeRef.current(100);
    }
  }, []);

  const rotate90 = useCallback(() => {
    targetRotationRef.current += Math.PI / 4;
  }, []);

  // 60 FPS Render loop with smooth interpolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frameCount = 0;

    const render = () => {
      // Smooth damping interpolation (no sudden jumps!)
      const lerpFactor = 0.18;
      currentScaleRef.current += (targetScaleRef.current - currentScaleRef.current) * lerpFactor;
      currentOffsetRef.current.x += (targetOffsetRef.current.x - currentOffsetRef.current.x) * lerpFactor;
      currentOffsetRef.current.y += (targetOffsetRef.current.y - currentOffsetRef.current.y) * lerpFactor;
      currentRotationRef.current += (targetRotationRef.current - currentRotationRef.current) * lerpFactor;

      // Periodically update HUD state without causing re-render storms
      frameCount++;
      if (frameCount % 6 === 0) {
        const deg = Math.round(((-currentRotationRef.current * 180) / Math.PI) % 360);
        setHudRotationDeg(deg < 0 ? deg + 360 : deg);
        setHudScalePercent(Math.round((currentScaleRef.current / 0.9) * 100));
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // Background grid
      ctx.fillStyle = "#0b0e14";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      // Translate to center + smoothed offset
      ctx.translate(width / 2 + currentOffsetRef.current.x, height / 2 + currentOffsetRef.current.y);

      // Rotate canvas by current smoothed rotation angle
      ctx.rotate(currentRotationRef.current);

      // Calculate base fit ratio
      const fitScale =
        Math.min(width / bounds.width, height / bounds.height) * 0.75 * currentScaleRef.current;
      ctx.scale(fitScale, -fitScale); // Invert Y to match Cartesian
      ctx.translate(-bounds.centerX, -bounds.centerY);

      // Draw Grid Lines in world space
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1 / fitScale;
      const gridStep = 50;
      for (let x = bounds.minX - 100; x <= bounds.maxX + 100; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, bounds.minY - 100);
        ctx.lineTo(x, bounds.maxY + 100);
        ctx.stroke();
      }
      for (let y = bounds.minY - 100; y <= bounds.maxY + 100; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(bounds.minX - 100, y);
        ctx.lineTo(bounds.maxX + 100, y);
        ctx.stroke();
      }

      // Draw Track Underlay (Glow)
      if (circuit.centerline.length > 2) {
        ctx.beginPath();
        ctx.moveTo(circuit.centerline[0][0], circuit.centerline[0][1]);
        for (let i = 1; i < circuit.centerline.length; i++) {
          ctx.lineTo(circuit.centerline[i][0], circuit.centerline[i][1]);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(30, 41, 59, 0.9)";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Track Centerline
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 4;
        ctx.stroke();

        // Start / Finish Line
        const startPt = circuit.centerline[0];
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(startPt[0] - 2, startPt[1] - 8, 4, 16);
      }

      // Draw Turn Markers (Upright with Counter-Rotation)
      for (const turn of circuit.turns) {
        ctx.fillStyle = "#475569";
        ctx.beginPath();
        ctx.arc(turn.x, turn.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(turn.x, turn.y);
        ctx.scale(1 / fitScale, -1 / fitScale);
        ctx.rotate(-currentRotationRef.current); // Keep turn label upright
        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`T${turn.number}`, 0, -8);
        ctx.restore();
      }

      // Draw Drivers (Halo, Inner Dot, and Upright Tags)
      const driverList = Object.values(drivers);
      for (const drv of driverList) {
        const isFocused = focusedDriver?.code === drv.code;

        // Halo / Pulsing Ring
        ctx.beginPath();
        ctx.arc(drv.x, drv.y, isFocused ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = drv.teamColor;
        ctx.shadowColor = drv.teamColor;
        ctx.shadowBlur = isFocused ? 12 : 5;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner Dot
        ctx.beginPath();
        ctx.arc(drv.x, drv.y, isFocused ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        // Driver Label (Tag) - Always kept upright and readable
        if (showDriverLabels) {
          ctx.save();
          ctx.translate(drv.x, drv.y);
          ctx.scale(1 / fitScale, -1 / fitScale);
          ctx.rotate(-currentRotationRef.current); // Counter-rotate so tag is upright

          const tagText = drv.code;
          ctx.font = isFocused ? "bold 11px monospace" : "10px monospace";
          const textWidth = ctx.measureText(tagText).width;
          const padX = 4;

          ctx.fillStyle = "rgba(11, 14, 20, 0.85)";
          ctx.strokeStyle = drv.teamColor;
          ctx.lineWidth = isFocused ? 1.5 : 1;
          ctx.beginPath();
          ctx.roundRect(-textWidth / 2 - padX, -22, textWidth + padX * 2, 15, 3);
          ctx.fill();
          ctx.stroke();

          // Tag Text
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.fillText(tagText, 0, -11);

          ctx.restore();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [circuit, drivers, focusedDriver, bounds, showDriverLabels]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-titanium-950 ${
        isInteractionDisabled ? "pointer-events-none select-none" : ""
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* 2D Viewport Overlay HUD Controls (Zoom In/Out, Circular Rotate, Compass Reset) */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-titanium-900/80 backdrop-blur-md border border-white/10 rounded-lg p-1.5 shadow-xl select-none font-mono">
        <button
          onClick={() => {
            targetScaleRef.current = Math.min(6.0, targetScaleRef.current * 1.25);
            isInternalZoomRef.current = true;
            if (onZoomChangeRef.current) {
              onZoomChangeRef.current(Math.round((targetScaleRef.current / 0.9) * 100));
            }
          }}
          title="Zoom In"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            targetScaleRef.current = Math.max(0.3, targetScaleRef.current * 0.8);
            isInternalZoomRef.current = true;
            if (onZoomChangeRef.current) {
              onZoomChangeRef.current(Math.round((targetScaleRef.current / 0.9) * 100));
            }
          }}
          title="Zoom Out"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={rotate90}
          title="Rotate 45° Clockwise"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        {/* Interactive Circular Compass Widget (Click to Reset North 0°) */}
        <button
          onClick={resetView}
          title={`Heading: ${hudRotationDeg}° • Click to Reset North & Zoom • Right-Click drag on map to rotate`}
          className="relative flex items-center justify-center w-7 h-7 rounded-full bg-black/50 border border-white/15 hover:border-sky-400 text-slate-300 hover:text-white transition group"
        >
          <Compass
            className="w-4 h-4 text-sky-400 transition-transform duration-75"
            style={{ transform: `rotate(${-hudRotationDeg}deg)` }}
          />
          <span className="absolute -top-1 text-[8px] font-black text-rose-500 pointer-events-none">
            N
          </span>
        </button>
      </div>

      <div className="absolute bottom-4 left-4 text-[10px] font-mono text-slate-400 uppercase tracking-widest bg-titanium-950/80 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 pointer-events-none flex items-center gap-2">
        <span>2D RADAR</span>
        <span className="text-slate-600">&bull;</span>
        <span>ZOOM: {hudScalePercent}%</span>
        <span className="text-slate-600">&bull;</span>
        <span className="text-sky-400">{hudRotationDeg}°</span>
        <span className="text-[9px] text-slate-500 normal-case">(Right-Click + Drag to Rotate)</span>
      </div>
    </div>
  );
}
