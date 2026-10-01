export interface EventInfo {
  round_number: number;
  country: string;
  location: string;
  official_name: string;
  event_name: string;
  event_date: string;
  event_format: string;
  is_completed?: boolean;
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
  left_edge?: number[][];
  right_edge?: number[][];
  pit_lane?: number[][];
}

export interface OfficialResult {
  position: number;
  driver_code: string;
  driver_number?: number;
  team?: string;
  status: string;
  points?: number;
  time_or_gap?: string;
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
  is_pitting?: boolean[];
  pit_duration?: (number | null)[];
  has_finished?: boolean[];
  is_dnf?: boolean;
  is_active?: boolean[];
}

export interface TelemetrySample {
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
  tyre_life: number;
  pit_status: string;
  is_pitting: boolean;
  pit_duration?: number | null;
  has_finished?: boolean;
  is_dnf?: boolean;
  is_active?: boolean;
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
  total_duration?: number;
  start_session_time: number;
  end_session_time: number;
  lap_start: number;
  lap_end: number;
  total_laps: number;
  official_results?: OfficialResult[];
}

export interface TrackStatusInfo {
  code: number;
  label: string;
  color: string;
}

export interface ReplayPayload {
  metadata: ReplayMetadata;
  circuit: CircuitGeometry;
  timestamps: number[];
  drivers: Record<string, DriverReplayStream>;
  weather: WeatherSample[];
  track_status?: number[];
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
  is_pitting: boolean;
  pit_duration?: number | null;
  has_finished?: boolean;
  is_dnf?: boolean;
  is_active?: boolean;
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
  drs?: number;
  isDrsOpen?: boolean;
  inPit: boolean;
  pitDuration?: number | null;
  hasFinished?: boolean;
  isDnf?: boolean;
  is_active?: boolean;
  officialStatus?: string;
}

export type CameraMode = "orbit" | "chase";
export type ViewportMode = "3d" | "2d";
export type SpeedUnit = "kmh" | "mph";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8 | 16;

