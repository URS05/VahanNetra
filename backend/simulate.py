"""POST /api/simulate and GET /api/simulate/presets."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from config import CLONED_PLATE_MAX_SECONDS
from models import Camera
from routing import route_between
from schemas import EventIn, SimulateIn

ALL_CAMS = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]

PRESETS = {
    "normal_trip": {
        "id": "normal_trip",
        "description": "Hero vehicle CAM01 to CAM05 using cached OSRM drive times",
        "camera_order": ALL_CAMS,
        "speed_factor": 1.0,
        "jitter_pct": 0.05,
    },
    "cloned_plate": {
        "id": "cloned_plate",
        "description": "Same plate at CAM01 and CAM05 within 2 minutes (impossible travel)",
        "camera_order": ["CAM01", "CAM05"],
        "speed_factor": 1.0,
        "jitter_pct": 0.0,
        "max_total_seconds": CLONED_PLATE_MAX_SECONDS,
    },
    "fuzzy_plate": {
        "id": "fuzzy_plate",
        "description": "One wrong character at one camera (possible match)",
        "camera_order": ALL_CAMS,
        "speed_factor": 1.0,
        "jitter_pct": 0.05,
        "fuzzy_camera": "CAM03",
    },
    "watchlist_hit": {
        "id": "watchlist_hit",
        "description": "Chosen plate arrives at the chosen camera (first in camera_order)",
        "camera_order": ["CAM01"],
        "speed_factor": 1.0,
        "jitter_pct": 0.0,
    },
}

_COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def heading_to_direction(heading: int) -> str:
    return _COMPASS[int((heading + 22.5) % 360 // 45)]


def mutate_plate(plate: str) -> str:
    chars = list(plate)
    if not chars:
        return "X"
    i = len(chars) - 1
    ch = chars[i]
    if ch.isdigit():
        chars[i] = "0" if ch != "0" else "1"
    else:
        chars[i] = "C" if ch != "C" else "D"
    out = "".join(chars)
    return out if out != plate else plate + "X"


def parse_start(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def apply_preset(body: SimulateIn) -> tuple[SimulateIn, dict]:
    if not body.preset:
        return body, {}
    preset = PRESETS.get(body.preset)
    if not preset:
        raise ValueError(f"unknown preset: {body.preset}")
    camera_order = list(body.camera_order)
    if body.preset in ("normal_trip", "cloned_plate", "fuzzy_plate"):
        camera_order = list(preset["camera_order"])
    elif body.preset == "watchlist_hit":
        camera_order = list(body.camera_order) if body.camera_order else list(preset["camera_order"])
        camera_order = camera_order[:1] or ["CAM01"]
    merged = SimulateIn(
        plate=body.plate,
        camera_order=camera_order,
        start_time=body.start_time,
        speed_factor=body.speed_factor if body.speed_factor != 1.0 else preset.get("speed_factor", 1.0),
        jitter_pct=body.jitter_pct if body.preset != "cloned_plate" else 0.0,
        preset=body.preset,
    )
    return merged, preset


def _event(
    plate: str,
    camera: Camera,
    ts: datetime,
    speed_kmh: float | None,
    confidence: float = 0.99,
) -> EventIn:
    return EventIn(
        event_id=str(uuid.uuid4()),
        plate_text=plate.upper().replace(" ", ""),
        plate_confidence=confidence,
        format_valid=True,
        raw_reads=[{"frame_idx": 0, "text": plate.upper().replace(" ", ""), "conf": confidence}],
        camera_id=camera.camera_id,
        timestamp=ts.isoformat() + "Z",
        direction=heading_to_direction(camera.heading),
        lane=1,
        vehicle_type="car",
        vehicle_color="white",
        speed_estimate=speed_kmh,
        plate_image_ref="",
        source="simulated",
    )


def build_simulated_journey(db: Session, body: SimulateIn) -> dict:
    merged, preset = apply_preset(body)
    cameras = {c.camera_id: c for c in db.query(Camera).all()}
    missing = [c for c in merged.camera_order if c not in cameras]
    if missing:
        raise ValueError(f"unknown camera_id: {', '.join(missing)}")
    if len(merged.camera_order) < 1:
        raise ValueError("camera_order must not be empty")

    plate = merged.plate.upper().replace(" ", "")
    fuzzy_cam = preset.get("fuzzy_camera") if preset else None
    max_total = preset.get("max_total_seconds") if preset else None
    t = parse_start(merged.start_time)
    t0 = t
    events: list[EventIn] = []
    segments: list[dict] = []
    prev_cam = None
    rng = random.Random(plate + str(merged.start_time))

    for i, cam_id in enumerate(merged.camera_order):
        cam = cameras[cam_id]
        speed_kmh = None
        if i > 0 and prev_cam is not None:
            routed = route_between(
                db,
                prev_cam.camera_id,
                cam.camera_id,
                prev_cam.lat,
                prev_cam.lon,
                cam.lat,
                cam.lon,
            )
            duration = float(routed["duration_s"] or 60.0) / merged.speed_factor
            jitter = duration * merged.jitter_pct * rng.uniform(-1.0, 1.0)
            delta = max(1.0, duration + jitter)
            if max_total is not None:
                remaining = max_total - (t - t0).total_seconds()
                last = i == len(merged.camera_order) - 1
                if last:
                    delta = min(delta, max(1.0, remaining))
                else:
                    delta = min(delta, max(1.0, remaining / 2.0))
            t = t + timedelta(seconds=delta)
            dist_m = float(routed["distance_m"] or 0.0)
            if delta > 0 and dist_m > 0:
                speed_kmh = round((dist_m / 1000.0) / (delta / 3600.0), 1)
            segments.append(
                {
                    "from_camera": prev_cam.camera_id,
                    "to_camera": cam.camera_id,
                    "kind": "inferred",
                    "distance_km": round(dist_m / 1000.0, 3) if dist_m else None,
                    "duration_s": round(delta, 1),
                    "coordinates": routed["coordinates"],
                    "routing_source": routed["source"],
                }
            )
        use_plate = plate
        conf = 0.99
        if fuzzy_cam and cam_id == fuzzy_cam:
            use_plate = mutate_plate(plate)
            conf = 0.72
        events.append(_event(use_plate, cam, t, speed_kmh, conf))
        prev_cam = cam

    return {
        "preset": merged.preset,
        "plate": plate,
        "events": events,
        "segments": segments,
    }
