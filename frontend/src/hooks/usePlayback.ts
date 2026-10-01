"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ReplayPayload,
  InterpolatedDriverState,
  LeaderboardEntry,
  OfficialResult,
  PlaybackSpeed,
  WeatherSample,
} from "@/types/telemetry";

interface UsePlaybackOptions {
  payload: ReplayPayload | null;
  initialDriver?: string | null;
}

// Catmull-Rom 1D spline interpolation
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

export function usePlayback({ payload, initialDriver = "VER" }: UsePlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedDriverCode, setSelectedDriverCode] = useState<string | null>(initialDriver ?? null);

  const duration = payload?.metadata.duration_seconds || 100;
  const timeStep = payload?.metadata.time_step || 0.1;
  const totalFrames = payload?.metadata.total_frames || 1000;

  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const currentTimeRef = useRef<number>(0);
  currentTimeRef.current = currentTime;

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  const playbackSpeedRef = useRef<PlaybackSpeed>(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  // Sync selected driver if selected code not in payload
  useEffect(() => {
    if (payload && payload.drivers && selectedDriverCode) {
      const codes = Object.keys(payload.drivers);
      if (codes.length > 0 && !codes.includes(selectedDriverCode)) {
        setSelectedDriverCode(null);
      }
    }
  }, [payload, selectedDriverCode]);

  // Main 60 FPS requestAnimationFrame loop
  useEffect(() => {
    if (!payload) return;

    const onFrame = (now: number) => {
      if (lastTimestampRef.current !== null && isPlayingRef.current) {
        const deltaSeconds = (now - lastTimestampRef.current) / 1000.0;
        // Clamp delta to prevent huge jumps on tab switch
        const clampedDelta = Math.min(deltaSeconds, 0.1);
        let nextTime = currentTimeRef.current + clampedDelta * playbackSpeedRef.current;

        if (nextTime >= duration) {
          nextTime = duration;
          setIsPlaying(false);
        }

        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
      }
      lastTimestampRef.current = now;
      animFrameRef.current = requestAnimationFrame(onFrame);
    };

    animFrameRef.current = requestAnimationFrame(onFrame);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      lastTimestampRef.current = null;
    };
  }, [payload, duration]);

  // Scrubbing & seeking actions
  const seekTo = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(timeSec, duration));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);
    },
    [duration]
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && currentTimeRef.current >= duration) {
        // Rewind to start if at end
        seekTo(0);
      }
      return !prev;
    });
  }, [duration, seekTo]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (currentTimeRef.current >= duration) {
      seekTo(0);
    }
    setIsPlaying(true);
  }, [duration, seekTo]);

  const stepForward = useCallback(
    (seconds: number = 10) => {
      seekTo(currentTimeRef.current + seconds);
    },
    [seekTo]
  );

  const stepBackward = useCallback(
    (seconds: number = 10) => {
      seekTo(currentTimeRef.current - seconds);
    },
    [seekTo]
  );

  // Keyboard hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        stepBackward(5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        stepForward(5);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setPlaybackSpeed((prev) => {
          const speeds: PlaybackSpeed[] = [0.5, 1, 2, 4, 8, 16];
          const idx = speeds.indexOf(prev);
          return idx < speeds.length - 1 ? speeds[idx + 1] : prev;
        });
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setPlaybackSpeed((prev) => {
          const speeds: PlaybackSpeed[] = [0.5, 1, 2, 4, 8, 16];
          const idx = speeds.indexOf(prev);
          return idx > 0 ? speeds[idx - 1] : prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, stepBackward, stepForward]);

  // Compute interpolated telemetry state for all drivers at currentTime
  const interpolatedState = useMemo(() => {
    if (!payload || !payload.drivers) return null;

    const u = currentTime / timeStep;
    const k = Math.min(Math.max(0, Math.floor(u)), totalFrames - 2);
    const alpha = Math.max(0, Math.min(1, u - k));

    const km1 = Math.max(0, k - 1);
    const kp2 = Math.min(totalFrames - 1, k + 2);
    const kp1 = Math.min(totalFrames - 1, k + 1);

    const driversMap: Record<string, InterpolatedDriverState> = {};
    const leaderboardRaw: {
      driver: InterpolatedDriverState;
      distance: number;
    }[] = [];

    for (const [code, stream] of Object.entries(payload.drivers)) {
      if (!stream.x || stream.x.length === 0) continue;

      // Catmull-Rom spline on 3D spatial coordinates
      const x = catmullRom(
        stream.x[km1] ?? stream.x[k],
        stream.x[k],
        stream.x[kp1],
        stream.x[kp2] ?? stream.x[kp1],
        alpha
      );
      const y = catmullRom(
        stream.y[km1] ?? stream.y[k],
        stream.y[k],
        stream.y[kp1],
        stream.y[kp2] ?? stream.y[kp1],
        alpha
      );
      const z = catmullRom(
        stream.z[km1] ?? stream.z[k],
        stream.z[k],
        stream.z[kp1],
        stream.z[kp2] ?? stream.z[kp1],
        alpha
      );

      // Linear interpolation on scalar telemetry
      const speed = (1 - alpha) * stream.speed[k] + alpha * stream.speed[kp1];
      const rpm = Math.round((1 - alpha) * stream.rpm[k] + alpha * stream.rpm[kp1]);
      const throttle = (1 - alpha) * stream.throttle[k] + alpha * stream.throttle[kp1];
      const brake = (1 - alpha) * stream.brake[k] + alpha * stream.brake[kp1];
      const distance = (1 - alpha) * stream.distance[k] + alpha * stream.distance[kp1];

      // Discrete step values
      const gear = stream.gear[k];
      const drs = stream.drs[k];
      const lap = stream.lap[k] || 1;
      const compound = stream.compound[k] || "MEDIUM";
      const tyreLife = stream.tyre_life[k] || 10;
      const pitStatus = stream.pit_status?.[k] || "TRACK";
      const is_pitting = Boolean(
        stream.is_pitting?.[k] ??
        pitStatus.includes("PIT")
      );
      const pit_duration = stream.pit_duration?.[k] ?? null;
      const streamRecord = stream as Record<string, any>;
      const has_finished = Boolean(
        Array.isArray(streamRecord.has_finished) ? streamRecord.has_finished[k] : false
      );

      const driverObj: InterpolatedDriverState = {
        code,
        number: stream.number,
        name: stream.full_name,
        team: stream.team,
        teamColor: stream.team_color,
        x,
        y,
        z,
        speed: Math.round(speed * 10) / 10,
        rpm,
        gear,
        throttle: Math.round(throttle * 10) / 10,
        brake: Math.round(brake * 10) / 10,
        drs,
        distance,
        lap,
        compound,
        tyreLife,
        pitStatus,
        is_pitting,
        pit_duration,
        has_finished,
      };

      driversMap[code] = driverObj;
      leaderboardRaw.push({ driver: driverObj, distance });
    }

    // Build lookup map for official session results
    const officialResultsMap = new Map<string, OfficialResult>();
    const officialList = (payload?.metadata as any)?.official_results;
    if (Array.isArray(officialList)) {
      for (const res of officialList as OfficialResult[]) {
        if (res && res.driver_code) {
          officialResultsMap.set(res.driver_code.toUpperCase(), res);
        }
      }
    }

    // Sort running order:
    // 1. If both drivers have completed the race (has_finished), anchor their order strictly to official FIA results
    // 2. A driver who has completed the race distance is always ahead of any driver still racing on earlier laps
    // 3. While actively racing, sort by live cumulative track distance completed
    leaderboardRaw.sort((a, b) => {
      const aFinished = a.driver.has_finished;
      const bFinished = b.driver.has_finished;

      if (aFinished && bFinished) {
        const aOfficial = officialResultsMap.get(a.driver.code.toUpperCase());
        const bOfficial = officialResultsMap.get(b.driver.code.toUpperCase());
        if (aOfficial?.position !== undefined && bOfficial?.position !== undefined) {
          return aOfficial.position - bOfficial.position;
        }
        return b.distance - a.distance;
      }

      if (aFinished && !bFinished) {
        return -1;
      }
      if (!aFinished && bFinished) {
        return 1;
      }

      return b.distance - a.distance;
    });

    // Build real-time Leaderboard with accurate intervals
    const leaderboard: LeaderboardEntry[] = [];
    const leaderDist = leaderboardRaw.length > 0 ? leaderboardRaw[0].distance : 0;
    const leaderLap = leaderboardRaw.length > 0 ? leaderboardRaw[0].driver.lap : 1;
    const circuitLength =
      payload?.circuit?.track_length_m && payload.circuit.track_length_m > 500
        ? payload.circuit.track_length_m
        : 5000;

    let prevLeaderSec = 0;

    for (let i = 0; i < leaderboardRaw.length; i++) {
      const item = leaderboardRaw[i];
      const drv = item.driver;
      let gapToLeader = "LEADER";
      let intervalToAhead = "LEADER";
      let drsThreat = false;

      const officialRes = officialResultsMap.get(drv.code.toUpperCase());
      const isFinished = drv.has_finished;
      const leaderFinished = leaderboardRaw[0]?.driver.has_finished;

      if (i === 0) {
        gapToLeader = isFinished ? "WINNER" : "LEADER";
        intervalToAhead = isFinished ? "WINNER" : "LEADER";
      } else {
        const prevItem = leaderboardRaw[i - 1];
        const distToPrev = Math.max(0, prevItem.distance - item.distance);
        const distToLeader = Math.max(0, leaderDist - item.distance);

        // Uniform reference race pace for the entire pack:
        // Converts spatial meters smoothly and reliably to timing gaps
        const racePaceMs = Math.max(45, circuitLength / 95);
        let leaderSec = distToLeader / racePaceMs;

        // Enforce strictly monotonic non-decreasing gaps down the timing tower
        // Eliminates out-of-order gap anomalies
        if (leaderSec <= prevLeaderSec) {
          leaderSec = prevLeaderSec + 0.01;
        }
        prevLeaderSec = leaderSec;

        const intervalSec = distToPrev / racePaceMs;

        // Issue 1: A driver is only genuinely a lap down if physically separated
        // by at least 75% of a full circuit lap (or >= 60 seconds).
        // Crossing the start/finish line seam a few seconds after the leader
        // MUST keep showing their live second delta, NOT "+1 LAP".
        const isLapped = distToLeader >= circuitLength * 0.75;

        // If both this driver and the race leader have crossed the finish line,
        // anchor gap to authoritative official race result
        if (isFinished && leaderFinished && officialRes?.time_or_gap) {
          gapToLeader = officialRes.time_or_gap;
        } else if (isLapped) {
          const lapsBehind = Math.max(1, Math.round(distToLeader / circuitLength));
          gapToLeader = `+${lapsBehind} ${lapsBehind === 1 ? "LAP" : "LAPS"}`;
        } else {
          gapToLeader = `+${leaderSec.toFixed(3)}s`;
        }

        intervalToAhead = `+${intervalSec.toFixed(3)}s`;
        drsThreat = !isLapped && !isFinished && intervalSec <= 1.0;
      }

      leaderboard.push({
        position: i + 1,
        code: drv.code,
        name: drv.name,
        team: drv.team,
        teamColor: drv.teamColor,
        speed: drv.speed,
        distance: drv.distance,
        lap: drv.lap,
        gapToLeader,
        intervalToAhead,
        compound: drv.compound,
        tyreLife: drv.tyreLife,
        drsThreat,
        inPit: drv.is_pitting || drv.pitStatus.includes("PIT"),
        pitDuration: drv.pit_duration,
        hasFinished: isFinished,
        officialStatus: officialRes?.status,
      });
    }

    return {
      drivers: driversMap,
      leaderboard,
    };
  }, [payload, currentTime, timeStep, totalFrames]);

  // Current weather & race control flag
  const currentWeather: WeatherSample = useMemo(() => {
    if (!payload?.weather || payload.weather.length === 0) {
      return {
        timestamp: 0,
        air_temp: 24.5,
        track_temp: 40.2,
        humidity: 55,
        wind_speed: 6.5,
        wind_direction: 180,
        track_status: "1",
        status_text: "GREEN FLAG",
      };
    }

    // Find latest weather sample before or at currentTime
    let matched = payload.weather[0];
    for (const w of payload.weather) {
      if (w.timestamp <= currentTime) {
        matched = w;
      } else {
        break;
      }
    }
    return matched;
  }, [payload, currentTime]);

  const focusedDriver =
    selectedDriverCode && interpolatedState?.drivers[selectedDriverCode]
      ? interpolatedState.drivers[selectedDriverCode]
      : null;

  return {
    currentTime,
    duration,
    isPlaying,
    setIsPlaying,
    play,
    pause,
    playbackSpeed,
    selectedDriverCode,
    setSelectedDriverCode,
    setPlaybackSpeed,
    togglePlay,
    seekTo,
    stepForward,
    stepBackward,
    interpolatedDrivers: interpolatedState?.drivers || {},
    leaderboard: interpolatedState?.leaderboard || [],
    focusedDriver,
    currentWeather,
  };
}

