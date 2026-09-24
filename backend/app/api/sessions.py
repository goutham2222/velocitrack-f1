import logging
from typing import List
from fastapi import APIRouter, Query, HTTPException
from app.models.schemas import EventInfo, EventDetailsResponse, LapSummary
from app.services import fastf1_client

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
logger = logging.getLogger("velocitrack.api.sessions")


@router.get("/years", response_model=List[int])
def get_years():
    """Returns available F1 seasons (2018-present)."""
    return fastf1_client.get_available_years()


@router.get("/events", response_model=List[EventInfo])
def get_events(year: int = Query(2024, ge=2018, le=2026, description="F1 Season Year")):
    """Returns all Grand Prix events on the calendar for the selected year."""
    try:
        return fastf1_client.get_events_for_year(year)
    except Exception as e:
        logger.error(f"Failed to load events for year {year}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/details", response_model=EventDetailsResponse)
def get_details(
    year: int = Query(2024, ge=2018, le=2026),
    event: str = Query("Monaco Grand Prix", description="Event name or Round number"),
):
    """Returns sessions, total laps, and driver line-up for the chosen event."""
    try:
        return fastf1_client.get_event_details(year, event)
    except Exception as e:
        logger.error(f"Failed to load event details: {e}")
        raise HTTPException(status_code=500, detail=str(e))

