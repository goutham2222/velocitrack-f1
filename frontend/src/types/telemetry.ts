export interface EventInfo {
  round_number: number;
  country: string;
  location: string;
  official_name: string;
  event_name: string;
  event_date: string;
  event_format: string;
}

export interface SessionInfo {
  name: string;
  code: string;
  date: string;
}

export interface EventDetailsResponse {
  year: number;
  event_name: string;
  location: string;
  sessions: SessionInfo[];
  total_laps?: number;
  drivers: string[];
}

export interface SectorBoundary {
  sector: number;
  start_distance: number;
  end_distance: number;
}

export interface TurnMarker {
  number: number;
  name?: string;
  x: number;
  y: number;
  z: number;
  angle?: number;
  distance: number;
}

export interface DRSZone {
  id: number;
  detection_distance?: number;
  activation_distance: number;
  end_distance: number;
}

export interface CircuitGeometry {
  circuit_name: string;
  rotation: number;
  centerline: number[][]; // [x, y, z]
  sectors: SectorBoundary[];
  turns: TurnMarker[];
  drs_zones: DRSZone[];
  track_length_m: number;
}

export interface DriverReplayStream {
  code: string;
  number: number;
  full_name: string;
  team: string;
  team_color: string;
  x: number[];
  y: number[];
  z: number[];
  speed: number[];
  rpm: number[];
  gear: number[];
  throttle: number[];
  brake: number[];
  drs: number[];
  distance: number[];
  lap: number[];
  compound: string[];
  tyre_life: number[];
  pit_status: string[];
}

export interface WeatherSample {
  timestamp: number;
  air_temp: number;
  track_temp: number;
  humidity: number;
  wind_speed: number;
  wind_direction: number;
  track_status: string;
  status_text: string;
}

export interface ReplayMetadata {
  year: number;
  event_name: string;
  session_name: string;
  circuit_name: string;
  total_frames: number;
  time_step: number;
  duration_seconds: number;
  start_session_time: number;
  end_session_time: number;
  lap_start: number;
  lap_end: number;
  total_laps: number;
}

export interface ReplayPayload {
  metadata: ReplayMetadata;
  circuit: CircuitGeometry;
  timestamps: number[];
  drivers: Record<string, DriverReplayStream>;
  weather: WeatherSample[];
}

// ---------------------------------------------------------------------------
// Realtime UI Derived State Types
// ---------------------------------------------------------------------------

export interface InterpolatedDriverState {
  code: string;
  number: number;
  name: string;
  team: string;
  teamColor: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number;
  distance: number;
  lap: number;
  compound: string;
  tyreLife: number;
  pitStatus: string;
}

export interface LeaderboardEntry {
  position: number;
  code: string;
  name: string;
  team: string;
  teamColor: string;
  speed: number;
  distance: number;
  lap: number;
  gapToLeader: string;
  intervalToAhead: string;
  compound: string;
  tyreLife: number;
  drsThreat: boolean;
  inPit: boolean;
}

export type CameraMode = "orbit" | "chase";
export type ViewportMode = "3d" | "2d";
export type SpeedUnit = "kmh" | "mph";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8 | 16;

