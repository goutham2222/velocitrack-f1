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

      const streamRecord = stream as Record<string, any>;
      const officialRes = officialResultsMap.get(code.toUpperCase());

      // DNF / Retired state identification
      const is_dnf = Boolean(
        streamRecord.is_dnf ||
        streamRecord.pit_status?.[k] === "DNF" ||
        officialRes?.status === "DNF" ||
        officialRes?.time_or_gap === "DNF"
      );

      const pitStatus = is_dnf ? "DNF" : (stream.pit_status?.[k] || "TRACK");
      const is_pitting = is_dnf ? false : Boolean(
        stream.is_pitting?.[k] ??
        pitStatus.includes("PIT")
      );
      const pit_duration = is_dnf ? null : (stream.pit_duration?.[k] ?? null);
      const has_finished = is_dnf ? false : Boolean(
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
        speed: is_dnf ? 0 : Math.round(speed * 10) / 10,
        rpm: is_dnf ? 0 : rpm,
        gear: is_dnf ? 0 : gear,
        throttle: is_dnf ? 0 : Math.round(throttle * 10) / 10,
        brake: is_dnf ? 0 : Math.round(brake * 10) / 10,
        drs: is_dnf ? 0 : drs,
        distance,
        lap,
        compound,
        tyreLife,
        pitStatus,
        is_pitting,
        pit_duration,
        has_finished,
        is_dnf,
      };

      driversMap[code] = driverObj;
      leaderboardRaw.push({ driver: driverObj, distance });
    }

    // Sort running order:
    // 1. DNF drivers are strictly anchored to the bottom of the field behind all running and finished cars
    // 2. When both drivers have completed the race (has_finished), break ties using official classification
    // 3. While actively racing, sort strictly by cumulative track distance completed
    leaderboardRaw.sort((a, b) => {
      const aDnf = a.driver.is_dnf;
      const bDnf = b.driver.is_dnf;

      if (aDnf && !bDnf) return 1;
      if (!aDnf && bDnf) return -1;
      if (aDnf && bDnf) {
        const aOfficial = officialResultsMap.get(a.driver.code.toUpperCase());
        const bOfficial = officialResultsMap.get(b.driver.code.toUpperCase());
        if (aOfficial?.position !== undefined && bOfficial?.position !== undefined) {
          return aOfficial.position - bOfficial.position;
        }
        return b.distance - a.distance;
      }

      const aFinished = a.driver.has_finished;
      const bFinished = b.driver.has_finished;

      // When both drivers have completed the race, official classification is authoritative
      if (aFinished && bFinished) {
        const aOfficial = officialResultsMap.get(a.driver.code.toUpperCase());
        const bOfficial = officialResultsMap.get(b.driver.code.toUpperCase());
        if (aOfficial?.position !== undefined && bOfficial?.position !== undefined) {
          return aOfficial.position - bOfficial.position;
        }
      }

      // If one driver is on a higher lap, they are strictly ahead of a driver on a lower lap
      if (a.driver.lap !== b.driver.lap) {
        return b.driver.lap - a.driver.lap;
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
        : 5500;

    // Uniform reference race pace (m/s) across the circuit (~200-220 km/h)
    // Converts spatial distance deltas smoothly to time gaps without instantaneous speed noise
    const racePaceMs = Math.max(45, circuitLength / 95);

    let cumulativeGapSec = 0;

    for (let i = 0; i < leaderboardRaw.length; i++) {
      const item = leaderboardRaw[i];
      const drv = item.driver;
      let gapToLeader = "LEADER";
      let intervalToAhead = "LEADER";
      let drsThreat = false;

      const officialRes = officialResultsMap.get(drv.code.toUpperCase());
      const isDnf = Boolean(drv.is_dnf);
      const isFinished = Boolean(drv.has_finished);
      const leaderFinished = Boolean(leaderboardRaw[0]?.driver.has_finished);

      if (isDnf) {
        gapToLeader = "DNF";
        intervalToAhead = "DNF";
        drsThreat = false;
      } else if (i === 0) {
        gapToLeader = isFinished ? "WINNER" : "LEADER";
        intervalToAhead = isFinished ? "WINNER" : "LEADER";
      } else {
        const prevItem = leaderboardRaw[i - 1];
        const distToPrev = Math.max(0, prevItem.distance - item.distance);
        const distToLeader = Math.max(0, leaderDist - item.distance);

        // When cars are close (< 250m, ~4s), blend their local speed to capture realistic wheel-to-wheel battles.
        // When cars are further apart, reference circuit race pace prevents corner-vs-straight speed anomalies.
        const localSpeedMs = Math.max(25, (drv.speed + prevItem.driver.speed) / 2 / 3.6);
        const blendWeight = Math.min(1, distToPrev / 250);
        const intervalSpeed = (1 - blendWeight) * localSpeedMs + blendWeight * racePaceMs;
        const intervalSec = distToPrev / intervalSpeed;

        cumulativeGapSec += intervalSec;

        // Is this car lapped (physically trailing by >= 1 lap or officially classified as lapped)?
        const lapsBehind = Math.max(0, leaderLap - drv.lap);
        const isOfficialLapped = Boolean(
          officialRes?.time_or_gap &&
            (officialRes.time_or_gap.includes("LAP") ||
              officialRes.status.includes("Lap") ||
              /^\+\d+$/.test(officialRes.time_or_gap.trim()))
        );
        const isLapped = isOfficialLapped || lapsBehind >= 1;

        // Determine exact numeric lap delta (e.g. 1, 2)
        let lapDelta = lapsBehind >= 1 ? lapsBehind : 1;
        if (officialRes?.time_or_gap) {
          const match = officialRes.time_or_gap.match(/\d+/);
          if (match) lapDelta = parseInt(match[0], 10);
        }

        // If both this driver and the race leader have crossed the finish line,
        // display the authoritative official race gap (e.g. "+90.558s" or "+1 Lap")
        if (isFinished && leaderFinished && officialRes?.time_or_gap) {
          if (isLapped) {
            gapToLeader = `+${lapDelta} Lap`;
          } else {
            gapToLeader = officialRes.time_or_gap;
          }
        } else if (isLapped) {
          gapToLeader = `+${lapDelta} Lap`;
        } else {
          gapToLeader = `+${cumulativeGapSec.toFixed(3)}s`;
        }

        intervalToAhead = isLapped
          ? (prevItem.driver.lap > drv.lap ? `+${prevItem.driver.lap - drv.lap} Lap` : `+${intervalSec.toFixed(3)}s`)
          : `+${intervalSec.toFixed(3)}s`;
        drsThreat = !isLapped && !isFinished && !isDnf && intervalSec <= 1.0;
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
        inPit: !isDnf && (drv.is_pitting || drv.pitStatus.includes("PIT")),
        pitDuration: isDnf ? null : drv.pit_duration,
        hasFinished: isFinished,
        isDnf: isDnf,
        officialStatus: isDnf ? "DNF" : officialRes?.status,
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

