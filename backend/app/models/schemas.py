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


# ---------------------------------------------------------------------------
# Telemetry Replay Schemas
# ---------------------------------------------------------------------------

class DriverReplayStream(BaseModel):
    code: str
    number: int
    full_name: str
    team: str
    team_color: str
    x: List[float]
    y: List[float]
    z: List[float]
    speed: List[float]
    rpm: List[int]
    gear: List[int]
    throttle: List[float]
    brake: List[float]
    drs: List[int]
    distance: List[float]
    lap: List[int]
    compound: List[str]
    tyre_life: List[int]
    pit_status: List[str]


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
    start_session_time: float
    end_session_time: float
    lap_start: int
    lap_end: int
    total_laps: int


class ReplayPayload(BaseModel):
    metadata: ReplayMetadata
    circuit: CircuitGeometry
    timestamps: List[float]
    drivers: Dict[str, DriverReplayStream]
    weather: List[WeatherSample]

