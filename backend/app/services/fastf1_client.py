import os
import re
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import fastf1
import pandas as pd
from app.config import settings
from app.models.schemas import EventInfo, SessionInfo, EventDetailsResponse, LapSummary, TurnMarker

logger = logging.getLogger("velocitrack.fastf1")

# Ensure cache directory exists and enable FastF1 caching
try:
    cache_path = os.path.abspath(settings.fastf1_cache_dir)
    os.makedirs(cache_path, exist_ok=True)
    fastf1.Cache.enable_cache(cache_path)
    logger.info(f"FastF1 cache enabled at: {cache_path}")
except Exception as e:
    logger.warning(f"Failed to enable FastF1 cache: {e}")

# In-memory schedules cache to guarantee instant dropdown responses
_SCHEDULE_CACHE: Dict[int, List[EventInfo]] = {}

FALLBACK_POPULAR_EVENTS = [
    {"round": 1, "country": "Bahrain", "location": "Sakhir", "name": "Bahrain Grand Prix", "format": "conventional"},
    {"round": 2, "country": "Saudi Arabia", "location": "Jeddah", "name": "Saudi Arabian Grand Prix", "format": "conventional"},
    {"round": 3, "country": "Australia", "location": "Melbourne", "name": "Australian Grand Prix", "format": "conventional"},
    {"round": 4, "country": "Japan", "location": "Suzuka", "name": "Japanese Grand Prix", "format": "conventional"},
    {"round": 5, "country": "China", "location": "Shanghai", "name": "Chinese Grand Prix", "format": "sprint"},
    {"round": 6, "country": "USA", "location": "Miami", "name": "Miami Grand Prix", "format": "sprint"},
    {"round": 7, "country": "Italy", "location": "Imola", "name": "Emilia Romagna Grand Prix", "format": "conventional"},
    {"round": 8, "country": "Monaco", "location": "Monaco", "name": "Monaco Grand Prix", "format": "conventional"},
    {"round": 9, "country": "Canada", "location": "Montreal", "name": "Canadian Grand Prix", "format": "conventional"},
    {"round": 10, "country": "Spain", "location": "Barcelona", "name": "Spanish Grand Prix", "format": "conventional"},
    {"round": 11, "country": "Austria", "location": "Spielberg", "name": "Austrian Grand Prix", "format": "sprint"},
    {"round": 12, "country": "Great Britain", "location": "Silverstone", "name": "British Grand Prix", "format": "conventional"},
    {"round": 13, "country": "Hungary", "location": "Budapest", "name": "Hungarian Grand Prix", "format": "conventional"},
    {"round": 14, "country": "Belgium", "location": "Spa-Francorchamps", "name": "Belgian Grand Prix", "format": "conventional"},
    {"round": 15, "country": "Netherlands", "location": "Zandvoort", "name": "Dutch Grand Prix", "format": "conventional"},
    {"round": 16, "country": "Italy", "location": "Monza", "name": "Italian Grand Prix", "format": "conventional"},
    {"round": 17, "country": "Azerbaijan", "location": "Baku", "name": "Azerbaijan Grand Prix", "format": "conventional"},
    {"round": 18, "country": "Singapore", "location": "Singapore", "name": "Singapore Grand Prix", "format": "conventional"},
    {"round": 19, "country": "USA", "location": "Austin", "name": "United States Grand Prix", "format": "sprint"},
    {"round": 20, "country": "Mexico", "location": "Mexico City", "name": "Mexico City Grand Prix", "format": "conventional"},
    {"round": 21, "country": "Brazil", "location": "São Paulo", "name": "São Paulo Grand Prix", "format": "sprint"},
    {"round": 22, "country": "USA", "location": "Las Vegas", "name": "Las Vegas Grand Prix", "format": "conventional"},
    {"round": 23, "country": "Qatar", "location": "Lusail", "name": "Qatar Grand Prix", "format": "sprint"},
    {"round": 24, "country": "Abu Dhabi", "location": "Yas Marina", "name": "Abu Dhabi Grand Prix", "format": "conventional"},
]


def get_available_years() -> List[int]:
    """Returns available F1 seasons (2018 through current calendar year, descending)."""
    current_year = datetime.now(timezone.utc).year
    return list(range(current_year, 2017, -1))


def is_event_completed(row, now_utc: datetime) -> bool:
    """
    Checks if a Grand Prix has concluded based on Session5DateUtc or EventDate.
    """
    date_val = row.get("Session5DateUtc")
    if pd.isna(date_val):
        date_val = row.get("EventDate")
    if pd.isna(date_val):
        return True
    try:
        ts = pd.to_datetime(date_val)
        ts_utc = ts.tz_localize(timezone.utc) if ts.tzinfo is None else ts
        return bool(ts_utc <= now_utc)
    except Exception:
        return True


def get_events_for_year(year: int) -> List[EventInfo]:
    """
    Returns calendar events for the given season with is_completed flag.
    Caches results in memory for sub-millisecond future queries.
    """
    if year in _SCHEDULE_CACHE:
        return _SCHEDULE_CACHE[year]

    now_utc = datetime.now(timezone.utc)
    events: List[EventInfo] = []
    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        for _, row in schedule.iterrows():
            # Skip testing sessions
            round_num = int(row.get("RoundNumber", 0))
            if round_num <= 0:
                continue

            event_date = str(row.get("EventDate", ""))
            if hasattr(row.get("EventDate"), "strftime"):
                event_date = row["EventDate"].strftime("%Y-%m-%d")

            is_completed = is_event_completed(row, now_utc)

            events.append(
                EventInfo(
                    round_number=round_num,
                    country=str(row.get("Country", "")),
                    location=str(row.get("Location", "")),
                    official_name=str(row.get("OfficialEventName", "")),
                    event_name=str(row.get("EventName", "")),
                    event_date=event_date,
                    event_format=str(row.get("EventFormat", "conventional")),
                    is_completed=is_completed,
                )
            )
    except Exception as e:
        logger.warning(f"FastF1 schedule fetch failed for year {year}: {e}. Using fallback calendar.")
        now_year = now_utc.year
        for item in FALLBACK_POPULAR_EVENTS:
            fb_completed = (year < now_year) or (year == now_year and item["round"] <= 8)
            events.append(
                EventInfo(
                    round_number=item["round"],
                    country=item["country"],
                    location=item["location"],
                    official_name=f"Formula 1 {item['name']} {year}",
                    event_name=item["name"],
                    event_date=f"{year}-06-01",
                    event_format=item["format"],
                    is_completed=fb_completed,
                )
            )

    _SCHEDULE_CACHE[year] = events
    return events


def get_event_details(year: int, event_name_or_round: str) -> EventDetailsResponse:
    """Returns sessions, total laps, and participating drivers for an event."""
    # Find matching event in cached schedule
    events = get_events_for_year(year)
    matched = None
    for ev in events:
        if (
            str(ev.round_number) == str(event_name_or_round)
            or ev.event_name.lower() == event_name_or_round.lower()
            or event_name_or_round.lower() in ev.event_name.lower()
            or event_name_or_round.lower() in ev.location.lower()
        ):
            matched = ev
            break

    if not matched:
        matched = events[0] if events else EventInfo(
            round_number=1, country="Monaco", location="Monte Carlo",
            official_name="Monaco Grand Prix", event_name="Monaco Grand Prix",
            event_date=f"{year}-05-26", event_format="conventional"
        )

    # Standard session definitions based on event format
    is_sprint = "sprint" in matched.event_format.lower()
    if is_sprint:
        sessions = [
            SessionInfo(name="Practice 1", code="FP1", date=matched.event_date),
            SessionInfo(name="Sprint Qualifying", code="SQ", date=matched.event_date),
            SessionInfo(name="Sprint", code="S", date=matched.event_date),
            SessionInfo(name="Qualifying", code="Q", date=matched.event_date),
            SessionInfo(name="Race", code="R", date=matched.event_date),
        ]
    else:
        sessions = [
            SessionInfo(name="Practice 1", code="FP1", date=matched.event_date),
            SessionInfo(name="Practice 2", code="FP2", date=matched.event_date),
            SessionInfo(name="Practice 3", code="FP3", date=matched.event_date),
            SessionInfo(name="Qualifying", code="Q", date=matched.event_date),
            SessionInfo(name="Race", code="R", date=matched.event_date),
        ]

    # Official Grand Prix total laps defined by FIA Sporting Regulations for each venue
    OFFICIAL_CIRCUIT_LAPS = [
        # Match specific event names or locations first before broad country terms
        ([r"\blas vegas\b", r"\bvegas\b"], 50),
        ([r"\bmiami\b"], 57),
        ([r"\bunited states\b", r"\baustin\b", r"\bcota\b", r"\bamericas\b"], 56),
        ([r"\bemilia\b", r"\bimola\b", r"\bromagna\b"], 63),
        ([r"\bitalian\b", r"\bmonza\b"], 53),
        ([r"\bbahrain\b", r"\bsakhir\b"], 57),
        ([r"\bsaudi\b", r"\bjeddah\b"], 50),
        ([r"\baustralia\b", r"\baustralian\b", r"\bmelbourne\b", r"\balbert park\b"], 58),
        ([r"\bjapan\b", r"\bjapanese\b", r"\bsuzuka\b"], 53),
        ([r"\bchina\b", r"\bchinese\b", r"\bshanghai\b"], 56),
        ([r"\bmonaco\b", r"\bmonte carlo\b"], 78),
        ([r"\bcanada\b", r"\bcanadian\b", r"\bmontreal\b", r"\bmontréal\b", r"\bgilles\b"], 70),
        ([r"\bspain\b", r"\bspanish\b", r"\bbarcelona\b", r"\bcatalunya\b"], 66),
        ([r"\baustria\b", r"\baustrian\b", r"\bspielberg\b", r"\bred bull ring\b"], 71),
        ([r"\bbritish\b", r"\bsilverstone\b", r"\bgreat britain\b"], 52),
        ([r"\bhungary\b", r"\bhungarian\b", r"\bbudapest\b", r"\bhungaroring\b"], 70),
        ([r"\bbelgium\b", r"\bbelgian\b", r"\bspa\b", r"\bfrancorchamps\b"], 44),
        ([r"\bnetherlands\b", r"\bdutch\b", r"\bzandvoort\b"], 72),
        ([r"\bazerbaijan\b", r"\bbaku\b"], 51),
        ([r"\bsingapore\b", r"\bmarina bay\b"], 62),
        ([r"\bmexico\b", r"\bmexican\b", r"\bmexico city\b", r"\brodriguez\b"], 71),
        ([r"\bbrazil\b", r"\bbrazilian\b", r"\bsão paulo\b", r"\bsao paulo\b", r"\binterlagos\b"], 71),
        ([r"\bqatar\b", r"\blusail\b", r"\blosail\b"], 57),
        ([r"\babu dhabi\b", r"\byas marina\b", r"\byas island\b", r"\byas\b"], 58),
    ]

    event_str = matched.event_name.lower()
    loc_str = matched.location.lower()
    country_str = matched.country.lower()

    total_laps = 57
    # 1. Match event name
    for patterns, laps in OFFICIAL_CIRCUIT_LAPS:
        if any(re.search(p, event_str) for p in patterns):
            total_laps = laps
            break
    else:
        # 2. Match location
        for patterns, laps in OFFICIAL_CIRCUIT_LAPS:
            if any(re.search(p, loc_str) for p in patterns):
                total_laps = laps
                break
        else:
            # 3. Match country
            for patterns, laps in OFFICIAL_CIRCUIT_LAPS:
                if any(re.search(p, country_str) for p in patterns):
                    total_laps = laps
                    break

    from app.services.demo_data import OFFICIAL_DRIVERS
    drivers = [d["code"] for d in OFFICIAL_DRIVERS]

    return EventDetailsResponse(
        year=year,
        event_name=matched.event_name,
        location=matched.location,
        sessions=sessions,
        total_laps=total_laps,
        drivers=drivers,
    )


def load_fastf1_session(year: int, event_name: str, session_code: str):
    """
    Loads session via FastF1 with full caching.
    Resilient fallback if live timing weather feeds fail.
    """
    session = fastf1.get_session(year, event_name, session_code)
    try:
        session.load(telemetry=True, laps=True, weather=True, messages=False)
    except Exception as e:
        logger.warning(f"Full session.load failed for {year} {event_name}: {e}. Retrying with telemetry and laps only...")
        session.load(telemetry=True, laps=True, weather=False, messages=False)
    return session


def extract_circuit_turns(session, scale: float = 0.1) -> List[TurnMarker]:
    """
    Extracts corner markers from FastF1 circuit_info for any loaded Grand Prix session,
    translating and scaling X, Y, Z coordinates with the identical downsampling/scaling matrix
    used for the track centerline, and serializing them into TurnMarker models.
    """
    turns: List[TurnMarker] = []
    try:
        circuit_info = session.get_circuit_info()
        if circuit_info is not None and hasattr(circuit_info, "corners"):
            corners_df = circuit_info.corners
            if corners_df is not None and not corners_df.empty:
                for _, corner in corners_df.iterrows():
                    num = int(corner.get("Number", 0))
                    letter = str(corner.get("Letter", ""))
                    if pd.isna(letter) or letter == "nan":
                        letter = ""
                    name = f"Turn {num}" if not letter else f"Turn {num}{letter}"
                    # FastF1 coordinates in decimeters (1/10 meter)
                    raw_x = float(corner.get("X", 0.0))
                    raw_y = float(corner.get("Y", 0.0))
                    raw_z = float(corner.get("Z", 0.0)) if "Z" in corner and pd.notnull(corner["Z"]) else 0.0

                    angle_val = corner.get("Angle")
                    dist_val = corner.get("Distance")

                    turns.append(
                        TurnMarker(
                            number=num,
                            name=name,
                            x=round(raw_x * scale, 2),
                            y=round(raw_y * scale, 2),
                            z=round(raw_z * scale, 2),
                            angle=float(angle_val) if pd.notnull(angle_val) else None,
                            distance=round(float(dist_val), 1) if pd.notnull(dist_val) else None,
                        )
                    )
                logger.info(f"Successfully extracted {len(turns)} turns from FastF1 circuit info")
    except Exception as e:
        logger.warning(f"Failed to extract circuit corners from FastF1: {e}")

    return turns


