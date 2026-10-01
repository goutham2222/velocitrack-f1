import logging
import math
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from scipy.spatial import cKDTree
from app.models.schemas import (
    CircuitGeometry,
    SectorBoundary,
    TurnMarker,
    DRSZone,
    DriverReplayStream,
    OfficialResult,
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


def generate_pit_lane(
    centerline: List[List[float]],
    track_length: float,
    session=None,
    scale: float = 0.1,
    offset_dist: Optional[float] = None,
) -> List[List[float]]:
    """
    Synthesizes authentic pit lane road geometry alongside the start/finish straight.
    Detects lateral pit side from real pit telemetry if available; otherwise uses a
    standard parallel offset with smooth cosine entry and exit tapers.
    """
    if not centerline or len(centerline) < 3 or track_length <= 0:
        return []

    pts = np.array(centerline)
    N = len(pts)
    diffs = np.diff(pts, axis=0, append=pts[:1])
    seg_lens = np.linalg.norm(diffs, axis=1)
    cum_dists = np.concatenate([[0.0], np.cumsum(seg_lens)[:-1]])

    if offset_dist is None:
        offset_dist = 14.0
        # If session has pit telemetry, detect which side (normal sign) the pit lane is on
        if session is not None and hasattr(session, "laps") and session.laps is not None and not session.laps.empty:
            try:
                pit_laps = session.laps[session.laps["PitInTime"].notna()]
                if not pit_laps.empty:
                    sample_lap = pit_laps.iloc[0]
                    p_in = sample_lap["PitInTime"].total_seconds() if hasattr(sample_lap["PitInTime"], "total_seconds") else None
                    if p_in is not None:
                        tel = sample_lap.get_telemetry()
                        if not tel.empty and "SessionTime" in tel and "X" in tel and "Y" in tel:
                            t = tel["SessionTime"].dt.total_seconds().to_numpy()
                            mask = (t >= p_in) & (t <= p_in + 20.0)
                            pit_pts = tel[mask]
                            if len(pit_pts) >= 5:
                                px = pit_pts["X"].to_numpy() * scale
                                py = pit_pts["Y"].to_numpy() * scale
                                p0 = np.array(centerline[0][:2])
                                p1 = np.array(centerline[1][:2])
                                t_dir = (p1 - p0) / max(1e-3, float(np.hypot(p1[0] - p0[0], p1[1] - p0[1])))
                                norm_2d = np.array([-t_dir[1], t_dir[0]])
                                diffs_xy = np.column_stack([px - p0[0], py - p0[1]])
                                dots = np.dot(diffs_xy, norm_2d)
                                med_dot = float(np.median(dots))
                                if abs(med_dot) > 3.0:
                                    offset_dist = 14.0 if med_dot > 0 else -14.0
            except Exception as e:
                logger.debug(f"Pit sign detection fallback: {e}")

    # Start line is at index 0 (s = 0.0 and s = track_length)
    entry_s = max(0.0, track_length - 280.0)
    exit_s = min(track_length, 220.0)

    s_before = np.linspace(entry_s, track_length, 45, endpoint=False)
    s_after = np.linspace(0.0, exit_s, 35, endpoint=True)
    pit_s_vals = np.concatenate([s_before, s_after])

    pit_points = []
    for s in pit_s_vals:
        idx = int(np.searchsorted(cum_dists, s, side="right")) - 1
        idx = max(0, min(N - 1, idx))
        next_idx = (idx + 1) % N

        d0 = cum_dists[idx]
        seg_len = max(1e-3, seg_lens[idx])
        alpha = max(0.0, min(1.0, (s - d0) / seg_len))

        base_pt = (1.0 - alpha) * pts[idx] + alpha * pts[next_idx]

        tangent = pts[next_idx][:2] - pts[idx][:2]
        t_len = float(np.linalg.norm(tangent))
        t_dir = np.array([1.0, 0.0]) if t_len < 1e-3 else (tangent / t_len)
        normal = np.array([-t_dir[1], t_dir[0]])

        # Smooth Hermite/Cosine Taper
        if s >= entry_s:
            dist_from_entry = s - entry_s
            taper_len = 80.0
            scale_fac = 0.5 * (1.0 - math.cos(math.pi * (dist_from_entry / taper_len))) if dist_from_entry < taper_len else 1.0
        else:
            dist_to_exit = exit_s - s
            taper_len = 80.0
            scale_fac = 0.5 * (1.0 - math.cos(math.pi * (dist_to_exit / taper_len))) if dist_to_exit < taper_len else 1.0

        pit_pt = [
            round(float(base_pt[0] + normal[0] * offset_dist * scale_fac), 2),
            round(float(base_pt[1] + normal[1] * offset_dist * scale_fac), 2),
            round(float(base_pt[2] + 0.05), 2),
        ]
        pit_points.append(pit_pt)

    return pit_points


def get_lap_end_time(row) -> Optional[float]:
    """
    Safely retrieves or calculates the lap finish timestamp (in session seconds).
    """
    t_val = row.get("Time")
    if pd.notnull(t_val) and hasattr(t_val, "total_seconds"):
        return float(t_val.total_seconds())
    st_val = row.get("LapStartTime")
    lt_val = row.get("LapTime")
    if (
        pd.notnull(st_val)
        and pd.notnull(lt_val)
        and hasattr(st_val, "total_seconds")
        and hasattr(lt_val, "total_seconds")
    ):
        return float(st_val.total_seconds() + lt_val.total_seconds())
    return None


def extract_official_results(session) -> List[OfficialResult]:
    """
    Extracts official classified race results from FastF1 session.results.
    Computes authentic finish gaps ('WINNER', '+8.562s', '+1 LAP', 'DNF').
    """
    official_results: List[OfficialResult] = []
    has_results = False
    try:
        if hasattr(session, "results") and session.results is not None and not session.results.empty:
            has_results = True
    except Exception:
        has_results = False

    if not has_results:
        return []

    try:
        res_df = session.results.sort_values(by="Position")
        winner_tot_s = None

        for _, r in res_df.iterrows():
            pos_val = r.get("Position")
            if pd.isna(pos_val) or pos_val is None:
                continue
            try:
                pos_int = int(pos_val)
            except (ValueError, TypeError):
                continue
            if pos_int <= 0:
                continue

            code_val = str(r.get("Abbreviation", "")).upper()
            if not code_val:
                continue

            num_val = None
            if pd.notnull(r.get("DriverNumber")):
                try:
                    num_val = int(r["DriverNumber"])
                except (ValueError, TypeError):
                    pass

            team_val = str(r.get("TeamName", ""))
            status_val = str(r.get("Status", "Finished"))
            pts_val = float(r["Points"]) if pd.notnull(r.get("Points")) else 0.0

            time_str = None
            t_val = r.get("Time")
            if pos_int == 1:
                time_str = "WINNER"
                if pd.notnull(t_val) and hasattr(t_val, "total_seconds"):
                    winner_tot_s = t_val.total_seconds()
            else:
                if pd.notnull(t_val) and hasattr(t_val, "total_seconds"):
                    cur_tot_s = t_val.total_seconds()
                    if winner_tot_s is not None and cur_tot_s > winner_tot_s:
                        diff = cur_tot_s - winner_tot_s
                        time_str = f"+{diff:.3f}s"
                    elif cur_tot_s > 0:
                        time_str = f"+{cur_tot_s:.3f}s"
                elif "lap" in status_val.lower():
                    time_str = status_val.upper()
                elif status_val.lower() not in ["finished", "nan", ""]:
                    time_str = status_val.upper()

            official_results.append(
                OfficialResult(
                    position=pos_int,
                    driver_code=code_val,
                    driver_number=num_val,
                    team=team_val,
                    status=status_val,
                    points=pts_val,
                    time_or_gap=time_str,
                )
            )
    except Exception as e:
        logger.warning(f"Failed to extract official results from session: {e}")

    return official_results


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

    # 1. Determine Session Time Window for Requested Laps
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

    raw_duration = max(10.0, t_end - t_start)
    # Cap replay duration to 3 hours (10,800s) to cover any full race session including red flags
    MAX_REPLAY_DURATION = 10800.0
    duration = min(raw_duration, MAX_REPLAY_DURATION)
    t_end = t_start + duration

    # Adaptive sampling frequency: for short replays use requested sampling_rate (up to 10 Hz).
    # For long multi-lap or full race replays (> 600s), dynamically scale sampling rate (down to 1 Hz)
    # to maintain high UI responsiveness (~4,000 - 6,000 frames total).
    # The frontend smoothly interpolates with Catmull-Rom splines at 60 FPS regardless of sampling rate.
    TARGET_MAX_FRAMES = 6000
    if duration * sampling_rate > TARGET_MAX_FRAMES:
        effective_sampling_rate = max(1, int(TARGET_MAX_FRAMES / duration))
    else:
        effective_sampling_rate = max(1, sampling_rate)

    dt = 1.0 / effective_sampling_rate
    num_frames = int(duration * effective_sampling_rate)
    uniform_grid = np.linspace(t_start, t_end, num_frames)
    timestamps = [round(i * dt, 2) for i in range(num_frames)]

    # Official session classification and race finish detection
    official_results = extract_official_results(session)
    session_total_laps = int(laps_df["LapNumber"].dropna().max()) if not laps_df.empty else lap_end
    is_race_finish_session = (lap_end >= session_total_laps)

    # 2. Circuit Geometry extraction & Start Line Alignment
    fastest_lap = laps_df.pick_fastest()
    ref_telemetry = None
    if fastest_lap is not None and not fastest_lap.empty:
        try:
            ref_telemetry = fastest_lap.get_telemetry()
        except Exception as e:
            logger.warning(f"Failed to get fastest lap telemetry: {e}")

    circuit_geometry = None
    track_tree = None
    shifted_cum_dist = None
    total_track_length = 5000.0

    if ref_telemetry is not None and "X" in ref_telemetry and "Y" in ref_telemetry:
        raw_x = ref_telemetry["X"].dropna().to_numpy()
        raw_y = ref_telemetry["Y"].dropna().to_numpy()
        raw_z = ref_telemetry["Z"].dropna().to_numpy() if "Z" in ref_telemetry else np.zeros_like(raw_x)

        # Scale coordinates from FastF1 tenths-of-meters to meters
        scale = 0.1
        coords_x = raw_x * scale
        coords_y = raw_y * scale
        coords_z = raw_z * scale

        # Decimate for lightweight geometry payload (every ~3rd point)
        step = max(1, len(coords_x) // 400)
        ref_x = coords_x[::step]
        ref_y = coords_y[::step]
        ref_z = coords_z[::step]

        # Determine Start Line index: if session starts on Lap 1, align start line to the front of the starting grid
        start_line_idx = 0
        l1 = laps_df[laps_df["LapNumber"] == 1]
        if lap_start == 1 and not l1.empty:
            try:
                pole_drv = None
                for drv in session.drivers:
                    drv_l1 = l1.pick_driver(drv)
                    if not drv_l1.empty and drv_l1.iloc[0].get("GridPosition", 0) == 1:
                        pole_drv = drv
                        break
                if pole_drv is None:
                    pole_drv = session.drivers[0]

                pole_tel = l1.pick_driver(pole_drv).get_telemetry()
                if not pole_tel.empty and "SessionTime" in pole_tel:
                    times = pole_tel["SessionTime"].dt.total_seconds().to_numpy()
                    px = np.interp(t_start, times, pole_tel["X"].to_numpy() * scale)
                    py = np.interp(t_start, times, pole_tel["Y"].to_numpy() * scale)
                    dists_sq = (ref_x - px) ** 2 + (ref_y - py) ** 2
                    pole_idx = int(np.argmin(dists_sq))

                    next_idx = (pole_idx + 1) % len(ref_x)
                    step_d = float(np.hypot(ref_x[next_idx] - ref_x[pole_idx], ref_y[next_idx] - ref_y[pole_idx]))
                    # Place start line ~8 meters ahead of pole position
                    indices_ahead = max(1, int(round(8.0 / max(0.5, step_d))))
                    start_line_idx = (pole_idx + indices_ahead) % len(ref_x)
                    logger.info(f"Aligned circuit Start Line: pole_idx={pole_idx}, start_line_idx={start_line_idx}")
            except Exception as e:
                logger.warning(f"Failed to align start line to pole position: {e}")

        # Shift centerline points so index 0 is strictly at the Start Line
        shifted_x = np.roll(ref_x, -start_line_idx)
        shifted_y = np.roll(ref_y, -start_line_idx)
        shifted_z = np.roll(ref_z, -start_line_idx)

        centerline = [
            [round(float(shifted_x[i]), 2), round(float(shifted_y[i]), 2), round(float(shifted_z[i]), 2)]
            for i in range(len(shifted_x))
        ]

        # Calculate exact cumulative track distance along shifted centerline
        dx = np.diff(shifted_x, append=shifted_x[0])
        dy = np.diff(shifted_y, append=shifted_y[0])
        dz = np.diff(shifted_z, append=shifted_z[0])
        seg_lengths = np.sqrt(dx ** 2 + dy ** 2 + dz ** 2)
        shifted_cum_dist = np.concatenate([[0.0], np.cumsum(seg_lengths)[:-1]])
        total_track_length = float(shifted_cum_dist[-1] + seg_lengths[-1])

        # Build KDTree on shifted 2D centerline for high-speed projection
        track_tree = cKDTree(np.column_stack([shifted_x, shifted_y]))

        # Corners from FastF1 circuit info
        from app.services.fastf1_client import extract_circuit_turns
        turns: List[TurnMarker] = extract_circuit_turns(session, scale=scale)

        # Ensure corner elevations match actual track surface elevation (eliminating underground markers)
        if turns and centerline:
            for turn in turns:
                best_dist_sq = float("inf")
                matched_z = 0.0
                for pt in centerline:
                    dist_sq = (pt[0] - turn.x) ** 2 + (pt[1] - turn.y) ** 2
                    if dist_sq < best_dist_sq:
                        best_dist_sq = dist_sq
                        matched_z = pt[2]
                turn.z = round(matched_z, 2)

        sectors = [
            SectorBoundary(sector=1, start_distance=0.0, end_distance=total_track_length * 0.33),
            SectorBoundary(sector=2, start_distance=total_track_length * 0.33, end_distance=total_track_length * 0.67),
            SectorBoundary(sector=3, start_distance=total_track_length * 0.67, end_distance=total_track_length),
        ]

        pit_lane = generate_pit_lane(
            centerline=centerline,
            track_length=total_track_length,
            session=session,
            scale=scale,
        )

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
            pit_lane=pit_lane,
        )

    # 3. Synchronize drivers & compute monotonic track progress
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

            # Driver's overall laps across the entire session to identify official finish milestone
            all_drv_laps = laps_df.pick_driver(drv_id) if (laps_df is not None and not laps_df.empty) else drv_laps
            finish_time: Optional[float] = None
            driver_total_laps: int = session_total_laps
            is_driver_classified_finisher: bool = False

            if is_race_finish_session and all_drv_laps is not None and not all_drv_laps.empty:
                valid_laps = all_drv_laps[all_drv_laps["Time"].notna()]
                if not valid_laps.empty:
                    last_lap_row = valid_laps.iloc[-1]
                    drv_laps_count = int(last_lap_row.get("LapNumber", session_total_laps))
                    if drv_laps_count >= session_total_laps - 1:
                        finish_time = get_lap_end_time(last_lap_row)
                        driver_total_laps = drv_laps_count
                        is_driver_classified_finisher = True
                elif not all_drv_laps.empty:
                    last_lap_row = all_drv_laps.iloc[-1]
                    drv_laps_count = int(last_lap_row.get("LapNumber", session_total_laps))
                    if drv_laps_count >= session_total_laps - 1:
                        finish_time = get_lap_end_time(last_lap_row)
                        driver_total_laps = drv_laps_count
                        is_driver_classified_finisher = True

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

            # Interpolate onto uniform grid
            x_interp = np.interp(uniform_grid, tel_times, x_raw)
            y_interp = np.interp(uniform_grid, tel_times, y_raw)
            z_interp = np.interp(uniform_grid, tel_times, z_raw)
            spd_interp = np.interp(uniform_grid, tel_times, spd_raw)
            rpm_interp = np.interp(uniform_grid, tel_times, rpm_raw).astype(int)
            thr_interp = np.interp(uniform_grid, tel_times, thr_raw)
            brk_interp = np.interp(uniform_grid, tel_times, brk_raw)

            # Compute true circuit track progress via KDTree projection
            if track_tree is not None and shifted_cum_dist is not None:
                _, closest_indices = track_tree.query(np.column_stack([x_interp, y_interp]))
                raw_s = shifted_cum_dist[closest_indices]
                L = total_track_length

                # Determine starting distance and lap
                unwrapped_dist = np.zeros(num_frames, dtype=float)
                computed_laps = np.zeros(num_frames, dtype=int)
                has_finished_arr = [False] * num_frames
                d_finish = float(driver_total_laps * L)

                # For Lap 1 start, cars are lined up on the grid behind the start/finish line.
                # Grid spots have raw_s > 0.5 * L (near the end of the circuit loop before the line).
                has_started_lap1 = (lap_start > 1)
                laps_completed = 0

                s0 = raw_s[0]
                if lap_start == 1:
                    if s0 > 0.5 * L:
                        unwrapped_dist[0] = s0 - L
                    else:
                        unwrapped_dist[0] = s0
                        has_started_lap1 = True
                    computed_laps[0] = 1
                else:
                    # Mid-race session start: identify driver's current lap at uniform_grid[0]
                    init_lap = lap_start
                    for _, r in drv_laps.iterrows():
                        st = r["LapStartTime"].total_seconds() if pd.notnull(r["LapStartTime"]) and hasattr(r["LapStartTime"], "total_seconds") else 0
                        et = r["Time"].total_seconds() if pd.notnull(r["Time"]) and hasattr(r["Time"], "total_seconds") else float('inf')
                        if st <= uniform_grid[0] <= et:
                            init_lap = int(r["LapNumber"])
                            break
                    laps_completed = max(0, init_lap - lap_start)
                    unwrapped_dist[0] = laps_completed * L + s0
                    computed_laps[0] = init_lap

                # Check frame 0 finish state
                if is_driver_classified_finisher and finish_time is not None and uniform_grid[0] >= finish_time:
                    has_finished_arr[0] = True
                    unwrapped_dist[0] = d_finish
                    computed_laps[0] = driver_total_laps

                # Unwrapped continuous forward distance integration with race finish clamping
                for f in range(1, num_frames):
                    t_frame = uniform_grid[f]

                    # 1. Race finish check by official timestamp: freeze distance at finish line
                    if is_driver_classified_finisher and finish_time is not None and t_frame >= finish_time:
                        has_finished_arr[f] = True
                        unwrapped_dist[f] = d_finish
                        computed_laps[f] = driver_total_laps
                        continue

                    raw_ds = raw_s[f] - raw_s[f - 1]
                    ds = raw_ds

                    # Detect crossing of the start/finish line (s wraps from near L to near 0)
                    if raw_ds < -0.5 * L:
                        ds = raw_ds + L
                        if lap_start == 1 and not has_started_lap1:
                            has_started_lap1 = True
                        else:
                            laps_completed += 1
                    elif raw_ds > 0.5 * L:
                        ds = raw_ds - L

                    # Clamp motion: stopped/retired cars and pit stops don't reverse or jump
                    spd = spd_interp[f]
                    if spd < 1.0:
                        ds = 0.0
                    else:
                        ds = max(0.0, ds)

                    cur_dist = unwrapped_dist[f - 1] + ds

                    # 2. Race finish check by completed distance
                    if is_driver_classified_finisher and cur_dist >= d_finish:
                        cur_dist = d_finish
                        has_finished_arr[f] = True

                    unwrapped_dist[f] = cur_dist
                    computed_laps[f] = min(driver_total_laps, lap_start + laps_completed)

                track_dist_arr = [round(float(v), 1) for v in unwrapped_dist]
                lap_nums = computed_laps
            else:
                track_dist_arr = [0.0] * num_frames
                lap_nums = [lap_start] * num_frames
                has_finished_arr = [False] * num_frames

            # Nearest-neighbor for discrete channels
            gear_raw = drv_telemetry["nGear"].fillna(0).to_numpy() if "nGear" in drv_telemetry else np.ones_like(tel_times)
            drs_raw = drv_telemetry["DRS"].fillna(0).to_numpy() if "DRS" in drv_telemetry else np.zeros_like(tel_times)

            nearest_indices = np.searchsorted(tel_times, uniform_grid, side="left")
            nearest_indices = np.clip(nearest_indices, 0, len(tel_times) - 1)

            gear_interp = gear_raw[nearest_indices].astype(int).tolist()
            drs_interp = drs_raw[nearest_indices].astype(int).tolist()

            # Pit stop windows detection
            pit_windows: List[Tuple[float, float, float]] = []  # (t_in, t_out, duration)
            if drv_laps is not None and not drv_laps.empty:
                laps_sorted = drv_laps.sort_values(by="LapNumber") if "LapNumber" in drv_laps else drv_laps
                for i_lap, (_, r) in enumerate(laps_sorted.iterrows()):
                    pit_in = r.get("PitInTime")
                    pit_out = r.get("PitOutTime")

                    t_in = pit_in.total_seconds() if (pd.notnull(pit_in) and hasattr(pit_in, "total_seconds")) else None
                    t_out = pit_out.total_seconds() if (pd.notnull(pit_out) and hasattr(pit_out, "total_seconds")) else None

                    if t_in is not None and t_out is not None and t_out > t_in:
                        pit_windows.append((t_in, t_out, t_out - t_in))
                    elif t_in is not None:
                        t_out_next = None
                        if i_lap + 1 < len(laps_sorted):
                            next_r = laps_sorted.iloc[i_lap + 1]
                            next_po = next_r.get("PitOutTime")
                            if pd.notnull(next_po) and hasattr(next_po, "total_seconds"):
                                t_out_next = next_po.total_seconds()
                        if t_out_next is not None and t_out_next > t_in:
                            pit_windows.append((t_in, t_out_next, t_out_next - t_in))
                        else:
                            # Typical F1 pit lane transit is ~24 seconds
                            pit_windows.append((t_in, t_in + 24.0, 24.0))
                    elif t_out is not None:
                        pit_windows.append((max(0.0, t_out - 24.0), t_out, 24.0))

            # Telemetry pit flags (e.g. InPit or Status column in FastF1 telemetry)
            tel_in_pit_flags = None
            if "InPit" in drv_telemetry:
                tel_in_pit_flags = drv_telemetry["InPit"].fillna(False).astype(bool).to_numpy()
            elif "Status" in drv_telemetry:
                tel_in_pit_flags = np.array(["pit" in str(s).lower() for s in drv_telemetry["Status"]])

            # Frame-by-frame pit status and duration
            is_pitting_arr: List[bool] = []
            pit_status_arr: List[str] = []
            pit_duration_arr: List[Optional[float]] = []

            for f_idx, t in enumerate(uniform_grid):
                is_pitting = False
                cur_dur: Optional[float] = None

                for (p_in, p_out, dur) in pit_windows:
                    if p_in <= t <= p_out:
                        is_pitting = True
                        cur_dur = round(float(t - p_in), 1)
                        break

                if not is_pitting and tel_in_pit_flags is not None and len(tel_times) > 0:
                    idx_near = nearest_indices[f_idx]
                    if 0 <= idx_near < len(tel_in_pit_flags) and tel_in_pit_flags[idx_near]:
                        is_pitting = True
                        cur_dur = 0.0

                # Pit lane speed limiter heuristic: sustained speed between 20 and 82 km/h near start/finish straight
                if not is_pitting and track_dist_arr and len(track_dist_arr) > f_idx:
                    raw_lap_dist = raw_s[f_idx] if (track_tree is not None and len(raw_s) > f_idx) else 0.0
                    cur_spd = spd_interp[f_idx]
                    is_near_pit_straight = (raw_lap_dist < 400.0 or raw_lap_dist > (total_track_length - 400.0))
                    if is_near_pit_straight and (20.0 <= cur_spd <= 82.0) and lap_nums[f_idx] > 1:
                        if f_idx > 5 and all(20.0 <= spd_interp[max(0, f_idx - k)] <= 82.0 for k in range(1, 4)):
                            is_pitting = True
                            cur_dur = 5.0

                if is_pitting:
                    is_pitting_arr.append(True)
                    pit_status_arr.append("IN_PIT")
                    pit_duration_arr.append(cur_dur)
                else:
                    is_pitting_arr.append(False)
                    pit_status_arr.append("TRACK")
                    pit_duration_arr.append(None)

            # Dynamic compound and tyre life mapped per lap
            lap_compound_map = {}
            lap_tyrelife_map = {}
            if drv_laps is not None and not drv_laps.empty:
                for _, r in drv_laps.iterrows():
                    ln = int(r.get("LapNumber", 1))
                    c_str = str(r.get("Compound", "MEDIUM") or "MEDIUM").upper()
                    tl_val = int(r.get("TyreLife", 1) or 1)
                    lap_compound_map[ln] = c_str
                    lap_tyrelife_map[ln] = tl_val

            default_compound = str(drv_laps.iloc[0].get("Compound", "MEDIUM") or "MEDIUM").upper() if not drv_laps.empty else "MEDIUM"
            default_tyrelife = int(drv_laps.iloc[0].get("TyreLife", 10) or 10) if not drv_laps.empty else 10

            compound_arr = []
            tyre_life_arr = []
            for f in range(num_frames):
                cur_l = lap_nums[f]
                compound_arr.append(lap_compound_map.get(cur_l, default_compound))
                tyre_life_arr.append(lap_tyrelife_map.get(cur_l, default_tyrelife))

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
                distance=track_dist_arr,
                lap=[int(v) for v in lap_nums],
                compound=compound_arr,
                tyre_life=tyre_life_arr,
                pit_status=pit_status_arr,
                is_pitting=is_pitting_arr,
                pit_duration=pit_duration_arr,
                has_finished=has_finished_arr,
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
    has_weather = False
    try:
        if hasattr(session, "_weather_data") and session._weather_data is not None and not session.weather_data.empty:
            has_weather = True
    except Exception:
        has_weather = False

    if has_weather:
        try:
            w_df = session.weather_data
            for _, row in w_df.head(10).iterrows():
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

    actual_lap_end = int(target_laps["LapNumber"].dropna().max()) if not target_laps.empty else lap_end

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
        lap_end=actual_lap_end,
        total_laps=len(laps_df["LapNumber"].unique()),
        official_results=official_results,
    )

    return ReplayPayload(
        metadata=metadata,
        circuit=circuit_geometry,
        timestamps=timestamps,
        drivers=drivers_dict,
        weather=weather_samples,
    )

