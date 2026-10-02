"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ReplayPayload,
  InterpolatedDriverState,
  LeaderboardEntry,
  OfficialResult,
  PlaybackSpeed,
  WeatherSample,
  TrackStatusInfo,
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

  const duration = payload?.metadata.total_duration ?? payload?.metadata.duration_seconds ?? 100;
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

  const lastSessionKeyRef = useRef<string>("");

  // Reset selected driver on session load or if code not in payload
  useEffect(() => {
    if (!payload) return;
    const sessionKey = `${payload.metadata.year}-${payload.metadata.event_name}-${payload.metadata.session_name}`;
    if (lastSessionKeyRef.current && lastSessionKeyRef.current !== sessionKey) {
      setSelectedDriverCode(null);
    }
    lastSessionKeyRef.current = sessionKey;

    if (payload.drivers && selectedDriverCode) {
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
    (seconds: number = 5) => {
      seekTo(currentTimeRef.current + seconds);
    },
    [seekTo]
  );

  const stepBackward = useCallback(
    (seconds: number = 5) => {
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

    const circuitLength =
      payload?.circuit?.track_length_m && payload.circuit.track_length_m > 500
        ? payload.circuit.track_length_m
        : 5500;

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
      const isDnsEntry = Boolean(stream.is_dns);
      const hasCoordinates = Boolean(stream.x && stream.x.length > 0);

      // Handle non-starters (DNS) and drivers who retired prior to this replay window (no coordinates)
      if (isDnsEntry || !hasCoordinates) {
        const isDns = isDnsEntry && !stream.is_dnf;
        const lapsDone = stream.laps_completed ?? (stream.lap?.[0] || 0);
        const finalStatus = isDns ? "DNS" : (stream.final_status || "DNF");
        const driverObj: InterpolatedDriverState = {
          code,
          number: stream.number,
          name: stream.full_name,
          team: stream.team,
          teamColor: stream.team_color,
          x: 0,
          y: 0,
          z: 0,
          speed: 0,
          rpm: 0,
          gear: 0,
          throttle: 0,
          brake: 0,
          drs: 0,
          distance: isDns ? 0 : (stream.distance?.[0] ?? lapsDone * circuitLength),
          lap: isDns ? 0 : (stream.lap?.[0] ?? lapsDone),
          compound: stream.compound?.[0] || (isDns ? "UNKNOWN" : "HARD"),
          tyreLife: 0,
          pitStatus: isDns ? "DNS" : "DNF",
          is_pitting: false,
          pit_duration: null,
          has_finished: false,
          is_dnf: !isDns,
          isDnf: !isDns,
          is_dns: isDns,
          isDns: isDns,
          final_status: finalStatus,
          finalStatus: finalStatus,
          laps_completed: lapsDone,
          lapsCompleted: lapsDone,
          is_active: false,
        };
        driversMap[code] = driverObj;
        leaderboardRaw.push({
          driver: driverObj,
          distance: isDns ? -999999999 : -500000000 + lapsDone,
        });
        continue;
      }

      // Catmull-Rom spline on 3D spatial coordinates with safe clamping
      const xKm1 = stream.x[km1] ?? stream.x[k] ?? 0;
      const xK = stream.x[k] ?? 0;
      const xKp1 = stream.x[kp1] ?? xK;
      const xKp2 = stream.x[kp2] ?? xKp1;
      const x = catmullRom(xKm1, xK, xKp1, xKp2, alpha);

      const yKm1 = stream.y?.[km1] ?? stream.y?.[k] ?? 0;
      const yK = stream.y?.[k] ?? 0;
      const yKp1 = stream.y?.[kp1] ?? yK;
      const yKp2 = stream.y?.[kp2] ?? yKp1;
      const y = catmullRom(yKm1, yK, yKp1, yKp2, alpha);

      const zKm1 = stream.z?.[km1] ?? stream.z?.[k] ?? 0;
      const zK = stream.z?.[k] ?? 0;
      const zKp1 = stream.z?.[kp1] ?? zK;
      const zKp2 = stream.z?.[kp2] ?? zKp1;
      const z = catmullRom(zKm1, zK, zKp1, zKp2, alpha);

      // Linear interpolation on scalar telemetry with optional chaining guards
      const speedK = stream.speed?.[k] ?? 0;
      const speedKp1 = stream.speed?.[kp1] ?? speedK;
      const speed = (1 - alpha) * speedK + alpha * speedKp1;

      const rpmK = stream.rpm?.[k] ?? 0;
      const rpmKp1 = stream.rpm?.[kp1] ?? rpmK;
      const rpm = Math.round((1 - alpha) * rpmK + alpha * rpmKp1);

      const throttleK = stream.throttle?.[k] ?? 0;
      const throttleKp1 = stream.throttle?.[kp1] ?? throttleK;
      const throttle = (1 - alpha) * throttleK + alpha * throttleKp1;

      const brakeK = stream.brake?.[k] ?? 0;
      const brakeKp1 = stream.brake?.[kp1] ?? brakeK;
      const brake = (1 - alpha) * brakeK + alpha * brakeKp1;

      const distK = stream.distance?.[k] ?? 0;
      const distKp1 = stream.distance?.[kp1] ?? distK;
      const distance = (1 - alpha) * distK + alpha * distKp1;

      // Discrete step values with null coalescing
      const gear = stream.gear?.[k] ?? 0;
      const drs = stream.drs?.[k] ?? 0;
      const lap = stream.lap?.[k] || 1;
      const compound = stream.compound?.[k] || "MEDIUM";
      const tyreLife = stream.tyre_life?.[k] || 10;

      const streamRecord = stream as Record<string, any>;
      const officialRes = officialResultsMap.get(code.toUpperCase());

      // DNF / Active state identification per frame
      const is_active = Array.isArray(streamRecord.is_active)
        ? Boolean(streamRecord.is_active[k])
        : (streamRecord.pit_status?.[k] !== "DNF");

      const is_dnf = !is_active || streamRecord.pit_status?.[k] === "DNF";

      const pitStatus = is_dnf ? "DNF" : (stream.pit_status?.[k] || "TRACK");
      const is_pitting = is_dnf ? false : Boolean(
        stream.is_pitting?.[k] ??
        pitStatus.includes("PIT")
      );
      const pit_duration = is_dnf ? null : (stream.pit_duration?.[k] ?? null);
      const has_finished = is_dnf ? false : Boolean(
        Array.isArray(streamRecord.has_finished) ? streamRecord.has_finished[k] : false
      );

      const driverFinalStatus = is_dnf ? "DNF" : (stream.final_status || "Finished");
      const driverLapsCompleted = stream.laps_completed ?? lap;

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
        isDnf: is_dnf,
        is_dns: false,
        isDns: false,
        final_status: driverFinalStatus,
        finalStatus: driverFinalStatus,
        laps_completed: driverLapsCompleted,
        lapsCompleted: driverLapsCompleted,
        is_active,
      };

      driversMap[code] = driverObj;
      leaderboardRaw.push({ driver: driverObj, distance });
    }

    // Sort running order:
    // 1. DNS drivers are strictly anchored to the absolute bottom of the field
    // 2. DNF drivers are anchored behind all running and finished cars
    // 3. When both drivers have completed the race (has_finished), break ties using official classification
    // 4. While actively racing, sort strictly by lap and cumulative track distance completed
    leaderboardRaw.sort((a, b) => {
      const aDns = Boolean(a.driver.is_dns);
      const bDns = Boolean(b.driver.is_dns);
      if (aDns && !bDns) return 1;
      if (!aDns && bDns) return -1;
      if (aDns && bDns) {
        return a.driver.number - b.driver.number;
      }

      const aDnf = Boolean(a.driver.is_dnf);
      const bDnf = Boolean(b.driver.is_dnf);
      if (aDnf && !bDnf) return 1;
      if (!aDnf && bDnf) return -1;
      if (aDnf && bDnf) {
        const aOfficial = officialResultsMap.get(a.driver.code.toUpperCase());
        const bOfficial = officialResultsMap.get(b.driver.code.toUpperCase());
        if (aOfficial?.position && bOfficial?.position) {
          return aOfficial.position - bOfficial.position;
        }
        const aLaps = a.driver.laps_completed ?? a.driver.lap;
        const bLaps = b.driver.laps_completed ?? b.driver.lap;
        if (aLaps !== bLaps) {
          return bLaps - aLaps;
        }
        return b.distance - a.distance;
      }

      const aFinished = a.driver.has_finished;
      const bFinished = b.driver.has_finished;

      // When both drivers have completed the race, official classification is authoritative
      if (aFinished && bFinished) {
        const aOfficial = officialResultsMap.get(a.driver.code.toUpperCase());
        const bOfficial = officialResultsMap.get(b.driver.code.toUpperCase());
        if (aOfficial?.position && bOfficial?.position) {
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

    // Uniform reference race pace (m/s) across the circuit (~200-220 km/h)
    // Converts spatial distance deltas smoothly to time gaps without instantaneous speed noise
    const racePaceMs = Math.max(45, circuitLength / 95);

    let cumulativeGapSec = 0;
    let runningPos = 1;

    for (let i = 0; i < leaderboardRaw.length; i++) {
      const item = leaderboardRaw[i];
      const drv = item.driver;
      let gapToLeader = "LEADER";
      let intervalToAhead = "LEADER";
      let drsThreat = false;

      const officialRes = officialResultsMap.get(drv.code.toUpperCase());
      const isDns = Boolean(drv.is_dns);
      const isDnf = Boolean(drv.is_dnf);
      const isFinished = Boolean(drv.has_finished);
      const leaderFinished = Boolean(leaderboardRaw[0]?.driver.has_finished);

      if (isDns) {
        leaderboard.push({
          position: "—",
          code: drv.code,
          name: drv.name,
          team: drv.team,
          teamColor: drv.teamColor,
          speed: 0,
          distance: 0,
          lap: 0,
          gapToLeader: "—",
          intervalToAhead: "—",
          compound: "—",
          tyreLife: 0,
          drsThreat: false,
          drs: 0,
          isDrsOpen: false,
          inPit: false,
          pitDuration: null,
          hasFinished: false,
          isDnf: false,
          isDns: true,
          lapsCompleted: 0,
          is_active: false,
          officialStatus: "DNS",
        });
        continue;
      }

      const currentPos = runningPos++;

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
        position: currentPos,
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
        drs: drv.drs,
        isDrsOpen: drv.drs >= 10,
        inPit: !isDnf && (drv.is_pitting || drv.pitStatus.includes("PIT")),
        pitDuration: isDnf ? null : drv.pit_duration,
        hasFinished: isFinished,
        isDnf: isDnf,
        isDns: false,
        lapsCompleted: drv.laps_completed ?? drv.lap,
        is_active: drv.is_active,
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

  // Dynamic FIA track status for current frame
  const currentTrackStatus: TrackStatusInfo = useMemo(() => {
    if (!payload) {
      return { code: 1, label: "GREEN FLAG", color: "#10B981" };
    }
    const u = currentTime / timeStep;
    const k = Math.min(Math.max(0, Math.floor(u)), totalFrames - 1);
    const statusCode =
      payload.track_status && payload.track_status.length > 0
        ? (payload.track_status[k] ?? 1)
        : (currentWeather?.track_status ? parseInt(currentWeather.track_status, 10) : 1);

    switch (statusCode) {
      case 2:
        return { code: 2, label: "YELLOW FLAG", color: "#EAB308" };
      case 4:
        return { code: 4, label: "SAFETY CAR", color: "#F59E0B" };
      case 5:
        return { code: 5, label: "RED FLAG", color: "#EF4444" };
      case 6:
        return { code: 6, label: "VSC DEPLOYED", color: "#F59E0B" };
      case 7:
        return { code: 7, label: "VSC ENDING", color: "#F59E0B" };
      case 1:
      default:
        return { code: 1, label: "GREEN FLAG", color: "#10B981" };
    }
  }, [payload, currentTime, timeStep, totalFrames, currentWeather?.track_status]);

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
    drivers: interpolatedState?.drivers || {},
    leaderboard: interpolatedState?.leaderboard || [],
    focusedDriver,
    currentWeather,
    currentTrackStatus,
  };
}

