"use client";

import React from "react";
import { WeatherSample } from "@/types/telemetry";
import { CloudRain, Wind, Thermometer, Flag } from "lucide-react";

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
    flagText = "RED FLAG";
  } else if (isSC) {
    flagBg = "bg-amber-500/30 text-amber-300 border-amber-500 animate-pulse";
    flagText = "SAFETY CAR (SC)";
  } else if (isVSC) {
    flagBg = "bg-amber-500/25 text-amber-300 border-amber-500";
    flagText = "VSC ACTIVE";
  } else if (isYellow) {
    flagBg = "bg-yellow-500/25 text-yellow-300 border-yellow-500";
    flagText = "YELLOW FLAG";
  }

  return (
    <div className="w-64 backdrop-blur-md bg-black/60 border border-white/10 rounded-lg p-3 text-xs shadow-2xl flex flex-col gap-2 select-none">
      {/* Race Control Flag Status Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">
          CONDITIONS
        </span>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border transition-all ${flagBg}`}
        >
          <Flag className="w-3 h-3" />
          <span>{flagText}</span>
        </div>
      </div>

      {/* Weather Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 font-mono text-[11px]">
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
    </div>
  );
}

