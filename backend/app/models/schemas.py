from typing import List, Optional, Dict
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Calendar & Session Schemas
# ---------------------------------------------------------------------------

class EventInfo(BaseModel):
    round_number: int
    country: str
    location: str
    official_name: str
    event_name: str
    event_date: str
    event_format: str
    is_completed: bool = True



class SessionInfo(BaseModel):
    name: str
    code: str
    date: str


class EventDetailsResponse(BaseModel):
    year: int
    event_name: str
    location: str
    sessions: List[SessionInfo]
    total_laps: Optional[int] = None
    drivers: List[str] = []


class LapSummary(BaseModel):
    lap_number: int
    driver: str
    lap_time_str: str
    lap_time_seconds: Optional[float] = None
    compound: str
    tyre_life: int
    is_personal_best: bool = False


# ---------------------------------------------------------------------------
# Circuit Geometry Schemas
# ---------------------------------------------------------------------------

class SectorBoundary(BaseModel):
    sector: int
    start_distance: float
    end_distance: float


class TurnMarker(BaseModel):
    number: int
    name: Optional[str] = None
    x: float
    y: float
    z: float
    angle: Optional[float] = None
    distance: float


class DRSZone(BaseModel):
    id: int
    detection_distance: Optional[float] = None
    activation_distance: float
    end_distance: float


class CircuitGeometry(BaseModel):
    circuit_name: str
    rotation: float = 0.0
    centerline: List[List[float]] = Field(
        ...,
        description="List of [x, y, z] points defining the track path"
    )
    sectors: List[SectorBoundary] = []
    turns: List[TurnMarker] = []
    drs_zones: List[DRSZone] = []
    track_length_m: float = 0.0
    left_edge: Optional[List[List[float]]] = None
    right_edge: Optional[List[List[float]]] = None
    pit_lane: Optional[List[List[float]]] = None


# ---------------------------------------------------------------------------
# Telemetry Replay Schemas
# ---------------------------------------------------------------------------

class TelemetrySample(BaseModel):
    x: float
    y: float
    z: float
    speed: float
    rpm: int
    gear: int
    throttle: float
    brake: float
    drs: int
    distance: float
    lap: int
    compound: str
    tyre_life: int
    pit_status: str = "TRACK"
    is_pitting: bool = False
    pit_duration: Optional[float] = None
    has_finished: bool = False
    is_dnf: bool = False
    is_active: bool = True


class OfficialResult(BaseModel):
    position: Optional[int] = None
    driver_code: str
    driver_number: Optional[int] = None
    team: Optional[str] = None
    status: str = "Finished"
    points: Optional[float] = None
    time_or_gap: Optional[str] = None
    laps_completed: Optional[int] = None


class DriverReplayStream(BaseModel):
    code: str
    number: int
    full_name: str
    team: str
    team_color: str
    x: List[float] = Field(default_factory=list)
    y: List[float] = Field(default_factory=list)
    z: List[float] = Field(default_factory=list)
    speed: List[float] = Field(default_factory=list)
    rpm: List[int] = Field(default_factory=list)
    gear: List[int] = Field(default_factory=list)
    throttle: List[float] = Field(default_factory=list)
    brake: List[float] = Field(default_factory=list)
    drs: List[int] = Field(default_factory=list)
    distance: List[float] = Field(default_factory=list)
    lap: List[int] = Field(default_factory=list)
    compound: List[str] = Field(default_factory=list)
    tyre_life: List[int] = Field(default_factory=list)
    pit_status: List[str] = Field(default_factory=list)
    is_pitting: List[bool] = Field(default_factory=list)
    pit_duration: Optional[List[Optional[float]]] = None
    has_finished: List[bool] = Field(default_factory=list)
    is_dnf: bool = False
    is_dns: bool = False
    final_status: Optional[str] = None
    laps_completed: Optional[int] = None
    is_active: List[bool] = Field(default_factory=list)


class WeatherSample(BaseModel):
    timestamp: float
    air_temp: float
    track_temp: float
    humidity: float
    wind_speed: float
    wind_direction: float
    track_status: str
    status_text: str


class ReplayMetadata(BaseModel):
    year: int
    event_name: str
    session_name: str
    circuit_name: str
    total_frames: int
    time_step: float
    duration_seconds: float
    total_duration: Optional[float] = None
    start_session_time: float
    end_session_time: float
    lap_start: int
    lap_end: int
    total_laps: int
    official_results: Optional[List[OfficialResult]] = None


class ReplayPayload(BaseModel):
    metadata: ReplayMetadata
    circuit: CircuitGeometry
    timestamps: List[float]
    drivers: Dict[str, DriverReplayStream]
    weather: List[WeatherSample]
    track_status: List[int] = Field(default_factory=list)


