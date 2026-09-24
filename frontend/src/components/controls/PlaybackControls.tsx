"use client";

import React from "react";
import { PlaybackSpeed } from "@/types/telemetry";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Rewind,
  Gauge,
  Sliders,
} from "lucide-react";

interface PlaybackControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  totalLaps?: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStepForward: (seconds?: number) => void;
  onStepBackward: (seconds?: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 2, 4, 8, 16];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${ms.toString().padStart(3, "0").slice(0, 2)}`;
}

export function PlaybackControls({
  currentTime,
  duration,
  isPlaying,
  playbackSpeed,
  totalLaps = 2,
  onTogglePlay,
  onSeek,
  onStepForward,
  onStepBackward,
  onChangeSpeed,
}: PlaybackControlsProps) {
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full glass-panel rounded-2xl px-5 py-3 border border-white/10 shadow-2xl flex flex-col gap-2.5 select-none">
      {/* Timeline Scrubber */}
      <div className="relative flex items-center group py-1">
        {/* Scrubber input */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
        />

        {/* Progress Fill Underlay */}
        <div
          className="absolute left-0 h-1.5 bg-gradient-to-r from-red-600 to-red-500 rounded-l-lg pointer-events-none"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Control Buttons & Speed Multipliers */}
      <div className="flex items-center justify-between">
        {/* Left: Timecode Display */}
        <div className="flex items-center gap-2">
          <div className="font-mono text-sm font-black text-white tracking-widest bg-black/40 px-3 py-1 rounded-md border border-white/5">
            {formatTime(currentTime)}
          </div>
          <span className="text-slate-500 font-mono text-xs">/</span>
          <div className="font-mono text-xs text-slate-400">
            {formatTime(duration)}
          </div>
        </div>

        {/* Center: Play, Pause, Jump Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSeek(0)}
            title="Rewind to start"
            className="p-2 rounded-lg glass-btn text-slate-300 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => onStepBackward(10)}
            title="Jump -10 seconds"
            className="p-2 rounded-lg glass-btn text-slate-300 hover:text-white"
          >
            <Rewind className="w-4 h-4" />
          </button>

          <button
            onClick={onTogglePlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            className="p-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-neon-red transition-all transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => onStepForward(10)}
            title="Jump +10 seconds"
            className="p-2 rounded-lg glass-btn text-slate-300 hover:text-white"
          >
            <FastForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Speed Multipliers */}
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-white/5">
          {SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              onClick={() => onChangeSpeed(speed)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                playbackSpeed === speed
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

