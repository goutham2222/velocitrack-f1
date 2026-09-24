import {
  EventInfo,
  EventDetailsResponse,
  ReplayPayload,
} from "@/types/telemetry";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchAvailableYears(): Promise<number[]> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/years`);
    if (!res.ok) throw new Error("Failed to fetch years");
    return await res.json();
  } catch (err) {
    console.warn("Using fallback seasons:", err);
    return [2024, 2023, 2022, 2021, 2020];
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

