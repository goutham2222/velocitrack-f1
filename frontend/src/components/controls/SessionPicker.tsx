"use client";

import React, { useState, useEffect } from "react";
import { EventInfo, SessionInfo } from "@/types/telemetry";
import {
  fetchAvailableYears,
  fetchEvents,
  fetchEventDetails,
} from "@/services/api";
import {
  Calendar,
  Flag,
  Layers,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

interface SessionPickerProps {
  onLoadSession: (
    year: number,
    event: string,
    session: string,
    lapStart: number,
    lapEnd: number
  ) => void;
  onLoadDemo: () => void;
  isLoading: boolean;
}

export function SessionPicker({
  onLoadSession,
  onLoadDemo,
  isLoading,
}: SessionPickerProps) {
  const [years, setYears] = useState<number[]>([2024, 2023, 2022, 2021]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("Monaco Grand Prix");

  const [sessions, setSessions] = useState<SessionInfo[]>([
    { name: "Race", code: "R", date: "2024-05-26" },
    { name: "Qualifying", code: "Q", date: "2024-05-25" },
    { name: "Practice 1", code: "FP1", date: "2024-05-24" },
  ]);
  const [selectedSession, setSelectedSession] = useState<string>("R");

  const [lapStart, setLapStart] = useState<number>(1);
  const [lapEnd, setLapEnd] = useState<number>(3);
  const [maxLaps, setMaxLaps] = useState<number>(78);

  // Fetch years on mount
  useEffect(() => {
    fetchAvailableYears().then((yrList) => {
      if (yrList.length > 0) {
        setYears(yrList);
      }
    });
  }, []);

  // Fetch events when year changes
  useEffect(() => {
    fetchEvents(selectedYear).then((evList) => {
      if (evList.length > 0) {
        setEvents(evList);
        // Default to Monaco or first event
        const monaco = evList.find((e) => e.event_name.includes("Monaco"));
        setSelectedEvent(monaco ? monaco.event_name : evList[0].event_name);
      }
    });
  }, [selectedYear]);

  // Fetch sessions when event changes
  useEffect(() => {
    if (!selectedEvent) return;
    fetchEventDetails(selectedYear, selectedEvent).then((details) => {
      if (details) {
        if (details.sessions && details.sessions.length > 0) {
          setSessions(details.sessions);
          const race = details.sessions.find((s) => s.code === "R");
          setSelectedSession(race ? "R" : details.sessions[0].code);
        }
        if (details.total_laps) {
          setMaxLaps(details.total_laps);
        }
      }
    });
  }, [selectedYear, selectedEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLoadSession(selectedYear, selectedEvent, selectedSession, lapStart, lapEnd);
  };

  return (
    <div className="glass-panel rounded-2xl p-4 border border-white/10 shadow-2xl flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-red-500" />
          <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
            SESSION SELECTOR
          </h2>
        </div>

        {/* Instant Demo Button */}
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-300 hover:text-white text-xs font-mono font-bold transition shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-red-400" />
          <span>Demo Monaco GP</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Season Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Season
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              disabled={isLoading}
              className="bg-titanium-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-red-500"
            >
              {years.map((yr) => (
                <option key={yr} value={yr} className="bg-titanium-950">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Grand Prix Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Grand Prix
            </label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              disabled={isLoading}
              className="bg-titanium-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-red-500 truncate"
            >
              {events.map((ev) => (
                <option key={ev.round_number} value={ev.event_name} className="bg-titanium-950">
                  {ev.event_name}
                </option>
              ))}
            </select>
          </div>

          {/* Session Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              disabled={isLoading}
              className="bg-titanium-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-red-500"
            >
              {sessions.map((s) => (
                <option key={s.code} value={s.code} className="bg-titanium-950">
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Lap Range Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Lap Range
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={lapEnd}
                value={lapStart}
                onChange={(e) => setLapStart(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isLoading}
                className="w-14 bg-titanium-900/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-center text-white focus:outline-none focus:border-red-500"
              />
              <span className="text-slate-500 text-xs font-mono">to</span>
              <input
                type="number"
                min={lapStart}
                max={maxLaps}
                value={lapEnd}
                onChange={(e) => setLapEnd(Math.max(lapStart, parseInt(e.target.value) || lapStart))}
                disabled={isLoading}
                className="w-14 bg-titanium-900/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-center text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-mono font-bold tracking-wider uppercase transition shadow-lg disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>ALIGNING MULTI-CAR TELEMETRY...</span>
            </>
          ) : (
            <span>LOAD RACE REPLAY</span>
          )}
        </button>
      </form>
    </div>
  );
}

