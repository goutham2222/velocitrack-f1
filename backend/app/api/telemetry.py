import asyncio
import json
import logging
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ReplayPayload
from app.services import demo_data, fastf1_client, interpolator

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])
logger = logging.getLogger("velocitrack.api.telemetry")


@router.get("/demo", response_model=ReplayPayload)
def get_demo_replay(
    sampling_rate: int = Query(10, ge=2, le=20, description="Hz downsampling frequency"),
    laps: int = Query(2, ge=1, le=5, description="Number of laps to replay"),
):
    """
    Returns an instant, pre-computed high-fidelity Monaco Grand Prix replay
    with 20 synchronized drivers, realistic 3D elevation, kerbs, and race telemetry.
    Zero-wait cold start.
    """
    return demo_data.get_demo_replay(sampling_rate=sampling_rate, laps=laps)


@router.get("/replay", response_model=ReplayPayload)
def get_session_replay(
    year: int = Query(2024, ge=2018, le=2026),
    event: str = Query("Monaco Grand Prix"),
    session: str = Query("R", description="Session code: FP1, FP2, FP3, Q, S, R"),
    lap_start: int = Query(1, ge=1, le=100),
    lap_end: int = Query(2, ge=1, le=100),
    sampling_rate: int = Query(10, ge=2, le=20),
):
    """
    Fetches raw telemetry via FastF1, caches it to disk, downsamples to 5-10 Hz,
    and returns aligned multi-car telemetry for the requested lap range.
    Falls back gracefully to high-fi simulation if data is unavailable.
    """
    try:
        f1_session = fastf1_client.load_fastf1_session(year, event, session)
        return interpolator.build_replay_payload_from_session(
            f1_session,
            lap_start=lap_start,
            lap_end=lap_end,
            sampling_rate=sampling_rate,
        )
    except Exception as e:
        logger.warning(f"FastF1 session load failed for {year} {event} {session}: {e}. Returning demo simulation.")
        return demo_data.get_demo_replay(sampling_rate=sampling_rate, laps=max(1, lap_end - lap_start + 1))


@router.get("/stream")
async def stream_live_telemetry(
    sampling_rate: int = Query(10, ge=2, le=20),
    laps: int = Query(2, ge=1, le=5),
):
    """
    Streams synchronized telemetry frames over Server-Sent Events (SSE).
    Simulates real-time broadcast timing feed for live telemetry clients.
    """
    payload = demo_data.get_demo_replay(sampling_rate=sampling_rate, laps=laps)
    dt = 1.0 / sampling_rate

    async def event_generator():
        # First send session metadata & circuit geometry
        meta_event = {
            "type": "init",
            "metadata": payload.metadata.model_dump(),
            "circuit": payload.circuit.model_dump(),
        }
        yield f"data: {json.dumps(meta_event)}\n\n"
        await asyncio.sleep(0.05)

        total_frames = payload.metadata.total_frames
        # Stream frames
        for frame_idx in range(total_frames):
            frame_data = {
                "type": "frame",
                "frame_index": frame_idx,
                "timestamp": payload.timestamps[frame_idx],
                "drivers": {
                    drv: {
                        "x": payload.drivers[drv].x[frame_idx],
                        "y": payload.drivers[drv].y[frame_idx],
                        "z": payload.drivers[drv].z[frame_idx],
                        "speed": payload.drivers[drv].speed[frame_idx],
                        "rpm": payload.drivers[drv].rpm[frame_idx],
                        "gear": payload.drivers[drv].gear[frame_idx],
                        "throttle": payload.drivers[drv].throttle[frame_idx],
                        "brake": payload.drivers[drv].brake[frame_idx],
                        "drs": payload.drivers[drv].drs[frame_idx],
                        "distance": payload.drivers[drv].distance[frame_idx],
                        "lap": payload.drivers[drv].lap[frame_idx],
                        "compound": payload.drivers[drv].compound[frame_idx],
                        "tyre_life": payload.drivers[drv].tyre_life[frame_idx],
                    }
                    for drv in payload.drivers
                },
            }
            yield f"data: {json.dumps(frame_data)}\n\n"
            await asyncio.sleep(dt)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

