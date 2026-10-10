from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean, pstdev

from sqlalchemy.orm import Session

from config import MAX_PLAUSIBLE_SPEED_KMH
from geo import haversine_km, speed_kmh
from models import Camera, Event
from routing import route_between


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)


def _events(db: Session, from_ts: str | None, to_ts: str | None) -> list[Event]:
    q = db.query(Event)
    a, b = _parse(from_ts), _parse(to_ts)
    if a:
        q = q.filter(Event.timestamp >= a)
    if b:
        q = q.filter(Event.timestamp <= b)
    return q.order_by(Event.timestamp.asc()).all()


def density(db: Session, from_ts: str | None, to_ts: str | None, bucket_s: int) -> dict:
    rows = _events(db, from_ts, to_ts)
    bucket = max(int(bucket_s), 1)
    origin = datetime(1970, 1, 1)
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for e in rows:
        secs = int((e.timestamp - origin).total_seconds())
        start = origin + timedelta(seconds=(secs // bucket) * bucket)
        buckets[e.camera_id][start.isoformat()] += 1
    return {"by_camera": {cam: dict(counts) for cam, counts in buckets.items()}}


def average_speed(db: Session) -> dict:
    cameras = {c.camera_id: c for c in db.query(Camera).all()}
    by_plate: dict[str, list[Event]] = defaultdict(list)
    for e in db.query(Event).order_by(Event.timestamp.asc()).all():
        by_plate[e.plate_text].append(e)

    per_cam: dict[str, list[float]] = defaultdict(list)
    in_frame: dict[str, list[float]] = defaultdict(list)

    for events in by_plate.values():
        for e in events:
            if e.speed_estimate is not None:
                in_frame[e.camera_id].append(e.speed_estimate)
        for a, b in zip(events, events[1:]):
            ca, cb = cameras.get(a.camera_id), cameras.get(b.camera_id)
            if not ca or not cb or a.camera_id == b.camera_id:
                continue
            routed = route_between(db, a.camera_id, b.camera_id, ca.lat, ca.lon, cb.lat, cb.lon)
            if routed.get("distance_m"):
                km = float(routed["distance_m"]) / 1000.0
            else:
                km = haversine_km(ca.lat, ca.lon, cb.lat, cb.lon)
            spd = speed_kmh(km, a.timestamp, b.timestamp)
            if spd is None or spd > MAX_PLAUSIBLE_SPEED_KMH:
                continue
            per_cam[a.camera_id].append(spd)

    out = {}
    for cam_id in cameras:
        samples = per_cam.get(cam_id, []) + in_frame.get(cam_id, [])
        out[cam_id] = round(mean(samples), 1) if samples else None
    return {"average_speed_kmh": out}


def origin_destination(db: Session) -> dict:
    cameras = {c.camera_id: c for c in db.query(Camera).all()}
    by_plate: dict[str, list[Event]] = defaultdict(list)
    for e in db.query(Event).order_by(Event.timestamp.asc()).all():
        by_plate[e.plate_text].append(e)

    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    flows = []
    for plate, events in by_plate.items():
        if len(events) < 2:
            continue
        origin, dest = events[0].camera_id, events[-1].camera_id
        if origin == dest:
            continue
        matrix[origin][dest] += 1
        oa, ob = cameras.get(origin), cameras.get(dest)
        if oa and ob:
            flows.append(
                {
                    "plate_text": plate,
                    "origin": origin,
                    "destination": dest,
                    "from": [oa.lon, oa.lat],
                    "to": [ob.lon, ob.lat],
                }
            )
    return {"matrix": {k: dict(v) for k, v in matrix.items()}, "flows": flows}


def congestion(db: Session) -> dict:
    rows = db.query(Event).all()
    counts: dict[str, int] = defaultdict(int)
    for e in rows:
        counts[e.camera_id] += 1
    values = list(counts.values()) or [0]
    mu = mean(values)
    sd = pstdev(values) or 1.0
    scored = []
    for cam_id, n in counts.items():
        z = (n - mu) / sd
        severity = "high" if z > 1.0 else "medium" if z > 0.3 else "low"
        scored.append(
            {
                "camera_id": cam_id,
                "count": n,
                "score": round(z, 2),
                "severity": severity,
            }
        )
    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"hotspots": scored}


def heatmap(db: Session, t: str | None) -> dict:
    cameras = {c.camera_id: c for c in db.query(Camera).all()}
    center = _parse(t) or datetime.now(timezone.utc).replace(tzinfo=None)
    window = timedelta(minutes=10)
    rows = (
        db.query(Event)
        .filter(Event.timestamp >= center - window, Event.timestamp <= center + window)
        .all()
    )
    points = []
    for e in rows:
        cam = cameras.get(e.camera_id)
        if not cam:
            continue
        points.append({"lat": cam.lat, "lon": cam.lon, "weight": 1, "camera_id": e.camera_id})
    return {"t": center.isoformat() + "Z", "points": points}
