import {
  EventInfo,
  EventDetailsResponse,
  ReplayPayload,
} from "@/types/telemetry";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAvailableYears(): Promise<number[]> {
  try {
    const res = await fetch(`${API_BASE}/api/seasons`);
    if (!res.ok) {
      // Fallback to sessions/years alias if needed
      const altRes = await fetch(`${API_BASE}/api/sessions/years`);
      if (!altRes.ok) throw new Error("Failed to fetch seasons");
      return await altRes.json();
    }
    return await res.json();
  } catch (err) {
    console.warn("Using fallback seasons:", err);
    const currentYear = new Date().getFullYear();
    const yrs: number[] = [];
    for (let y = currentYear; y >= 2018; y--) {
      yrs.push(y);
    }
    return yrs;
  }
}

export async function fetchEvents(year: number): Promise<EventInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/events?year=${year}`);
    if (!res.ok) throw new Error("Failed to fetch events");
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch events:", err);
    return [];
  }
}

export async function fetchEventDetails(
  year: number,
  event: string
): Promise<EventDetailsResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/sessions/details?year=${year}&event=${encodeURIComponent(event)}`
    );
    if (!res.ok) throw new Error("Failed to fetch event details");
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch event details:", err);
    return null;
  }
}

export async function fetchDemoReplay(
  samplingRate: number = 10,
  laps: number = 2
): Promise<ReplayPayload> {
  const res = await fetch(
    `${API_BASE}/api/telemetry/demo?sampling_rate=${samplingRate}&laps=${laps}`
  );
  if (!res.ok) throw new Error("Failed to fetch demo replay");
  return await res.json();
}

export async function fetchSessionReplay(
  year: number,
  event: string,
  session: string,
  lapStart: number,
  lapEnd: number,
  samplingRate: number = 10
): Promise<ReplayPayload> {
  const res = await fetch(
    `${API_BASE}/api/telemetry/replay?year=${year}&event=${encodeURIComponent(
      event
    )}&session=${session}&lap_start=${lapStart}&lap_end=${lapEnd}&sampling_rate=${samplingRate}`
  );
  if (!res.ok) throw new Error("Failed to fetch session replay");
  return await res.json();
}

export async function checkServerBootId(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.boot_id ? String(data.boot_id) : null;
  } catch {
    return null;
  }
}



