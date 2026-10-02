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
  AlertCircle,
} from "lucide-react";

export interface ActiveSessionContext {
  year: number;
  eventName: string;
  sessionCode?: string;
  lapStart?: number;
  lapEnd?: number;
  totalLaps?: number;
}

interface SessionPickerProps {
  currentSession?: ActiveSessionContext | null;
  onLoadSession: (
    year: number,
    event: string,
    session: string,
    lapStart: number,
    lapEnd: number
  ) => void;
  onLoadDemo: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

function findBestEventMatch(targetName: string, events: EventInfo[]): EventInfo | null {
  if (!targetName || events.length === 0) return null;
  const cleanTarget = targetName.toLowerCase().replace(/grand prix|\d{4}|formula 1|f1/g, "").trim();

  // 1. Exact match
  const exact = events.find((e) => e.event_name.toLowerCase() === targetName.toLowerCase());
  if (exact) return exact;

  // 2. Core keyword containment (e.g. "british", "silverstone", "monza", "belgian", "spa", "monaco", "bahrain")
  if (cleanTarget.length >= 3) {
    const contained = events.find((e) => {
      const eClean = e.event_name.toLowerCase().replace(/grand prix|\d{4}|formula 1|f1/g, "").trim();
      return (
        eClean.includes(cleanTarget) ||
        cleanTarget.includes(eClean) ||
        e.location.toLowerCase().includes(cleanTarget) ||
        e.country.toLowerCase().includes(cleanTarget)
      );
    });
    if (contained) return contained;
  }

  // 3. Substring match
  const sub = events.find((e) =>
    e.event_name.toLowerCase().includes(targetName.toLowerCase()) ||
    targetName.toLowerCase().includes(e.event_name.toLowerCase())
  );
  return sub || null;
}

export function SessionPicker({
  currentSession,
  onLoadSession,
  onLoadDemo,
  isLoading,
  errorMessage,
  onClearError,
}: SessionPickerProps) {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= 2018; y--) {
      list.push(y);
    }
    return list;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const y = currentSession?.year ?? currentYear;
    return Math.min(y, currentYear);
  });

  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>(
    currentSession?.eventName ?? "Monaco Grand Prix"
  );

  const [sessions, setSessions] = useState<SessionInfo[]>([
    { name: "Race", code: "R", date: `${currentYear}-05-26` },
    { name: "Qualifying", code: "Q", date: `${currentYear}-05-25` },
    { name: "Practice 1", code: "FP1", date: `${currentYear}-05-24` },
  ]);
  const [selectedSession, setSelectedSession] = useState<string>(
    currentSession?.sessionCode ?? "R"
  );

  const [lapStart, setLapStart] = useState<number>(currentSession?.lapStart ?? 1);
  const [lapEnd, setLapEnd] = useState<number>(currentSession?.lapEnd ?? 3);
  const [maxLaps, setMaxLaps] = useState<number>(currentSession?.totalLaps ?? 78);

  // Synchronize state when active currentSession updates
  useEffect(() => {
    if (currentSession) {
      if (currentSession.year) setSelectedYear(Math.min(currentSession.year, currentYear));
      if (currentSession.eventName) setSelectedEvent(currentSession.eventName);
      if (currentSession.sessionCode) setSelectedSession(currentSession.sessionCode);
      if (currentSession.lapStart) setLapStart(currentSession.lapStart);
      if (currentSession.lapEnd) setLapEnd(currentSession.lapEnd);
      if (currentSession.totalLaps) setMaxLaps(currentSession.totalLaps);
    }
  }, [currentSession, currentYear]);

  // Fetch years on mount
  useEffect(() => {
    fetchAvailableYears().then((yrList) => {
      if (yrList.length > 0) {
        setYears(yrList);
      }
    });
  }, []);

  // Fetch events when year changes - persists user's selected event across seasons
  useEffect(() => {
    fetchEvents(selectedYear).then((evList) => {
      if (evList.length > 0) {
        setEvents(evList);
        const targetName = selectedEvent || currentSession?.eventName || "Monaco Grand Prix";
        const matched = findBestEventMatch(targetName, evList);
        if (matched) {
          setSelectedEvent(matched.event_name);
        } else {
          const monaco = evList.find((e) => e.event_name.includes("Monaco"));
          setSelectedEvent(monaco ? monaco.event_name : evList[0].event_name);
        }
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
          const currentCode = currentSession?.sessionCode;
          const matchCode = details.sessions.find((s) => s.code === currentCode);
          if (matchCode) {
            setSelectedSession(matchCode.code);
          } else {
            const race = details.sessions.find((s) => s.code === "R");
            setSelectedSession(race ? "R" : details.sessions[0].code);
          }
        }
        if (details.total_laps) {
          setMaxLaps(details.total_laps);
        }
      }
    });
  }, [selectedYear, selectedEvent, currentSession]);

  const selectedEventObj = events.find((e) => e.event_name === selectedEvent);
  const isSelectedEventUpcoming = selectedEventObj?.is_completed === false;

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
              onChange={(e) => {
                onClearError?.();
                setSelectedYear(parseInt(e.target.value));
              }}
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
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Grand Prix
              </label>
              {isSelectedEventUpcoming && (
                <span className="text-[9px] font-mono font-bold text-amber-400 uppercase">
                  Upcoming
                </span>
              )}
            </div>
            <select
              value={selectedEvent}
              onChange={(e) => {
                onClearError?.();
                setSelectedEvent(e.target.value);
              }}
              disabled={isLoading}
              className="bg-titanium-900/80 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-red-500 truncate"
            >
              {events.map((ev) => {
                const isUpcoming = ev.is_completed === false;
                return (
                  <option
                    key={ev.round_number}
                    value={ev.event_name}
                    disabled={isUpcoming}
                    className={
                      isUpcoming
                        ? "text-slate-500 bg-titanium-950 italic"
                        : "bg-titanium-950"
                    }
                  >
                    {ev.event_name} {isUpcoming ? "(Upcoming)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Session Picker */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => {
                onClearError?.();
                setSelectedSession(e.target.value);
              }}
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
                onChange={(e) => {
                  onClearError?.();
                  setLapStart(Math.max(1, parseInt(e.target.value) || 1));
                }}
                disabled={isLoading}
                className="w-14 bg-titanium-900/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-center text-white focus:outline-none focus:border-red-500"
              />
              <span className="text-slate-500 text-xs font-mono">to</span>
              <input
                type="number"
                min={lapStart}
                max={maxLaps}
                value={lapEnd}
                onChange={(e) => {
                  onClearError?.();
                  setLapEnd(Math.max(lapStart, parseInt(e.target.value) || lapStart));
                }}
                disabled={isLoading}
                className="w-14 bg-titanium-900/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-center text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* Error Feedback Banner */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-mono animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="flex-1 leading-tight">{errorMessage}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-mono font-bold tracking-wider uppercase transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>ALIGNING MULTI-CAR TELEMETRY...</span>
            </>
          ) : isSelectedEventUpcoming ? (
            <span>LOAD RACE PREVIEW (SIMULATION)</span>
          ) : (
            <span>LOAD RACE REPLAY</span>
          )}
        </button>
      </form>
    </div>
  );
}

