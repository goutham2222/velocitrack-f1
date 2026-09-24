"use client";

import React, { useState } from "react";
import { LeaderboardEntry } from "@/types/telemetry";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  selectedDriverCode: string;
  onSelectDriver: (code: string) => void;
}

const COMPOUND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SOFT: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/50" },
  MEDIUM: { bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/50" },
  HARD: { bg: "bg-white/20", text: "text-white", border: "border-white/50" },
  INTERMEDIATE: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/50" },
  WET: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/50" },
};

export function Leaderboard({
  entries,
  selectedDriverCode,
  onSelectDriver,
}: LeaderboardProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  return (
    <div className="w-80 flex flex-col glass-panel rounded-xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-titanium-900/90 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            LIVE RUNNING ORDER
          </span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white transition p-1"
          title={collapsed ? "Expand Leaderboard" : "Collapse Leaderboard"}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-white/5">
          {entries.map((entry) => {
            const isSelected = entry.code === selectedDriverCode;
            const compoundStyle =
              COMPOUND_COLORS[entry.compound.toUpperCase()] || COMPOUND_COLORS.MEDIUM;

            return (
              <div
                key={entry.code}
                onClick={() => onSelectDriver(entry.code)}
                className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors duration-100 ${
                  isSelected
                    ? "bg-white/10 border-l-4 border-l-white"
                    : "hover:bg-white/5 border-l-4 border-l-transparent"
                }`}
              >
                {/* Left: Position & Driver Info */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-right font-mono text-[11px] font-bold text-slate-400">
                    {entry.position}
                  </span>
                  <div
                    className="w-1 h-4 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entry.teamColor }}
                  />
                  <span className="font-mono text-xs font-bold text-slate-100 tracking-wide">
                    {entry.code}
                  </span>
                  {entry.inPit && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-mono uppercase font-bold border border-amber-500/40">
                      PIT
                    </span>
                  )}
                  {entry.drsThreat && entry.position > 1 && !entry.inPit && (
                    <span
                      title="DRS threat within 1.0s"
                      className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-mono font-bold border border-emerald-500/40 animate-pulse"
                    >
                      DRS
                    </span>
                  )}
                </div>

                {/* Right: Gap & Compound */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-[11px] font-medium text-slate-300 w-16 text-right">
                    {entry.position === 1 ? "LEADER" : entry.gapToLeader}
                  </span>

                  {/* Compound badge */}
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-mono font-bold ${compoundStyle.bg} ${compoundStyle.text} ${compoundStyle.border}`}
                    title={`${entry.compound} tyre, ${entry.tyreLife} laps old`}
                  >
                    {entry.compound.charAt(0).toUpperCase()}
                  </div>

                  {/* Tyre life */}
                  <span className="text-[10px] font-mono text-slate-500 w-6 text-right">
                    L{entry.tyreLife}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

