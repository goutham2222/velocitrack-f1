import React from "react";
import { ViewportMode, CameraMode } from "@/types/telemetry";
import { Box, Map, Eye, Target, CameraOff } from "lucide-react";

interface ViewModeSelectorProps {
  viewportMode: ViewportMode;
  cameraMode: CameraMode;
  isDriverFocused?: boolean;
  onToggleViewportMode: (mode: ViewportMode) => void;
  onToggleCameraMode: (mode: CameraMode) => void;
  onResetCamera?: () => void;
}

export function ViewModeSelector({
  viewportMode,
  cameraMode,
  isDriverFocused = false,
  onToggleViewportMode,
  onToggleCameraMode,
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
          <Box className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span className="hidden xl:inline">3D VIEW</span>
          <span className="xl:hidden inline text-[11px]">3D</span>
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
          <Map className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="hidden xl:inline">2D RADAR</span>
          <span className="xl:hidden inline text-[11px]">2D</span>
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
            <Eye className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
            <span className="inline text-[11px]">ORBIT</span>
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
            <Target className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="inline text-[11px]">CHASE</span>
          </button>
        </div>
      )}

      {/* Reset View / Exit Chase Cam button (when a driver is focused) */}
      {isDriverFocused && onResetCamera && (
        <button
          onClick={onResetCamera}
          title="Exit Driver Chase Cam (Esc)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/25 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-mono font-bold tracking-wider transition shadow-sm group animate-in fade-in duration-150 flex-shrink-0"
        >
          <CameraOff className="w-3.5 h-3.5 text-red-400 group-hover:text-white transition flex-shrink-0" />
          <span className="whitespace-nowrap text-[11px]">RESET VIEW</span>
          <kbd className="hidden 2xl:inline px-1 py-0.2 rounded bg-black/40 border border-white/10 text-[9px] text-slate-400 font-mono">
            ESC
          </kbd>
        </button>
      )}
    </div>
  );
}

