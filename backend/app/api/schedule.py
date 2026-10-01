from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, HTTPException, Path
from app.models.schemas import EventInfo
from app.services import fastf1_client

router = APIRouter(prefix="/api", tags=["schedule"])


@router.get("/seasons", response_model=List[int])
def get_seasons():
    """
    Returns available F1 seasons dynamically from 2018 through the current calendar year.
    """
    return fastf1_client.get_available_years()


@router.get("/schedule/{year}", response_model=List[EventInfo])
def get_schedule(year: int = Path(..., ge=2018, description="F1 Season Year")):
    """
    Returns the event schedule for the requested season year, flagging upcoming vs completed rounds.
    """
    try:
        return fastf1_client.get_events_for_year(year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
