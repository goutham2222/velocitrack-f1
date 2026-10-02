"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReplayPayload,
  CameraMode,
  ViewportMode,
  SpeedUnit,
} from "@/types/telemetry";
import { fetchDemoReplay, fetchSessionReplay, checkServerBootId } from "@/services/api";
import { usePlayback } from "@/hooks/usePlayback";
import { ViewportContainer } from "@/components/viewport/ViewportContainer";
import { Leaderboard } from "@/components/hud/Leaderboard";
import { DriverFocusPanel } from "@/components/hud/DriverFocusPanel";
import { WeatherWidget } from "@/components/hud/WeatherWidget";
import { PlaybackControls } from "@/components/controls/PlaybackControls";
import { ViewModeSelector } from "@/components/controls/ViewModeSelector";
import { SessionPicker, ActiveSessionContext } from "@/components/controls/SessionPicker";
import {
  SlidersHorizontal,
  X,
  Tag,
  Gauge,
  Minus,
  Plus,
  Maximize,
  Minimize,
  RotateCw,
  Compass,
} from "lucide-react";

export default function ReplayDashboard() {
  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [hasCustomSession, setHasCustomSession] = useState<boolean>(false);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const wasPlayingRef = useRef<boolean>(false);

  // Viewport & HUD state
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [viewportMode, setViewportMode] = useState<ViewportMode>("3d");
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>("kmh");
  const [showDriverLabels, setShowDriverLabels] = useState<boolean>(true);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [rotate2DTrigger, setRotate2DTrigger] = useState<number>(0);
  const [resetRotation2DTrigger, setResetRotation2DTrigger] = useState<number>(0);
  const [rotationDeg2D, setRotationDeg2D] = useState<number>(0);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

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

  // Calculate current lap milestone directly from the race leader's synchronized telemetry
  const currentLap = useMemo(() => {
    if (playback.leaderboard && playback.leaderboard.length > 0) {
      return playback.leaderboard[0].lap;
    }
    return payload?.metadata.lap_start || 1;
  }, [playback.leaderboard, payload?.metadata.lap_start]);

  // Derived active session metadata for controlled session selector persistence
  const currentSession = useMemo<ActiveSessionContext | null>(() => {
    const currentYear = new Date().getFullYear();
    if (!payload?.metadata) {
      return {
        year: currentYear,
        eventName: "Monaco Grand Prix",
        sessionCode: "R",
        lapStart: 1,
        lapEnd: 3,
        totalLaps: 78,
      };
    }
    return {
      year: Math.min(payload.metadata.year || currentYear, currentYear),
      eventName: payload.metadata.event_name,
      sessionCode: payload.metadata.session_name === "Race" ? "R" : (payload.metadata.session_name || "R"),
      lapStart: payload.metadata.lap_start || 1,
      lapEnd: payload.metadata.lap_end || 3,
      totalLaps: payload.metadata.total_laps || 78,
    };
  }, [payload?.metadata]);

  // Load saved session or demo on initial mount for instant zero-wait startup
  useEffect(() => {
    setIsLoading(true);

    const currentBuildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
    let savedBuildId = "";
    try {
      savedBuildId = localStorage.getItem("velocitrack_build_id") || "";
    } catch {}

    // Check if client bundle build ID changed or was uninitialized (e.g. fresh Docker container build)
    const isNewBuild = savedBuildId !== currentBuildId;

    if (isNewBuild) {
      try {
        localStorage.removeItem("velocitrack_active_session");
      } catch {}
    }
    try {
      localStorage.setItem("velocitrack_build_id", currentBuildId);
    } catch {}

    // Also check server boot ID to detect container rebuild/restart on the backend
    checkServerBootId().then((serverBootId) => {
      let isNewBackendBoot = false;
      if (serverBootId) {
        try {
          const savedBootId = localStorage.getItem("velocitrack_backend_boot_id") || "";
          if (savedBootId && savedBootId !== serverBootId) {
            isNewBackendBoot = true;
            localStorage.removeItem("velocitrack_active_session");
          }
          localStorage.setItem("velocitrack_backend_boot_id", serverBootId);
        } catch {}
      }

      let saved: any = null;
      if (!isNewBuild && !isNewBackendBoot) {
        try {
          const raw = localStorage.getItem("velocitrack_active_session");
          if (raw) saved = JSON.parse(raw);
        } catch {}
      }

      const currentYear = new Date().getFullYear();
      if (saved && saved.year && saved.eventName) {
        setHasCustomSession(true);
        const sanitizedYear = Math.min(Number(saved.year), currentYear);
        fetchSessionReplay(
          sanitizedYear,
          saved.eventName,
          saved.sessionCode || "R",
          saved.lapStart || 1,
          saved.lapEnd || 3,
          10
        )
          .then((data) => {
            setPayload(data);
            setIsLoading(false);
          })
          .catch(() => {
            fetchDemoReplay(10, 2)
              .then((data) => {
                setPayload(data);
                setIsLoading(false);
              })
              .catch(() => setIsLoading(false));
          });
      } else {
        fetchDemoReplay(10, 2)
          .then((data) => {
            setPayload(data);
            setIsLoading(false);
          })
          .catch((err) => {
            console.error("Failed to load initial demo replay:", err);
            setIsLoading(false);
          });
      }
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    playback.setSelectedDriverCode(null);
    setCameraMode("orbit");
    setResetTrigger((prev) => prev + 1);
    setZoomPercent(100);
    setResetRotation2DTrigger((prev) => prev + 1);
  }, [playback]);

  // If the currently followed driver retires/DNFs, exit chase camera back to orbit view
  useEffect(() => {
    if (playback.selectedDriverCode && playback.focusedDriver) {
      if (playback.focusedDriver.is_dnf || playback.focusedDriver.is_active === false) {
        handleResetCamera();
      }
    }
  }, [playback.selectedDriverCode, playback.focusedDriver, handleResetCamera]);

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
    setPickerError(null);
    wasPlayingRef.current = playback.isPlaying;
    playback.pause();
    setIsPickerOpen(true);
  }, [playback]);

  const handleClosePicker = useCallback(() => {
    setPickerError(null);
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
    setPickerError(null);
    playback.setSelectedDriverCode(null);
    setCameraMode("orbit");
    setResetTrigger((prev) => prev + 1);
    setZoomPercent(100);
    setResetRotation2DTrigger((prev) => prev + 1);
    setHasCustomSession(false);

    setIsLoading(true);
    fetchDemoReplay(10, 2)
      .then((data) => {
        setPayload(data);
        playback.seekTo(0);
        playback.setSelectedDriverCode(null);
        setCameraMode("orbit");
        setResetTrigger((prev) => prev + 1);
        setPickerError(null);
        setIsLoading(false);
        try {
          localStorage.removeItem("velocitrack_active_session");
        } catch {}
        handleClosePicker();
      })
      .catch((err) => {
        console.error("Failed to reload demo:", err);
        setPickerError("Failed to reload demo replay. Please try again.");
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
      setPickerError(null);
      playback.setSelectedDriverCode(null);
      setCameraMode("orbit");
      setResetTrigger((prev) => prev + 1);
      setZoomPercent(100);
      setResetRotation2DTrigger((prev) => prev + 1);
      setHasCustomSession(true);

      setIsLoading(true);
      fetchSessionReplay(year, event, session, lapStart, lapEnd, 10)
        .then((data) => {
          setPayload(data);
          playback.seekTo(0);
          playback.setSelectedDriverCode(null);
          setCameraMode("orbit");
          setResetTrigger((prev) => prev + 1);
          setPickerError(null);
          setIsLoading(false);
          try {
            localStorage.setItem(
              "velocitrack_active_session",
              JSON.stringify({
                year,
                eventName: event,
                sessionCode: session,
                lapStart,
                lapEnd,
              })
            );
            localStorage.setItem(
              "velocitrack_build_id",
              process.env.NEXT_PUBLIC_BUILD_ID || "dev"
            );
          } catch {}
          handleClosePicker();
        })
        .catch((err) => {
          console.error("Failed to fetch session replay:", err);
          setPickerError(
            "Unable to load session telemetry. Please verify network connectivity or select another Grand Prix."
          );
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

        {/* Right: Viewport Toggles, Fullscreen & Reset Cluster */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          <ViewModeSelector
            viewportMode={viewportMode}
            cameraMode={cameraMode}
            isDriverFocused={Boolean(playback.selectedDriverCode || cameraMode === "chase")}
            onToggleViewportMode={setViewportMode}
            onToggleCameraMode={setCameraMode}
            onResetCamera={handleResetCamera}
          />

          {/* Broadcast Fullscreen Toggle Button */}
          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}
            className="flex items-center justify-center p-2 rounded-xl bg-titanium-900/80 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition shadow-lg flex-shrink-0 group"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4 text-slate-300 group-hover:text-white" />
            ) : (
              <Maximize className="w-4 h-4 text-slate-300 group-hover:text-white" />
            )}
          </button>
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
            rotate2DTrigger={rotate2DTrigger}
            resetRotation2DTrigger={resetRotation2DTrigger}
            onRotation2DChange={setRotationDeg2D}
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

        {/* Bottom-Right Floating Stack: Collapsible Weather Card + Compact Map-Control Pill */}
        {payload && (
          <div className="absolute bottom-5 right-4 z-30 pointer-events-auto hidden sm:flex flex-col gap-2 animate-in fade-in duration-200">
            <WeatherWidget
              weather={playback.currentWeather}
              trackStatus={playback.currentTrackStatus}
            />

            {/* Unified Map-Control Pill: Toggles (Labels, Speed Unit) + 2D Rotate/Compass + Zoom Slider */}
            <div className="w-64 backdrop-blur-md bg-black/60 border border-white/10 rounded-xl p-2.5 shadow-2xl flex flex-col gap-2 select-none font-mono text-xs group">
              {/* Row 1: Toggles (Labels & Speed Unit) + 2D Orientation Controls */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <button
                    onClick={() => setShowDriverLabels((prev) => !prev)}
                    title={showDriverLabels ? "Hide 3D/2D Driver Labels" : "Show 3D/2D Driver Labels"}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg font-bold text-[10px] transition border ${
                      showDriverLabels
                        ? "bg-white/15 text-white border-white/20 shadow-sm"
                        : "bg-black/30 text-slate-400 hover:text-slate-200 border-white/5"
                    }`}
                  >
                    <Tag className={`w-3 h-3 ${showDriverLabels ? "text-emerald-400" : "text-slate-500"}`} />
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
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-black/30 hover:bg-white/10 text-slate-200 hover:text-white border border-white/5 font-bold text-[10px] transition"
                  >
                    <Gauge className="w-3 h-3 text-amber-400" />
                    <span>{speedUnit === "kmh" ? "KMPH" : "MPH"}</span>
                  </button>
                </div>

                {/* 2D Compass & Rotate Controls Integrated into Pill */}
                {viewportMode === "2d" && (
                  <div className="flex items-center gap-1 bg-black/40 rounded-lg px-1.5 py-0.5 border border-white/10 flex-shrink-0">
                    <button
                      onClick={() => setRotate2DTrigger((prev) => prev + 1)}
                      title="Rotate 45° Clockwise"
                      className="p-0.5 hover:bg-white/15 text-slate-300 hover:text-white rounded transition"
                    >
                      <RotateCw className="w-3 h-3 text-sky-400" />
                    </button>
                    <button
                      onClick={() => setResetRotation2DTrigger((prev) => prev + 1)}
                      title={`Heading: ${rotationDeg2D}° • Click to Reset North (0°)`}
                      className="relative p-0.5 hover:bg-white/15 text-slate-300 hover:text-white rounded transition flex items-center justify-center"
                    >
                      <Compass
                        className="w-3.5 h-3.5 text-sky-400 transition-transform duration-75"
                        style={{ transform: `rotate(${-rotationDeg2D}deg)` }}
                      />
                      <span className="absolute -top-0.5 text-[7px] font-black text-rose-500 pointer-events-none">
                        N
                      </span>
                    </button>
                    <span className="text-[9px] text-sky-300 font-bold ml-0.5">{rotationDeg2D}°</span>
                  </div>
                )}
              </div>

              {/* Row 2: Zoom Slider with (-) and (+) and Zoom % Readout */}
              <div className="flex items-center gap-2 pt-1.5 border-t border-white/5">
                {/* Zoom Out Button (-) */}
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  className="w-5 h-5 rounded flex items-center justify-center bg-black/40 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition flex-shrink-0"
                >
                  <Minus className="w-3 h-3" />
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
                  className="w-5 h-5 rounded flex items-center justify-center bg-black/40 hover:bg-white/15 text-slate-300 hover:text-white border border-white/10 transition flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                </button>

                {/* Standard Zoom Numbers Readout */}
                <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono text-[9px] tracking-normal transition-all group-hover:bg-sky-500/20 group-hover:border-sky-400/40 group-hover:text-sky-300 min-w-[34px] text-center flex-shrink-0">
                  {Math.round(zoomPercent)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Floating Overlay: Playback Scrubber & Controls */}
        {payload && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl z-40 pointer-events-auto">
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
              currentSession={currentSession}
              onLoadSession={handleLoadSession}
              onLoadDemo={handleLoadDemo}
              isLoading={isLoading}
              errorMessage={pickerError}
              onClearError={() => setPickerError(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}

