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
  SlidersHorizontal,
  X,
  Tag,
  Gauge,
  Minus,
  Plus,
  ZoomIn,
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
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  const handleZoomIn = useCallback(() => {
    setZoomPercent((prev) => Math.min(300, prev + 15));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomPercent((prev) => Math.max(30, prev - 15));
  }, []);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoomPercent(Math.min(300, Math.max(30, newZoom)));
  }, []);

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
    setZoomPercent(100);
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
      <header className="relative z-30 w-full h-14 bg-titanium-950/80 backdrop-blur-md border-b border-white/10 px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Left: Branding & Status Indicator */}
        <div className="flex items-center justify-start min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center font-mono font-black text-white text-sm shadow-neon-red flex-shrink-0">
              V
            </div>
            <div className="min-w-0 hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-black tracking-widest text-white uppercase whitespace-nowrap">
                  VELOCITRACK
                </span>
                <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded bg-red-600 text-white">
                  F1
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-400 tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>LIVE TELEMETRY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Active Session Selector Pill (Strictly Centered, Zero Collision) */}
        <div className="flex items-center justify-center min-w-0 px-1">
          {payload && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-titanium-900/90 border border-white/10 shadow-lg backdrop-blur-md max-w-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <span className="font-mono text-xs font-bold text-slate-100 tracking-wide truncate max-w-[140px] md:max-w-[200px] lg:max-w-xs">
                {payload.metadata.year} {payload.metadata.event_name}
              </span>
              <span className="text-slate-500 font-mono text-xs">&bull;</span>
              <span className="font-mono text-xs text-red-400 font-semibold whitespace-nowrap">
                Lap {currentLap} / {payload.metadata.total_laps}
              </span>
              <button
                onClick={handleOpenPicker}
                className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[11px] font-mono font-bold tracking-wider transition shadow-sm whitespace-nowrap flex-shrink-0"
                title="Change Grand Prix Session"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span className="hidden md:inline">CHANGE SESSION</span>
                <span className="md:hidden">CHANGE</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Viewport Toggles & Reset Cluster */}
        <div className="flex items-center justify-end min-w-0">
          <ViewModeSelector
            viewportMode={viewportMode}
            cameraMode={cameraMode}
            isDriverFocused={Boolean(playback.selectedDriverCode || cameraMode === "chase")}
            onToggleViewportMode={setViewportMode}
            onToggleCameraMode={setCameraMode}
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
            zoomPercent={zoomPercent}
            onZoomChange={handleZoomChange}
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

        {/* Bottom-Right Floating Stack: Weather Card + Action Strip + Zoom Bar */}
        {payload && (
          <div className="absolute bottom-24 right-4 z-20 pointer-events-auto hidden sm:flex flex-col gap-2 animate-in fade-in duration-200">
            <WeatherWidget weather={playback.currentWeather} />

            {/* Docked Action Strip: Driver Labels & Speed Unit */}
            <div className="w-64 backdrop-blur-md bg-black/60 border border-white/10 rounded-lg p-1.5 shadow-2xl flex items-center justify-between gap-1.5 select-none font-mono text-xs">
              <button
                onClick={() => setShowDriverLabels((prev) => !prev)}
                title={showDriverLabels ? "Hide 3D/2D Driver Labels" : "Show 3D/2D Driver Labels"}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-bold text-[11px] transition border ${
                  showDriverLabels
                    ? "bg-white/15 text-white border-white/20 shadow-sm"
                    : "bg-black/30 text-slate-400 hover:text-slate-200 border-white/5"
                }`}
              >
                <Tag className={`w-3.5 h-3.5 ${showDriverLabels ? "text-emerald-400" : "text-slate-500"}`} />
                <span>LABELS</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    showDriverLabels ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600"
                  }`}
                />
              </button>

              <button
                onClick={() => setSpeedUnit((prev) => (prev === "kmh" ? "mph" : "kmh"))}
                title="Toggle speed between KMPH and MPH"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-black/30 hover:bg-white/10 text-slate-200 hover:text-white border border-white/5 font-bold text-[11px] transition"
              >
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>{speedUnit === "kmh" ? "KMPH" : "MPH"}</span>
              </button>
            </div>

            {/* Docked Zoom Bar Card */}
            <div className="w-64 backdrop-blur-md bg-black/60 border border-white/10 rounded-lg p-2 shadow-2xl flex flex-col gap-1.5 select-none font-mono text-xs group">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <ZoomIn className="w-3 h-3 text-sky-400" />
                  <span>ZOOM</span>
                </span>
                {/* Standard Zoom Numbers shown clearly on the bar */}
                <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono text-[10px] tracking-normal transition-all group-hover:bg-sky-500/20 group-hover:border-sky-400/40 group-hover:text-sky-300">
                  {Math.round(zoomPercent)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Out Button (-) */}
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  className="w-6 h-6 rounded flex items-center justify-center bg-black/40 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition flex-shrink-0"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                {/* Interactive Zoom Slider */}
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min={30}
                    max={300}
                    step={5}
                    value={zoomPercent}
                    onChange={(e) => handleZoomChange(Number(e.target.value))}
                    title={`Current Zoom: ${Math.round(zoomPercent)}%`}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none transition-colors"
                  />
                </div>

                {/* Zoom In Button (+) */}
                <button
                  onClick={handleZoomIn}
                  title="Zoom In (+)"
                  className="w-6 h-6 rounded flex items-center justify-center bg-black/40 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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

