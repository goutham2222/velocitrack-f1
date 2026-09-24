import logging
import math
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from app.models.schemas import (
    CircuitGeometry,
    SectorBoundary,
    TurnMarker,
    DRSZone,
    DriverReplayStream,
    ReplayMetadata,
    ReplayPayload,
    WeatherSample,
)
from app.services.demo_data import OFFICIAL_DRIVERS, get_demo_replay

logger = logging.getLogger("velocitrack.interpolator")

# Team livery colors mapping for fallback
TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "Mercedes": "#27F4D2",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#0093CC",
    "Williams": "#64C4FF",
    "RB": "#6692FF",
    "AlphaTauri": "#6692FF",
    "Kick Sauber": "#52E252",
    "Alfa Romeo": "#C92D4B",
    "Haas F1 Team": "#B6BABD",
    "Haas": "#B6BABD",
}


def build_replay_payload_from_session(
    session,
    lap_start: int = 1,
    lap_end: int = 3,
    sampling_rate: int = 10,
) -> ReplayPayload:
    """
    Downsamples and interpolates multi-car telemetry from a FastF1 session
    onto a synchronized uniform time grid.
    """
    dt = 1.0 / sampling_rate
    laps_df = session.laps

    if laps_df is None or laps_df.empty:
        logger.warning("Session has no laps data, falling back to demo replay")
        return get_demo_replay(sampling_rate=sampling_rate, laps=lap_end - lap_start + 1)

    # 1. Circuit Geometry extraction from fastest lap
    fastest_lap = laps_df.pick_fastest()
    ref_telemetry = None
    if fastest_lap is not None and not fastest_lap.empty:
        try:
            ref_telemetry = fastest_lap.get_telemetry()
        except Exception as e:
            logger.warning(f"Failed to get fastest lap telemetry: {e}")

    circuit_geometry = None
    if ref_telemetry is not None and "X" in ref_telemetry and "Y" in ref_telemetry:
        raw_x = ref_telemetry["X"].dropna().to_numpy()
        raw_y = ref_telemetry["Y"].dropna().to_numpy()
        raw_z = ref_telemetry["Z"].dropna().to_numpy() if "Z" in ref_telemetry else np.zeros_like(raw_x)

        # Scale coordinates from FastF1 tenths-of-meters to meters if needed
        # FastF1 coordinates are in 1/10 meters (decimeters)
        scale = 0.1
        coords_x = (raw_x * scale).tolist()
        coords_y = (raw_y * scale).tolist()
        coords_z = (raw_z * scale).tolist()

        # Decimate for lightweight geometry payload (every 3rd point)
        step = max(1, len(coords_x) // 400)
        centerline = [
            [round(coords_x[i], 2), round(coords_y[i], 2), round(coords_z[i], 2)]
            for i in range(0, len(coords_x), step)
        ]

        total_track_length = float(ref_telemetry["Distance"].max() if "Distance" in ref_telemetry else 5000.0)

        # Corners from circuit info
        turns: List[TurnMarker] = []
        try:
            circuit_info = session.get_circuit_info()
            if circuit_info is not None and hasattr(circuit_info, "corners"):
                for _, corner in circuit_info.corners.iterrows():
                    turns.append(
                        TurnMarker(
                            number=int(corner.get("Number", 0)),
                            name=str(corner.get("Letter", corner.get("Number", ""))),
                            x=round(float(corner.get("X", 0.0)) * scale, 2),
                            y=round(float(corner.get("Y", 0.0)) * scale, 2),
                            z=0.0,
                            angle=float(corner.get("Angle", 0.0)) if "Angle" in corner else None,
                            distance=round(float(corner.get("Distance", 0.0)), 1),
                        )
                    )
        except Exception as e:
            logger.debug(f"Circuit corners not available from FastF1: {e}")

        sectors = [
            SectorBoundary(sector=1, start_distance=0.0, end_distance=total_track_length * 0.33),
            SectorBoundary(sector=2, start_distance=total_track_length * 0.33, end_distance=total_track_length * 0.67),
            SectorBoundary(sector=3, start_distance=total_track_length * 0.67, end_distance=total_track_length),
        ]

        circuit_geometry = CircuitGeometry(
            circuit_name=str(session.event.get("EventName", "Grand Prix")),
            rotation=0.0,
            centerline=centerline,
            sectors=sectors,
            turns=turns,
            drs_zones=[
                DRSZone(
                    id=1,
                    activation_distance=total_track_length * 0.95,
                    end_distance=total_track_length * 0.05,
                )
            ],
            track_length_m=round(total_track_length, 1),
        )

    # 2. Determine Session Time Window for Requested Laps
    target_laps = laps_df[
        (laps_df["LapNumber"] >= lap_start) & (laps_df["LapNumber"] <= lap_end)
    ]
    if target_laps.empty:
        target_laps = laps_df[laps_df["LapNumber"] <= 2]

    # Time boundaries in seconds (SessionTime timedelta -> seconds)
    t_start_delta = target_laps["LapStartTime"].dropna().min()
    t_end_delta = target_laps["Time"].dropna().max()

    t_start = t_start_delta.total_seconds() if hasattr(t_start_delta, "total_seconds") else 0.0
    t_end = t_end_delta.total_seconds() if hasattr(t_end_delta, "total_seconds") else (t_start + 180.0)

    duration = max(10.0, t_end - t_start)
    # Cap single query duration to 300s (5 minutes) for bandwidth safety
    if duration > 400.0:
        duration = 400.0
        t_end = t_start + duration

    num_frames = int(duration * sampling_rate)
    uniform_grid = np.linspace(t_start, t_end, num_frames)
    timestamps = [round(i * dt, 2) for i in range(num_frames)]

    # 3. Synchronize drivers
    drivers_dict: Dict[str, DriverReplayStream] = {}
    participating_drivers = session.drivers

    scale = 0.1  # FastF1 decimeters to meters

    for drv_id in participating_drivers:
        try:
            drv_laps = target_laps.pick_driver(drv_id)
            if drv_laps.empty:
                continue

            drv_telemetry = drv_laps.get_telemetry()
            if drv_telemetry.empty or "SessionTime" not in drv_telemetry:
                continue

            # Convert SessionTime to float seconds
            tel_times = drv_telemetry["SessionTime"].dt.total_seconds().to_numpy()
            if len(tel_times) < 2:
                continue

            # Driver metadata
            drv_info = session.get_driver(drv_id)
            code = str(drv_info.get("Abbreviation", drv_id))
            num = int(drv_info.get("DriverNumber", 0))
            full_name = f"{drv_info.get('FirstName', '')} {drv_info.get('LastName', '')}".strip() or code
            team = str(drv_info.get("TeamName", "Unknown Team"))
            color = TEAM_COLORS.get(team, "#FFFFFF")
            if "TeamColor" in drv_info and drv_info["TeamColor"]:
                color = f"#{drv_info['TeamColor']}"

            # Continuous channels
            x_raw = (drv_telemetry["X"].to_numpy() * scale) if "X" in drv_telemetry else np.zeros_like(tel_times)
            y_raw = (drv_telemetry["Y"].to_numpy() * scale) if "Y" in drv_telemetry else np.zeros_like(tel_times)
            z_raw = (drv_telemetry["Z"].to_numpy() * scale) if "Z" in drv_telemetry else np.zeros_like(tel_times)
            spd_raw = drv_telemetry["Speed"].to_numpy() if "Speed" in drv_telemetry else np.zeros_like(tel_times)
            rpm_raw = drv_telemetry["RPM"].to_numpy() if "RPM" in drv_telemetry else np.zeros_like(tel_times)
            thr_raw = drv_telemetry["Throttle"].to_numpy() if "Throttle" in drv_telemetry else np.zeros_like(tel_times)
            brk_raw = drv_telemetry["Brake"].astype(float).to_numpy() if "Brake" in drv_telemetry else np.zeros_like(tel_times)
            dist_raw = drv_telemetry["Distance"].to_numpy() if "Distance" in drv_telemetry else np.zeros_like(tel_times)

            # Interpolate onto uniform grid
            x_interp = np.interp(uniform_grid, tel_times, x_raw)
            y_interp = np.interp(uniform_grid, tel_times, y_raw)
            z_interp = np.interp(uniform_grid, tel_times, z_raw)
            spd_interp = np.interp(uniform_grid, tel_times, spd_raw)
            rpm_interp = np.interp(uniform_grid, tel_times, rpm_raw).astype(int)
            thr_interp = np.interp(uniform_grid, tel_times, thr_raw)
            brk_interp = np.interp(uniform_grid, tel_times, brk_raw)
            dist_interp = np.interp(uniform_grid, tel_times, dist_raw)

            # Nearest-neighbor for discrete channels
            gear_raw = drv_telemetry["nGear"].fillna(0).to_numpy() if "nGear" in drv_telemetry else np.ones_like(tel_times)
            drs_raw = drv_telemetry["DRS"].fillna(0).to_numpy() if "DRS" in drv_telemetry else np.zeros_like(tel_times)

            nearest_indices = np.searchsorted(tel_times, uniform_grid, side="left")
            nearest_indices = np.clip(nearest_indices, 0, len(tel_times) - 1)

            gear_interp = gear_raw[nearest_indices].astype(int).tolist()
            drs_interp = drs_raw[nearest_indices].astype(int).tolist()

            # Compound and tyre life
            compound_val = str(drv_laps.iloc[0].get("Compound", "MEDIUM"))
            tyre_life_val = int(drv_laps.iloc[0].get("TyreLife", 10))

            drivers_dict[code] = DriverReplayStream(
                code=code,
                number=num,
                full_name=full_name,
                team=team,
                team_color=color,
                x=[round(float(v), 2) for v in x_interp],
                y=[round(float(v), 2) for v in y_interp],
                z=[round(float(v), 2) for v in z_interp],
                speed=[round(float(v), 1) for v in spd_interp],
                rpm=[int(v) for v in rpm_interp],
                gear=gear_interp,
                throttle=[round(float(v), 1) for v in thr_interp],
                brake=[round(float(v), 1) for v in brk_interp],
                drs=drs_interp,
                distance=[round(float(v), 1) for v in dist_interp],
                lap=[lap_start] * num_frames,
                compound=[compound_val] * num_frames,
                tyre_life=[tyre_life_val] * num_frames,
                pit_status=["TRACK"] * num_frames,
            )
        except Exception as e:
            logger.warning(f"Error processing driver {drv_id}: {e}")

    # Fallback to demo if drivers list is empty
    if not drivers_dict or circuit_geometry is None:
        return get_demo_replay(sampling_rate=sampling_rate, laps=lap_end - lap_start + 1)

    # 4. Weather extraction
    weather_samples = [
        WeatherSample(
            timestamp=0.0,
            air_temp=25.0,
            track_temp=42.0,
            humidity=55.0,
            wind_speed=8.0,
            wind_direction=180.0,
            track_status="1",
            status_text="GREEN FLAG",
        )
    ]
    if hasattr(session, "weather_data") and session.weather_data is not None and not session.weather_data.empty:
        try:
            w_df = session.weather_data
            for _, row in w_df.head(5).iterrows():
                time_sec = row["Time"].total_seconds() if hasattr(row["Time"], "total_seconds") else 0.0
                rel_sec = max(0.0, time_sec - t_start)
                if rel_sec <= duration:
                    weather_samples.append(
                        WeatherSample(
                            timestamp=round(rel_sec, 1),
                            air_temp=float(row.get("AirTemp", 25.0)),
                            track_temp=float(row.get("TrackTemp", 40.0)),
                            humidity=float(row.get("Humidity", 50.0)),
                            wind_speed=float(row.get("WindSpeed", 5.0)),
                            wind_direction=float(row.get("WindDirection", 0.0)),
                            track_status="1",
                            status_text="GREEN FLAG",
                        )
                    )
        except Exception as e:
            logger.debug(f"Failed to parse weather: {e}")

    metadata = ReplayMetadata(
        year=int(session.event.get("Year", 2024)),
        event_name=str(session.event.get("EventName", "Grand Prix")),
        session_name=str(session.name),
        circuit_name=circuit_geometry.circuit_name,
        total_frames=num_frames,
        time_step=dt,
        duration_seconds=round(duration, 2),
        start_session_time=round(t_start, 2),
        end_session_time=round(t_end, 2),
        lap_start=lap_start,
        lap_end=lap_end,
        total_laps=len(laps_df["LapNumber"].unique()),
    )

    return ReplayPayload(
        metadata=metadata,
        circuit=circuit_geometry,
        timestamps=timestamps,
        drivers=drivers_dict,
        weather=weather_samples,
    )

