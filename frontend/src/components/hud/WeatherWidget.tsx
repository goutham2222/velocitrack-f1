"use client";

import React, { useState } from "react";
import { WeatherSample } from "@/types/telemetry";
import { CloudRain, Wind, Thermometer, Flag, ChevronDown, ChevronUp } from "lucide-react";

interface WeatherWidgetProps {
  weather: WeatherSample;
}

export function WeatherWidget({ weather }: WeatherWidgetProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);

  const isYellow = weather.track_status === "2";
  const isSC = weather.track_status === "4";
  const isRed = weather.track_status === "5";
  const isVSC = weather.track_status === "6";

  let flagBg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  let flagText = weather.status_text || "TRACK CLEAR";
  let flagShortText = "CLEAR";

  if (isRed) {
    flagBg = "bg-red-600/30 text-red-300 border-red-500 animate-pulse";
    flagText = "RED FLAG";
    flagShortText = "RED";
  } else if (isSC) {
    flagBg = "bg-amber-500/30 text-amber-300 border-amber-500 animate-pulse";
    flagText = "SAFETY CAR (SC)";
    flagShortText = "SC";
  } else if (isVSC) {
    flagBg = "bg-amber-500/25 text-amber-300 border-amber-500";
    flagText = "VSC ACTIVE";
    flagShortText = "VSC";
  } else if (isYellow) {
    flagBg = "bg-yellow-500/25 text-yellow-300 border-yellow-500";
    flagText = "YELLOW FLAG";
    flagShortText = "YELLOW";
  }

  return (
    <div className="w-64 backdrop-blur-md bg-black/60 border border-white/10 rounded-xl p-2.5 text-xs shadow-2xl flex flex-col gap-2 select-none transition-all duration-200">
      {/* Race Control Flag Status & Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left group cursor-pointer focus:outline-none"
        title={isCollapsed ? "Expand Track Conditions" : "Collapse Track Conditions"}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-all ${flagBg}`}
          >
            <Flag className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{isCollapsed ? flagShortText : flagText}</span>
          </div>

          {/* Quick metric preview when collapsed */}
          {isCollapsed && (
            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-300 truncate">
              <span className="text-rose-400 font-bold">{Math.round(weather.track_temp)}°</span>
              <span className="text-slate-500">TRK</span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400 font-bold">{Math.round(weather.air_temp)}°</span>
              <span className="text-slate-500">AIR</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-slate-400 group-hover:text-white transition flex-shrink-0">
          {!isCollapsed && (
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">
              CONDITIONS
            </span>
          )}
          {isCollapsed ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform" />
          )}
        </div>
      </button>

      {/* Expanded Metrics Drawer */}
      {!isCollapsed && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 font-mono text-[11px] animate-in fade-in duration-150">
          {/* Track Temp */}
          <div className="flex items-center gap-2 text-slate-300" title="Track Temperature">
            <Thermometer className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">Track</span>
              <span className="font-bold text-white leading-tight">{weather.track_temp.toFixed(1)}°C</span>
            </div>
          </div>

          {/* Air Temp */}
          <div className="flex items-center gap-2 text-slate-300" title="Air Temperature">
            <Thermometer className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">Air</span>
              <span className="font-bold text-white leading-tight">{weather.air_temp.toFixed(1)}°C</span>
            </div>
          </div>

          {/* Humidity / Rain */}
          <div className="flex items-center gap-2 text-slate-300" title="Relative Humidity / Rain Risk">
            <CloudRain className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">Rain / Hum</span>
              <span className="font-bold text-white leading-tight">{Math.round(weather.humidity)}%</span>
            </div>
          </div>

          {/* Wind Speed & Direction */}
          <div className="flex items-center gap-2 text-slate-300" title="Wind Speed and Direction">
            <Wind className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase leading-none">Wind</span>
              <span className="font-bold text-white leading-tight">{weather.wind_speed.toFixed(1)} km/h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
