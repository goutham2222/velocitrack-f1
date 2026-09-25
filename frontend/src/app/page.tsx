"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReplayPayload,
  CameraMode,
  ViewportMode,
  SpeedUnit,
} from "@/types/telemetry";
import { fetchDemoReplay, fetchSessionReplay } from "@/services/api";
import { usePlayback } from "@/hooks/usePlayback";
import { ViewportContainer } from "@/components/viewport/ViewportContainer";
import { Leaderboard } from "@/components/hud/Leaderboard";
import { DriverFocusPanel } from "@/components/hud/DriverFocusPanel";
import { WeatherWidget } from "@/components/hud/WeatherWidget";
import { PlaybackControls } from "@/components/controls/PlaybackControls";
import { ViewModeSelector } from "@/components/controls/ViewModeSelector";
import { SessionPicker } from "@/components/controls/SessionPicker";
import {
  Activity,
  Layers,
  Sparkles,
  SlidersHorizontal,
  X,
  Radio,
} from "lucide-react";

export default function ReplayDashboard() {
  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const wasPlayingRef = useRef<boolean>(false);

  // Viewport & HUD state
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [viewportMode, setViewportMode] = useState<ViewportMode>("3d");
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>("kmh");
  const [showDriverLabels, setShowDriverLabels] = useState<boolean>(true);

  // Playback engine (defaults to global orbit view)
  const playback = usePlayback({
    payload,
    initialDriver: null,
  });

  // Calculate current lap milestone dynamically from playback progress
  const currentLap = useMemo(() => {
    if (!payload) return 1;
    const { lap_start, lap_end, total_laps } = payload.metadata;
    const progress =
      playback.duration > 0 ? playback.currentTime / playback.duration : 0;
    const calculated =
      lap_start + Math.floor(progress * Math.max(1, lap_end - lap_start + 1));
    return Math.min(total_laps, Math.max(lap_start, calculated));
  }, [payload, playback.currentTime, playback.duration]);

  // Load demo on initial mount for instant zero-wait startup
  useEffect(() => {
    setIsLoading(true);
    fetchDemoReplay(10, 2)
      .then((data) => {
        setPayload(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load initial demo replay:", err);
        setIsLoading(false);
      });
  }, []);

  const handleResetCamera = useCallback(() => {
    playback.setSelectedDriverCode(null);
    setCameraMode("orbit");
    setResetTrigger((prev) => prev + 1);
  }, [playback]);

  const handleSelectDriver = useCallback(
    (code: string) => {
      if (!code || code === playback.selectedDriverCode) {
        handleResetCamera();
        return;
      }
      playback.setSelectedDriverCode(code);
      if (viewportMode === "3d") {
        setCameraMode("chase");
      }
    },
    [playback, viewportMode, handleResetCamera]
  );

  const handleOpenPicker = useCallback(() => {
    wasPlayingRef.current = playback.isPlaying;
    playback.pause();
    setIsPickerOpen(true);
  }, [playback]);

  const handleClosePicker = useCallback(() => {
    setIsPickerOpen(false);
    if (wasPlayingRef.current) {
      playback.play();
    }
  }, [playback]);

  // Global Escape key listener: closes modal if open, otherwise exits driver chase view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isPickerOpen) {
          handleClosePicker();
        } else if (playback.selectedDriverCode || cameraMode === "chase") {
          handleResetCamera();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPickerOpen,
    playback.selectedDriverCode,
    cameraMode,
    handleClosePicker,
    handleResetCamera,
  ]);

  const handleLoadDemo = useCallback(() => {
    setIsLoading(true);
    fetchDemoReplay(10, 2)
      .then((data) => {
        setPayload(data);
        playback.seekTo(0);
        setIsLoading(false);
        handleClosePicker();
      })
      .catch((err) => {
        console.error("Failed to reload demo:", err);
        setIsLoading(false);
      });
  }, [playback, handleClosePicker]);

  const handleLoadSession = useCallback(
    (
      year: number,
      event: string,
      session: string,
      lapStart: number,
      lapEnd: number
    ) => {
      setIsLoading(true);
      fetchSessionReplay(year, event, session, lapStart, lapEnd, 10)
        .then((data) => {
          setPayload(data);
          playback.seekTo(0);
          setIsLoading(false);
          handleClosePicker();
        })
        .catch((err) => {
          console.error("Failed to fetch session replay:", err);
          setIsLoading(false);
        });
    },
    [playback, handleClosePicker]
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-titanium-950 flex flex-col">
      {/* ------------------------------------------------------------------------- */}
      {/* Top Broadcast Navigation Bar */}
      {/* ------------------------------------------------------------------------- */}
      <header className="relative z-30 w-full h-14 bg-titanium-950/80 backdrop-blur-md border-b border-white/10 px-4 flex items-center justify-between">
        {/* Left: Branding & Status Indicator */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center font-mono font-black text-white text-sm shadow-neon-red">
              V
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-black tracking-widest text-white uppercase">
                  VELOCITRACK
                </span>
                <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded bg-red-600 text-white">
                  F1
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-400 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>LIVE TELEMETRY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Active Session Selector Pill (Horizontally Centered) */}
        {payload && (
          <div className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-titanium-900/90 border border-white/10 shadow-lg backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span className="font-mono text-xs font-bold text-slate-100 tracking-wide">
                {payload.metadata.year} {payload.metadata.event_name}
              </span>
              <span className="text-slate-500 font-mono text-xs">&bull;</span>
              <span className="font-mono text-xs text-red-400 font-semibold whitespace-nowrap">
                Lap {currentLap} / {payload.metadata.total_laps}
              </span>
              <button
                onClick={handleOpenPicker}
                className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[11px] font-mono font-bold tracking-wider transition shadow-sm"
                title="Change Grand Prix Session"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>CHANGE SESSION</span>
              </button>
            </div>
          </div>
        )}

        {/* Right: Viewport Toggles, Labels, Units & Reset Cluster */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ViewModeSelector
            viewportMode={viewportMode}
            cameraMode={cameraMode}
            speedUnit={speedUnit}
            showDriverLabels={showDriverLabels}
            isDriverFocused={Boolean(playback.selectedDriverCode || cameraMode === "chase")}
            onToggleViewportMode={setViewportMode}
            onToggleCameraMode={setCameraMode}
            onToggleSpeedUnit={() =>
              setSpeedUnit((prev) => (prev === "kmh" ? "mph" : "kmh"))
            }
            onToggleDriverLabels={() => setShowDriverLabels((prev) => !prev)}
            onResetCamera={handleResetCamera}
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------------- */}
      {/* Central Viewport & Overlays */}
      {/* ------------------------------------------------------------------------- */}
      <div className="relative flex-1 w-full h-[calc(100vh-56px)] overflow-hidden">
        {payload ? (
          <ViewportContainer
            circuit={payload.circuit}
            drivers={playback.interpolatedDrivers}
            focusedDriver={playback.focusedDriver}
            cameraMode={cameraMode}
            viewportMode={viewportMode}
            onSelectDriver={handleSelectDriver}
            onDeselectDriver={handleResetCamera}
            onToggleViewportMode={setViewportMode}
            resetTrigger={resetTrigger}
            isInteractionDisabled={isPickerOpen}
            showDriverLabels={showDriverLabels}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center flex-col gap-3 text-slate-400 font-mono text-sm">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <span>INITIALIZING HIGH-PRECISION F1 TELEMETRY...</span>
          </div>
        )}

        {/* Left Floating Overlay: Live Leaderboard */}
        {payload && (
          <div className="absolute top-4 left-4 z-20 pointer-events-auto">
            <Leaderboard
              entries={playback.leaderboard}
              selectedDriverCode={playback.selectedDriverCode}
              onSelectDriver={handleSelectDriver}
            />
          </div>
        )}

        {/* Right Floating Overlay: Driver Cockpit HUD */}
        {payload && playback.focusedDriver && (
          <div className="absolute top-4 right-4 z-20 pointer-events-auto hidden md:block">
            <DriverFocusPanel
              driver={playback.focusedDriver}
              speedUnit={speedUnit}
              onToggleUnit={() =>
                setSpeedUnit((prev) => (prev === "kmh" ? "mph" : "kmh"))
              }
              onClose={handleResetCamera}
            />
          </div>
        )}

        {/* Bottom-Right Floating Overlay: Weather & Race Conditions */}
        {payload && (
          <div className="absolute bottom-24 right-4 z-20 pointer-events-auto hidden sm:block animate-in fade-in duration-200">
            <WeatherWidget weather={playback.currentWeather} />
          </div>
        )}

        {/* Bottom Floating Overlay: Playback Scrubber & Controls */}
        {payload && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-20 pointer-events-auto">
            <PlaybackControls
              currentTime={playback.currentTime}
              duration={playback.duration}
              isPlaying={playback.isPlaying}
              playbackSpeed={playback.playbackSpeed}
              totalLaps={payload.metadata.total_laps}
              onTogglePlay={playback.togglePlay}
              onSeek={playback.seekTo}
              onStepForward={playback.stepForward}
              onStepBackward={playback.stepBackward}
              onChangeSpeed={playback.setPlaybackSpeed}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------------- */}
      {/* Session Selector Modal / Drawer */}
      {/* ------------------------------------------------------------------------- */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Dedicated Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={handleClosePicker}
          />
          <div className="relative w-full max-w-2xl z-10 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={handleClosePicker}
              className="absolute -top-3 -right-3 z-10 p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white border border-white/20 shadow-xl transition"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
            <SessionPicker
              onLoadSession={handleLoadSession}
              onLoadDemo={handleLoadDemo}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}
    </main>
  );
}

