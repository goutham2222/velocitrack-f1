"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { CircuitGeometry, InterpolatedDriverState } from "@/types/telemetry";
import { Maximize2, ZoomIn, ZoomOut, Compass } from "lucide-react";

interface Track2DProps {
  circuit: CircuitGeometry;
  drivers: Record<string, InterpolatedDriverState>;
  focusedDriver: InterpolatedDriverState | null;
  onSelectDriver: (code: string) => void;
  onDeselectDriver?: () => void;
  isInteractionDisabled?: boolean;
  showDriverLabels?: boolean;
}

export function Track2D({
  circuit,
  drivers,
  focusedDriver,
  onSelectDriver,
  onDeselectDriver,
  isInteractionDisabled = false,
  showDriverLabels = true,
}: Track2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState<number>(0.9);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const clickStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Handle Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    if (isInteractionDisabled) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.88;
    setScale((prev) => Math.max(0.3, Math.min(6.0, prev * factor)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isInteractionDisabled) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    clickStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isInteractionDisabled || !isDraggingRef.current) return;
    setOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isInteractionDisabled) {
      isDraggingRef.current = false;
      return;
    }
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;

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
        Math.min(width / bounds.width, height / bounds.height) * 0.75 * scale;

      // Find if clicked on any driver
      let clickedDriverCode: string | null = null;
      const driverList = Object.values(drivers);
      for (const drv of driverList) {
        const screenX =
          width / 2 + offset.x + (drv.x - bounds.centerX) * fitScale;
        const screenY =
          height / 2 + offset.y - (drv.y - bounds.centerY) * fitScale;
        const dist = Math.hypot(clickX - screenX, clickY - screenY);
        if (dist < 20) {
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
    setScale(0.9);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Main 2D Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
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
      // Center canvas origin
      ctx.translate(width / 2 + offset.x, height / 2 + offset.y);

      // Calculate base fit ratio
      const fitScale = Math.min(width / bounds.width, height / bounds.height) * 0.75 * scale;
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

      // Draw Turn Markers
      for (const turn of circuit.turns) {
        ctx.fillStyle = "#475569";
        ctx.beginPath();
        ctx.arc(turn.x, turn.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.scale(1 / fitScale, -1 / fitScale);
        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`T${turn.number}`, turn.x * fitScale, -turn.y * fitScale - 8);
        ctx.restore();
      }

      // Draw Drivers
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

        // Driver Label (Tag)
        if (showDriverLabels) {
          ctx.save();
          ctx.scale(1 / fitScale, -1 / fitScale);
          const screenX = drv.x * fitScale;
          const screenY = -drv.y * fitScale;

          // Tag Background
          const tagText = drv.code;
          ctx.font = isFocused ? "bold 11px monospace" : "10px monospace";
          const textWidth = ctx.measureText(tagText).width;
          const padX = 4;
          const padY = 2;

          ctx.fillStyle = "rgba(11, 14, 20, 0.85)";
          ctx.strokeStyle = drv.teamColor;
          ctx.lineWidth = isFocused ? 1.5 : 1;
          ctx.beginPath();
          ctx.roundRect(
            screenX - textWidth / 2 - padX,
            screenY - 22,
            textWidth + padX * 2,
            15,
            3
          );
          ctx.fill();
          ctx.stroke();

          // Tag Text
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.fillText(tagText, screenX, screenY - 11);

          ctx.restore();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [circuit, drivers, focusedDriver, scale, offset, bounds, showDriverLabels]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-titanium-950 ${
        isInteractionDisabled ? "pointer-events-none select-none" : ""
      }`}
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

      {/* 2D Viewport Overlay HUD Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-titanium-900/80 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-xl">
        <button
          onClick={() => setScale((s) => Math.min(6.0, s * 1.25))}
          title="Zoom In"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s * 0.8))}
          title="Zoom Out"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          title="Reset View"
          className="p-1.5 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-titanium-950/80 px-2 py-1 rounded border border-white/5 pointer-events-none">
        Tactical Radar 2D Mode &bull; Scale: {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
