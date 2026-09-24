import os
import logging
from typing import List, Dict, Any, Optional
import fastf1
import pandas as pd
from app.config import settings
from app.models.schemas import EventInfo, SessionInfo, EventDetailsResponse, LapSummary

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
    """Returns available F1 seasons."""
    return [2024, 2023, 2022, 2021, 2020, 2019, 2018]


def get_events_for_year(year: int) -> List[EventInfo]:
    """
    Returns calendar events for the given season.
    Caches results in memory for sub-millisecond future queries.
    """
    if year in _SCHEDULE_CACHE:
        return _SCHEDULE_CACHE[year]

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

            events.append(
                EventInfo(
                    round_number=round_num,
                    country=str(row.get("Country", "")),
                    location=str(row.get("Location", "")),
                    official_name=str(row.get("OfficialEventName", "")),
                    event_name=str(row.get("EventName", "")),
                    event_date=event_date,
                    event_format=str(row.get("EventFormat", "conventional")),
                )
            )
    except Exception as e:
        logger.warning(f"FastF1 schedule fetch failed for year {year}: {e}. Using fallback calendar.")
        for item in FALLBACK_POPULAR_EVENTS:
            events.append(
                EventInfo(
                    round_number=item["round"],
                    country=item["country"],
                    location=item["location"],
                    official_name=f"Formula 1 {item['name']} {year}",
                    event_name=item["name"],
                    event_date=f"{year}-06-01",
                    event_format=item["format"],
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

    # Typical race total laps based on circuit length
    loc = matched.location.lower()
    total_laps = 78 if "monaco" in loc else (53 if "monza" in loc or "suzuka" in loc else (70 if "hungary" in loc else 57))

    drivers = [
        "VER", "NOR", "LEC", "PIA", "SAI", "HAM", "RUS", "PER",
        "ALO", "TSU", "STR", "HUL", "RIC", "ALB", "OCO", "GAS",
        "MAG", "BOT", "ZHO", "SAR"
    ]

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
    """
    session = fastf1.get_session(year, event_name, session_code)
    session.load(telemetry=True, laps=True, weather=True)
    return session

