"use client";

import React from "react";
import { InterpolatedDriverState, SpeedUnit } from "@/types/telemetry";
import { Zap, Gauge, Flame, ShieldAlert, X } from "lucide-react";

interface DriverFocusPanelProps {
  driver: InterpolatedDriverState | null;
  speedUnit: SpeedUnit;
  onToggleUnit: () => void;
  onClose?: () => void;
}

export function DriverFocusPanel({
  driver,
  speedUnit,
  onToggleUnit,
  onClose,
}: DriverFocusPanelProps) {
  if (!driver) return null;

  // Convert speed if mph requested
  const displaySpeed =
    speedUnit === "mph" ? Math.round(driver.speed * 0.621371) : Math.round(driver.speed);

  // RPM percentage for tachometer (10,000 to 13,000 RPM)
  const rpmPct = Math.max(0, Math.min(1, (driver.rpm - 10000) / 2800));
  const activeLeds = Math.round(rpmPct * 15);

  // DRS state
  const isDrsActive = driver.drs >= 10;
  const isDrsAvailable = driver.drs === 1;

  return (
    <div className="w-84 glass-panel rounded-xl p-3 border border-white/10 shadow-2xl flex flex-col gap-2.5 select-none">
      {/* Driver Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-6 rounded-full"
            style={{ backgroundColor: driver.teamColor }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm font-black text-white tracking-wider">
                {driver.name}
              </span>
              <span className="font-mono text-xs font-bold text-slate-400">
                #{driver.number}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono tracking-wide truncate max-w-[160px]">
              {driver.team}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* DRS Status Pill */}
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-all ${
              isDrsActive
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500 shadow-neon"
                : isDrsAvailable
                ? "bg-amber-500/20 text-amber-300 border-amber-500"
                : "bg-slate-800/40 text-slate-500 border-slate-700"
            }`}
          >
            {isDrsActive ? "DRS OPEN" : isDrsAvailable ? "DRS AVAIL" : "DRS OFF"}
          </div>

          {/* Close / Deselect Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white border border-white/10 transition shadow-sm"
              title="Exit Driver View (Esc)"
              aria-label="Exit Driver View"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* LED Rev Limiter Bar (15 LEDs) */}
      <div className="flex items-center gap-1 py-0.5 px-1 bg-black/40 rounded border border-white/5">
        {Array.from({ length: 15 }).map((_, idx) => {
          const isActive = idx < activeLeds;
          let activeColor = "#10B981"; // Green (1-5)
          if (idx >= 5 && idx < 10) activeColor = "#EF4444"; // Red (6-10)
          if (idx >= 10) activeColor = "#A855F7"; // Purple/Flash (11-15)

          return (
            <div
              key={idx}
              className="flex-1 h-2 rounded-[1px] transition-colors duration-75"
              style={{
                backgroundColor: isActive ? activeColor : "rgba(255,255,255,0.06)",
                boxShadow: isActive ? `0 0 6px ${activeColor}` : "none",
              }}
            />
          );
        })}
      </div>

      {/* Core Telemetry: Speed & Gear Display */}
      <div className="grid grid-cols-2 gap-2 bg-titanium-900/60 rounded-lg p-2 border border-white/5 items-center">
        {/* Speedometer */}
        <div className="flex flex-col items-center justify-center border-r border-white/10 pr-2">
          <div className="text-3xl font-mono font-black text-white tracking-tight">
            {displaySpeed}
          </div>
          <button
            onClick={onToggleUnit}
            title="Click to toggle km/h and mph"
            className="text-[10px] font-mono font-bold text-slate-400 hover:text-white uppercase tracking-widest transition"
          >
            {speedUnit.toUpperCase()}
          </button>
        </div>

        {/* Gear Indicator */}
        <div className="flex flex-col items-center justify-center pl-2">
          <div className="text-3xl font-mono font-black text-amber-400">
            {driver.gear === 0 ? "N" : driver.gear}
          </div>
          <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
            GEAR
          </div>
        </div>
      </div>

      {/* RPM & Lap Details */}
      <div className="flex items-center justify-between text-[11px] font-mono px-1">
        <span className="text-slate-400">
          RPM:{" "}
          <strong className="text-slate-200">
            {driver.rpm.toLocaleString()}
          </strong>
        </span>
        <span className="text-slate-400">
          TYRE:{" "}
          <strong className="text-slate-200">
            {driver.compound} (L{driver.tyreLife})
          </strong>
        </span>
      </div>

      {/* Throttle & Brake Trace Bars */}
      <div className="flex flex-col gap-1.5 pt-1">
        {/* Throttle (Green) */}
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] font-mono font-bold text-emerald-400 text-right">
            THR {Math.round(driver.throttle)}%
          </span>
          <div className="flex-1 h-2 rounded bg-black/50 border border-white/5 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded transition-all duration-75 shadow-[0_0_8px_#10B981]"
              style={{ width: `${Math.min(100, Math.max(0, driver.throttle))}%` }}
            />
          </div>
        </div>

        {/* Brake (Red) */}
        <div className="flex items-center gap-2">
          <span className="w-12 text-[10px] font-mono font-bold text-rose-400 text-right">
            BRK {Math.round(driver.brake)}%
          </span>
          <div className="flex-1 h-2 rounded bg-black/50 border border-white/5 overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded transition-all duration-75 shadow-[0_0_8px_#F43F5E]"
              style={{ width: `${Math.min(100, Math.max(0, driver.brake))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

