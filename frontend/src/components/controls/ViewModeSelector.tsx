"use client";

import React from "react";
import { ViewportMode, CameraMode, SpeedUnit } from "@/types/telemetry";
import { Box, Map, Eye, Target, Gauge, Tag, CameraOff } from "lucide-react";

interface ViewModeSelectorProps {
  viewportMode: ViewportMode;
  cameraMode: CameraMode;
  speedUnit: SpeedUnit;
  showDriverLabels: boolean;
  isDriverFocused?: boolean;
  onToggleViewportMode: (mode: ViewportMode) => void;
  onToggleCameraMode: (mode: CameraMode) => void;
  onToggleSpeedUnit: () => void;
  onToggleDriverLabels: () => void;
  onResetCamera?: () => void;
}

export function ViewModeSelector({
  viewportMode,
  cameraMode,
  speedUnit,
  showDriverLabels,
  isDriverFocused = false,
  onToggleViewportMode,
  onToggleCameraMode,
  onToggleSpeedUnit,
  onToggleDriverLabels,
  onResetCamera,
}: ViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 glass-panel rounded-xl p-1.5 border border-white/10 shadow-xl select-none">
      {/* 3D vs 2D Toggle */}
      <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5">
        <button
          onClick={() => onToggleViewportMode("3d")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
            viewportMode === "3d"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="3D Cinematic Orbit / Chase Track"
        >
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">3D VIEW</span>
        </button>
        <button
          onClick={() => onToggleViewportMode("2d")}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold transition ${
            viewportMode === "2d"
              ? "bg-white/15 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="2D Tactical Radar Map"
        >
          <Map className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">2D RADAR</span>
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
            <span className="hidden sm:inline">ORBIT</span>
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
            <span className="hidden sm:inline">CHASE</span>
          </button>
        </div>
      )}

      {/* Driver Labels Toggle */}
      <button
        onClick={onToggleDriverLabels}
        title={showDriverLabels ? "Hide Driver Labels" : "Show Driver Labels"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition border ${
          showDriverLabels
            ? "bg-white/15 text-white border-white/10 shadow-sm"
            : "bg-black/40 text-slate-500 hover:text-slate-300 border-white/5"
        }`}
      >
        <Tag
          className={`w-3.5 h-3.5 ${
            showDriverLabels ? "text-emerald-400" : "text-slate-500"
          }`}
        />
        <span className="hidden sm:inline">LABELS</span>
      </button>

      {/* Speed Units Toggle */}
      <button
        onClick={onToggleSpeedUnit}
        title="Toggle speed unit (km/h vs mph)"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/40 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white border border-white/5 transition"
      >
        <Gauge className="w-3.5 h-3.5 text-amber-400" />
        <span>{speedUnit.toUpperCase()}</span>
      </button>

      {/* Reset View / Exit Chase Cam button (when a driver is focused) */}
      {isDriverFocused && onResetCamera && (
        <button
          onClick={onResetCamera}
          title="Exit Driver Chase Cam (Esc)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/25 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-mono font-bold tracking-wider transition shadow-sm group animate-in fade-in duration-150"
        >
          <CameraOff className="w-3.5 h-3.5 text-red-400 group-hover:text-white transition" />
          <span className="hidden md:inline">RESET VIEW</span>
          <kbd className="hidden lg:inline px-1 py-0.2 rounded bg-black/40 border border-white/10 text-[9px] text-slate-400 font-mono">
            ESC
          </kbd>
        </button>
      )}
    </div>
  );
}

