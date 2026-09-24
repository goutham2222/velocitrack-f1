import math
import numpy as np
from typing import Dict, List, Tuple
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

# ---------------------------------------------------------------------------
# Official F1 Driver & Team Roster (2024-2026 Liveries)
# ---------------------------------------------------------------------------
OFFICIAL_DRIVERS = [
    {"code": "VER", "number": 1, "name": "Max Verstappen", "team": "Red Bull Racing", "color": "#3671C6"},
    {"code": "NOR", "number": 4, "name": "Lando Norris", "team": "McLaren", "color": "#FF8000"},
    {"code": "LEC", "number": 16, "name": "Charles Leclerc", "team": "Ferrari", "color": "#E8002D"},
    {"code": "PIA", "number": 81, "name": "Oscar Piastri", "team": "McLaren", "color": "#FF8000"},
    {"code": "SAI", "number": 55, "name": "Carlos Sainz", "team": "Ferrari", "color": "#E8002D"},
    {"code": "HAM", "number": 44, "name": "Lewis Hamilton", "team": "Mercedes", "color": "#27F4D2"},
    {"code": "RUS", "number": 63, "name": "George Russell", "team": "Mercedes", "color": "#27F4D2"},
    {"code": "PER", "number": 11, "name": "Sergio Perez", "team": "Red Bull Racing", "color": "#3671C6"},
    {"code": "ALO", "number": 14, "name": "Fernando Alonso", "team": "Aston Martin", "color": "#229971"},
    {"code": "TSU", "number": 22, "name": "Yuki Tsunoda", "team": "RB", "color": "#6692FF"},
    {"code": "STR", "number": 18, "name": "Lance Stroll", "team": "Aston Martin", "color": "#229971"},
    {"code": "HUL", "number": 27, "name": "Nico Hulkenberg", "team": "Haas", "color": "#B6BABD"},
    {"code": "RIC", "number": 3, "name": "Daniel Ricciardo", "team": "RB", "color": "#6692FF"},
    {"code": "ALB", "number": 23, "name": "Alexander Albon", "team": "Williams", "color": "#64C4FF"},
    {"code": "OCO", "number": 31, "name": "Esteban Ocon", "team": "Alpine", "color": "#0093CC"},
    {"code": "GAS", "number": 10, "name": "Pierre Gasly", "team": "Alpine", "color": "#0093CC"},
    {"code": "MAG", "number": 20, "name": "Kevin Magnussen", "team": "Haas", "color": "#B6BABD"},
    {"code": "BOT", "number": 77, "name": "Valtteri Bottas", "team": "Kick Sauber", "color": "#52E252"},
    {"code": "ZHO", "number": 24, "name": "Guanyu Zhou", "team": "Kick Sauber", "color": "#52E252"},
    {"code": "SAR", "number": 2, "name": "Logan Sargeant", "team": "Williams", "color": "#64C4FF"},
]

# Monaco Circuit Key Waypoints (normalized scale in meters, with real elevation Z)
# Track length ~3337 meters
MONACO_WAYPOINTS = [
    # Start / Finish Straight (Pit Straight)
    {"x": 0.0, "y": 0.0, "z": 0.0, "turn": None},
    {"x": 120.0, "y": 30.0, "z": 0.5, "turn": None},
    {"x": 220.0, "y": 60.0, "z": 1.2, "turn": {"num": 1, "name": "Sainte Dévote"}},
    # Beau Rivage Climb
    {"x": 280.0, "y": 160.0, "z": 12.0, "turn": None},
    {"x": 310.0, "y": 280.0, "z": 28.0, "turn": None},
    {"x": 320.0, "y": 420.0, "z": 41.0, "turn": {"num": 2, "name": "Massenet"}},
    # Casino Square
    {"x": 280.0, "y": 490.0, "z": 44.0, "turn": {"num": 3, "name": "Casino Square"}},
    {"x": 220.0, "y": 480.0, "z": 42.0, "turn": None},
    # Mirabeau Haute
    {"x": 170.0, "y": 440.0, "z": 38.0, "turn": {"num": 4, "name": "Mirabeau Haute"}},
    # Grand Hotel (Fairplay) Hairpin - Steepest descent & tightest corner
    {"x": 120.0, "y": 430.0, "z": 30.0, "turn": None},
    {"x": 80.0, "y": 450.0, "z": 24.0, "turn": {"num": 5, "name": "Fairmont Hairpin"}},
    {"x": 110.0, "y": 470.0, "z": 20.0, "turn": None},
    # Mirabeau Bas
    {"x": 160.0, "y": 460.0, "z": 16.0, "turn": {"num": 6, "name": "Mirabeau Bas"}},
    # Portier
    {"x": 210.0, "y": 440.0, "z": 12.0, "turn": {"num": 7, "name": "Portier"}},
    {"x": 240.0, "y": 390.0, "z": 8.0, "turn": {"num": 8, "name": "Portier Out"}},
    # The Tunnel
    {"x": 220.0, "y": 290.0, "z": 5.0, "turn": None},
    {"x": 180.0, "y": 180.0, "z": 3.0, "turn": None},
    {"x": 120.0, "y": 100.0, "z": 2.0, "turn": None},
    # Nouvelle Chicane
    {"x": 60.0, "y": 40.0, "z": 1.5, "turn": {"num": 9, "name": "Nouvelle Chicane"}},
    {"x": 40.0, "y": 20.0, "z": 1.5, "turn": {"num": 10, "name": "Chicane Exit"}},
    # Tabac
    {"x": -40.0, "y": -40.0, "z": 1.0, "turn": {"num": 11, "name": "Tabac"}},
    # Louis Chiron / Piscine (Swimming Pool)
    {"x": -100.0, "y": -110.0, "z": 1.0, "turn": {"num": 12, "name": "Louis Chiron"}},
    {"x": -140.0, "y": -170.0, "z": 1.0, "turn": {"num": 13, "name": "Piscine In"}},
    {"x": -170.0, "y": -220.0, "z": 1.0, "turn": {"num": 14, "name": "Piscine Out"}},
    {"x": -180.0, "y": -280.0, "z": 1.0, "turn": {"num": 15, "name": "Piscine Chicane"}},
    {"x": -170.0, "y": -330.0, "z": 1.0, "turn": {"num": 16, "name": "Piscine Exit"}},
    # La Rascasse
    {"x": -130.0, "y": -350.0, "z": 1.0, "turn": {"num": 17, "name": "La Rascasse"}},
    {"x": -80.0, "y": -310.0, "z": 0.5, "turn": {"num": 18, "name": "Rascasse Exit"}},
    # Anthony Noghès
    {"x": -40.0, "y": -220.0, "z": 0.0, "turn": {"num": 19, "name": "Anthony Noghès"}},
    {"x": -10.0, "y": -100.0, "z": 0.0, "turn": None},
]


def generate_monaco_circuit() -> Tuple[CircuitGeometry, np.ndarray, np.ndarray, float]:
    """
    Interpolates a continuous, smooth 3D spline centerline for Monaco Circuit.
    Returns: CircuitGeometry, dense points (N, 3), cumulative distances, total length.
    """
    pts = np.array([[wp["x"], wp["y"], wp["z"]] for wp in MONACO_WAYPOINTS])
    # Close track loop
    pts = np.vstack([pts, pts[0]])

    # Parametric spline interpolation
    from scipy.interpolate import splprep, splev

    tck, u = splprep([pts[:, 0], pts[:, 1], pts[:, 2]], s=0, per=True, k=3)
    dense_u = np.linspace(0, 1, 1000)
    dense_x, dense_y, dense_z = splev(dense_u, tck)
    dense_points = np.column_stack([dense_x, dense_y, dense_z])

    # Calculate cumulative distance along spline
    deltas = np.diff(dense_points, axis=0)
    seg_lengths = np.linalg.norm(deltas, axis=1)
    cum_dist = np.insert(np.cumsum(seg_lengths), 0, 0.0)
    total_length = cum_dist[-1]

    # Map turns
    turns: List[TurnMarker] = []
    for wp in MONACO_WAYPOINTS:
        if wp["turn"] is not None:
            # find closest point on dense centerline
            wpt = np.array([wp["x"], wp["y"], wp["z"]])
            idx = int(np.argmin(np.linalg.norm(dense_points - wpt, axis=1)))
            turns.append(
                TurnMarker(
                    number=wp["turn"]["num"],
                    name=wp["turn"]["name"],
                    x=float(dense_points[idx, 0]),
                    y=float(dense_points[idx, 1]),
                    z=float(dense_points[idx, 2]),
                    distance=float(cum_dist[idx]),
                )
            )

    sectors = [
        SectorBoundary(sector=1, start_distance=0.0, end_distance=total_length * 0.33),
        SectorBoundary(sector=2, start_distance=total_length * 0.33, end_distance=total_length * 0.68),
        SectorBoundary(sector=3, start_distance=total_length * 0.68, end_distance=total_length),
    ]

    drs_zones = [
        DRSZone(
            id=1,
            detection_distance=total_length * 0.95,
            activation_distance=total_length * 0.98,
            end_distance=total_length * 0.06,
        )
    ]

    centerline_list = [[round(p[0], 2), round(p[1], 2), round(p[2], 2)] for p in dense_points[::2]]

    geometry = CircuitGeometry(
        circuit_name="Circuit de Monaco",
        rotation=0.0,
        centerline=centerline_list,
        sectors=sectors,
        turns=turns,
        drs_zones=drs_zones,
        track_length_m=round(total_length, 1),
    )
    return geometry, dense_points, cum_dist, total_length


def get_demo_replay(sampling_rate: int = 10, laps: int = 2) -> ReplayPayload:
    """
    Generates a high-precision multi-car synchronized replay payload for Monaco GP.
    Provides 20 official drivers with realistic braking, throttle, speed, and gap deltas.
    """
    circuit, dense_pts, cum_dist, track_length = generate_monaco_circuit()

    # Lap time ~74 seconds (1:14.000 for leader)
    base_lap_time = 74.0
    dt = 1.0 / sampling_rate
    total_time = laps * base_lap_time
    total_frames = int(total_time * sampling_rate)
    timestamps = [round(i * dt, 2) for i in range(total_frames)]

    # Compute curvature-based target speed profile along track
    num_dense = len(dense_pts)
    curvatures = np.zeros(num_dense)
    for i in range(1, num_dense - 1):
        p_prev = dense_pts[i - 1][:2]
        p_curr = dense_pts[i][:2]
        p_next = dense_pts[i + 1][:2]
        v1 = p_curr - p_prev
        v2 = p_next - p_curr
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 > 1e-4 and norm2 > 1e-4:
            cos_a = np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0)
            angle = math.acos(cos_a)
            curvatures[i] = angle / ((norm1 + norm2) * 0.5)

    # Smooth curvature
    curvatures = np.convolve(curvatures, np.ones(11) / 11, mode="same")

    # Map curvature to base cornering speed (65 km/h hairpin, 280 km/h straight)
    speed_profile_kmh = 285.0 - (curvatures * 7500.0)
    speed_profile_kmh = np.clip(speed_profile_kmh, 60.0, 290.0)

    # Generate telemetry for each driver
    drivers_data: Dict[str, DriverReplayStream] = {}

    for rank, driver_meta in enumerate(OFFICIAL_DRIVERS):
        # Driver pace factor (Verstappen/Norris slightly faster, backmarkers slightly slower)
        pace_delta = rank * 0.18 + (math.sin(rank * 1.5) * 0.08)
        driver_lap_time = base_lap_time + pace_delta
        # Initial track position offset at Lap 1 (staggered grid start: ~8m per car)
        initial_distance_offset = -(rank * 12.0)

        # Preallocate arrays
        x_arr = []
        y_arr = []
        z_arr = []
        speed_arr = []
        rpm_arr = []
        gear_arr = []
        throttle_arr = []
        brake_arr = []
        drs_arr = []
        dist_arr = []
        lap_arr = []
        compound_arr = []
        tyre_life_arr = []
        pit_arr = []

        curr_dist = initial_distance_offset
        current_lap = 1
        compound = "MEDIUM" if rank % 2 == 0 else "HARD"
        if rank == 2:  # Leclerc on Softs
            compound = "SOFT"

        for f_idx in range(total_frames):
            t = timestamps[f_idx]

            # Calculate lap and lap distance
            normalized_dist = (curr_dist % track_length)
            if normalized_dist < 0:
                normalized_dist += track_length

            current_lap = max(1, int(curr_dist // track_length) + 1)

            # Find closest centerline index
            cl_idx = int(np.searchsorted(cum_dist, normalized_dist, side="left"))
            cl_idx = min(cl_idx, num_dense - 1)

            # Position with slight lateral racing line variation
            pos = dense_pts[cl_idx].copy()
            # Slight racing line offset based on driver number
            lateral_offset = (math.sin(t * 0.5 + rank) * 0.4)
            pos[0] += lateral_offset
            pos[1] += lateral_offset * 0.5

            # Speed calculation based on track position
            raw_spd = speed_profile_kmh[cl_idx] + (math.cos(t * 0.2 + rank) * 3.0)
            spd = max(55.0, min(295.0, raw_spd))

            # Move distance forward for next frame
            curr_dist += (spd / 3.6) * dt

            # Compute Gear and RPM
            if spd < 75:
                gear = 1
            elif spd < 115:
                gear = 2
            elif spd < 155:
                gear = 3
            elif spd < 195:
                gear = 4
            elif spd < 235:
                gear = 5
            elif spd < 265:
                gear = 6
            elif spd < 285:
                gear = 7
            else:
                gear = 8

            gear_base_spd = [0, 50, 95, 135, 175, 215, 250, 275, 290]
            spd_in_gear = max(0.0, spd - gear_base_spd[gear])
            rpm = int(10500 + (spd_in_gear / 40.0) * 2000)
            rpm = max(10000, min(13000, rpm))

            # Compute Throttle & Brake
            # If deceleration is happening (e.g. into braking zone)
            next_idx = min(cl_idx + 15, num_dense - 1)
            future_spd = speed_profile_kmh[next_idx]
            if future_spd < spd - 15.0:
                brake = round(min(100.0, (spd - future_spd) * 2.5), 1)
                throttle = 0.0
            else:
                brake = 0.0
                throttle = round(min(100.0, (spd / 280.0) * 100.0), 1)

            # DRS Zone (Main straight: normalized_dist > 95% or < 6%)
            is_drs_zone = (normalized_dist > track_length * 0.96) or (normalized_dist < track_length * 0.05)
            drs_state = 12 if (is_drs_zone and spd > 200) else (1 if is_drs_zone else 0)

            # Tyre Life
            tyre_life = 8 + current_lap

            # Append to driver streams
            x_arr.append(round(float(pos[0]), 2))
            y_arr.append(round(float(pos[1]), 2))
            z_arr.append(round(float(pos[2]), 2))
            speed_arr.append(round(float(spd), 1))
            rpm_arr.append(rpm)
            gear_arr.append(gear)
            throttle_arr.append(throttle)
            brake_arr.append(brake)
            drs_arr.append(drs_state)
            dist_arr.append(round(float(curr_dist), 1))
            lap_arr.append(current_lap)
            compound_arr.append(compound)
            tyre_life_arr.append(tyre_life)
            pit_arr.append("TRACK")

        drivers_data[driver_meta["code"]] = DriverReplayStream(
            code=driver_meta["code"],
            number=driver_meta["number"],
            full_name=driver_meta["name"],
            team=driver_meta["team"],
            team_color=driver_meta["color"],
            x=x_arr,
            y=y_arr,
            z=z_arr,
            speed=speed_arr,
            rpm=rpm_arr,
            gear=gear_arr,
            throttle=throttle_arr,
            brake=brake_arr,
            drs=drs_arr,
            distance=dist_arr,
            lap=lap_arr,
            compound=compound_arr,
            tyre_life=tyre_life_arr,
            pit_status=pit_arr,
        )

    # Weather & Race Control simulation
    weather_samples = [
        WeatherSample(
            timestamp=0.0,
            air_temp=24.2,
            track_temp=39.8,
            humidity=58.0,
            wind_speed=6.4,
            wind_direction=195.0,
            track_status="1",
            status_text="GREEN FLAG",
        ),
        WeatherSample(
            timestamp=round(total_time * 0.45, 1),
            air_temp=24.4,
            track_temp=40.2,
            humidity=57.0,
            wind_speed=7.1,
            wind_direction=200.0,
            track_status="2",
            status_text="YELLOW FLAG - SECTOR 2",
        ),
        WeatherSample(
            timestamp=round(total_time * 0.60, 1),
            air_temp=24.5,
            track_temp=40.0,
            humidity=57.0,
            wind_speed=6.8,
            wind_direction=198.0,
            track_status="1",
            status_text="TRACK CLEAR - GREEN FLAG",
        ),
    ]

    metadata = ReplayMetadata(
        year=2024,
        event_name="Monaco Grand Prix",
        session_name="Race",
        circuit_name="Circuit de Monaco",
        total_frames=total_frames,
        time_step=dt,
        duration_seconds=round(total_time, 2),
        start_session_time=0.0,
        end_session_time=round(total_time, 2),
        lap_start=1,
        lap_end=laps,
        total_laps=78,
    )

    return ReplayPayload(
        metadata=metadata,
        circuit=circuit,
        timestamps=timestamps,
        drivers=drivers_data,
        weather=weather_samples,
    )

