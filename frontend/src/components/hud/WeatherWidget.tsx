"use client";

import React from "react";
import { WeatherSample } from "@/types/telemetry";
import { CloudRain, Wind, Thermometer, Flag, AlertTriangle } from "lucide-react";

interface WeatherWidgetProps {
  weather: WeatherSample;
}

export function WeatherWidget({ weather }: WeatherWidgetProps) {
  const isYellow = weather.track_status === "2";
  const isSC = weather.track_status === "4";
  const isRed = weather.track_status === "5";
  const isVSC = weather.track_status === "6";

  let flagBg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  let flagText = weather.status_text || "TRACK CLEAR";

  if (isRed) {
    flagBg = "bg-red-600/30 text-red-300 border-red-500 animate-pulse";
    flagText = "RED FLAG - SESSION STOPPED";
  } else if (isSC) {
    flagBg = "bg-amber-500/30 text-amber-300 border-amber-500 animate-pulse";
    flagText = "SAFETY CAR (SC)";
  } else if (isVSC) {
    flagBg = "bg-amber-500/25 text-amber-300 border-amber-500";
    flagText = "VIRTUAL SAFETY CAR (VSC)";
  } else if (isYellow) {
    flagBg = "bg-yellow-500/25 text-yellow-300 border-yellow-500";
    flagText = "YELLOW FLAG";
  }

  return (
    <div className="flex items-center gap-3 glass-panel rounded-xl px-3 py-1.5 border border-white/10 shadow-xl select-none">
      {/* Race Control Flag Pill */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold tracking-wider uppercase border ${flagBg}`}
      >
        <Flag className="w-3.5 h-3.5" />
        <span>{flagText}</span>
      </div>

      {/* Weather Stats Bar */}
      <div className="flex items-center gap-4 text-xs font-mono divide-x divide-white/10 pl-1">
        {/* Track Temp */}
        <div className="flex items-center gap-1 text-slate-300" title="Track Temperature">
          <Thermometer className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-slate-400">TRK:</span>
          <span className="font-bold text-white">{weather.track_temp.toFixed(1)}°C</span>
        </div>

        {/* Air Temp */}
        <div className="flex items-center gap-1 text-slate-300 pl-3" title="Air Temperature">
          <span className="text-slate-400">AIR:</span>
          <span className="font-bold text-white">{weather.air_temp.toFixed(1)}°C</span>
        </div>

        {/* Humidity */}
        <div className="flex items-center gap-1 text-slate-300 pl-3" title="Relative Humidity">
          <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-white">{Math.round(weather.humidity)}%</span>
        </div>

        {/* Wind Speed */}
        <div className="flex items-center gap-1 text-slate-300 pl-3" title="Wind Speed and Direction">
          <Wind className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-white">{weather.wind_speed.toFixed(1)} km/h</span>
        </div>
      </div>
    </div>
  );
}

