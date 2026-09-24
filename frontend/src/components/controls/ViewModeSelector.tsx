"use client";

import React from "react";
import { ViewportMode, CameraMode, SpeedUnit } from "@/types/telemetry";
import { Box, Map, Eye, Target, Gauge } from "lucide-react";

interface ViewModeSelectorProps {
  viewportMode: ViewportMode;
  cameraMode: CameraMode;
  speedUnit: SpeedUnit;
  onToggleViewportMode: (mode: ViewportMode) => void;
  onToggleCameraMode: (mode: CameraMode) => void;
  onToggleSpeedUnit: () => void;
}

export function ViewModeSelector({
  viewportMode,
  cameraMode,
  speedUnit,
  onToggleViewportMode,
  onToggleCameraMode,
  onToggleSpeedUnit,
}: ViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 glass-panel rounded-xl p-1.5 border border-white/10 shadow-xl select-none">
      {/* 3D vs 2D Toggle */}
      <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5">
        <button
          onClick={() => onToggleViewportMode("3d")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
            viewportMode === "3d"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span>3D VIEW</span>
        </button>
        <button
          onClick={() => onToggleViewportMode("2d")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
            viewportMode === "2d"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Map className="w-3.5 h-3.5 text-emerald-400" />
          <span>2D RADAR</span>
        </button>
      </div>

      {/* 3D Camera Mode Toggle (Free Orbit vs Chase Cam) */}
      {viewportMode === "3d" && (
        <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5">
          <button
            onClick={() => onToggleCameraMode("orbit")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
              cameraMode === "orbit"
                ? "bg-white/15 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Free Orbit Camera"
          >
            <Eye className="w-3.5 h-3.5 text-slate-300" />
            <span>ORBIT</span>
          </button>
          <button
            onClick={() => onToggleCameraMode("chase")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
              cameraMode === "chase"
                ? "bg-red-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
            title="Chase Cam Driver Lock"
          >
            <Target className="w-3.5 h-3.5" />
            <span>CHASE CAM</span>
          </button>
        </div>
      )}

      {/* Units Toggle */}
      <button
        onClick={onToggleSpeedUnit}
        title="Toggle speed unit"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/40 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white border border-white/5 transition"
      >
        <Gauge className="w-3.5 h-3.5 text-amber-400" />
        <span>{speedUnit.toUpperCase()}</span>
      </button>
    </div>
  );
}

