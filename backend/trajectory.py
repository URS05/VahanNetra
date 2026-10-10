from __future__ import annotations

import json

from sqlalchemy.orm import Session

from config import FUZZY_CONFIDENT_MAX_COST, MAX_PLAUSIBLE_SPEED_KMH
from fuzzy import match_type, normalize_plate
from geo import haversine_km, speed_kmh
from models import Camera, Event
from routing import route_between


def find_plates(
    db: Session,
    query: str,
    fuzzy: bool,
    start=None,
    end=None,
) -> list[tuple[str, str]]:
    """Return unique (plate, match_type) pairs, optionally inside a time window."""
    q = normalize_plate(query)
    rows = db.query(Event.plate_text)
    if start is not None:
        rows = rows.filter(Event.timestamp >= start)
    if end is not None:
        rows = rows.filter(Event.timestamp <= end)
    plates = {r[0] for r in rows.all()}
    out = []
    for plate in sorted(plates):
        kind = match_type(q, plate, FUZZY_CONFIDENT_MAX_COST if fuzzy else 0.0)
        if kind:
            out.append((plate, kind))
    return out


def build_trajectory(db: Session, plate: str, fuzzy: bool) -> dict:
    hits = find_plates(db, plate, fuzzy)
    if not hits:
        return {
            "query": plate,
            "match_type": None,
            "sightings": [],
            "segments": [],
            "cloned_plate_flag": False,
        }

    exact = [h for h in hits if h[1] == "exact"]
    chosen_plate, kind = exact[0] if exact else hits[0]
    # fuzzy=true keeps one-character misreads on the same journey
    plates = [h[0] for h in hits] if fuzzy else [chosen_plate]

    rows = (
        db.query(Event)
        .filter(Event.plate_text.in_(plates))
        .order_by(Event.timestamp.asc())
        .all()
    )
    cameras = {c.camera_id: c for c in db.query(Camera).all()}

    sightings = []
    for e in rows:
        cam = cameras.get(e.camera_id)
        raw = e.raw_reads
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raw = []
        sightings.append(
            {
                "event_id": e.event_id,
                "plate_text": e.plate_text,
                "camera_id": e.camera_id,
                "timestamp": e.timestamp.isoformat() + "Z",
                "direction": e.direction,
                "lat": cam.lat if cam else None,
                "lon": cam.lon if cam else None,
                "plate_image_ref": e.plate_image_ref,
                "source": e.source,
                "raw_reads": raw,
                "plate_confidence": e.plate_confidence,
            }
        )

    segments = []
    cloned = False
    for a, b in zip(rows, rows[1:]):
        ca, cb = cameras.get(a.camera_id), cameras.get(b.camera_id)
        if not ca or not cb:
            continue
        if a.camera_id == b.camera_id:
            segments.append(
                {
                    "from_camera": a.camera_id,
                    "to_camera": b.camera_id,
                    "kind": "observed",
                    "travel_speed_kmh": None,
                    "distance_km": 0.0,
                    "coordinates": [[ca.lon, ca.lat], [cb.lon, cb.lat]],
                    "routing_source": "observed",
                }
            )
            continue
        routed = route_between(db, a.camera_id, b.camera_id, ca.lat, ca.lon, cb.lat, cb.lon)
        if routed.get("distance_m"):
            km = float(routed["distance_m"]) / 1000.0
        else:
            km = haversine_km(ca.lat, ca.lon, cb.lat, cb.lon)
        spd = speed_kmh(km, a.timestamp, b.timestamp)
        if spd is not None and spd > MAX_PLAUSIBLE_SPEED_KMH:
            cloned = True
        same_cam = a.camera_id == b.camera_id
        segments.append(
            {
                "from_camera": a.camera_id,
                "to_camera": b.camera_id,
                "kind": "observed" if same_cam else "inferred",
                "travel_speed_kmh": round(spd, 1) if spd is not None else None,
                "distance_km": round(km, 3),
                "coordinates": routed["coordinates"],
                "routing_source": routed["source"],
            }
        )

    return {
        "query": plate,
        "resolved_plate": chosen_plate,
        "match_type": kind,
        "sightings": sightings,
        "segments": segments,
        "cloned_plate_flag": cloned,
    }
