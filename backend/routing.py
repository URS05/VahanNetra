"""Cache-first routing.

Prefer contracts/osrm_cache.json, then SQLite cached_routes.
Call public OSRM only when a camera pair is missing.
If OSRM fails, use a straight-line polyline labeled inferred.
"""

from __future__ import annotations

import json
import logging
import math

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import (
    CONTRACTS,
    FALLBACK_SPEED_KMH,
    OSRM_BASE_URL,
    OSRM_ON_MISS,
    OSRM_TIMEOUT_S,
)
from geo import haversine_km
from models import CachedRoute, Camera

log = logging.getLogger("vahannetra.routing")


def route_key(from_cam: str, to_cam: str) -> str:
    return f"{from_cam}->{to_cam}"


def _simulate_coords(lat1: float, lon1: float, lat2: float, lon2: float, steps: int = 8) -> list[list[float]]:
    """Straight-line polyline with a small bulge. Used only as inferred fallback."""
    coords = []
    for i in range(steps + 1):
        t = i / steps
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t
        bulge = 0.0012 * math.sin(math.pi * t)
        coords.append([round(lon + bulge, 6), round(lat, 6)])
    return coords


def _row_to_dict(row: CachedRoute) -> dict:
    return {
        "coordinates": json.loads(row.coordinates),
        "source": row.source,
        "distance_m": row.distance_m,
        "duration_s": row.duration_s,
        "from_cache": True,
    }


def _fallback(lat1: float, lon1: float, lat2: float, lon2: float) -> dict:
    km = haversine_km(lat1, lon1, lat2, lon2)
    duration_s = (km / FALLBACK_SPEED_KMH) * 3600.0 if FALLBACK_SPEED_KMH else 60.0
    return {
        "coordinates": _simulate_coords(lat1, lon1, lat2, lon2),
        "source": "inferred",
        "distance_m": km * 1000.0,
        "duration_s": duration_s,
        "from_cache": False,
    }


def _save(
    db: Session,
    from_cam: str,
    to_cam: str,
    coordinates: list,
    source: str,
    distance_m: float | None,
    duration_s: float | None,
) -> dict:
    key = route_key(from_cam, to_cam)
    row = db.query(CachedRoute).filter(CachedRoute.key == key).one_or_none()
    payload = json.dumps(coordinates)
    if row:
        row.coordinates = payload
        row.source = source
        row.distance_m = distance_m
        row.duration_s = duration_s
    else:
        row = CachedRoute(
            key=key,
            coordinates=payload,
            source=source,
            distance_m=distance_m,
            duration_s=duration_s,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


def get_cached(db: Session, from_cam: str, to_cam: str) -> dict | None:
    row = db.query(CachedRoute).filter(CachedRoute.key == route_key(from_cam, to_cam)).one_or_none()
    if not row:
        return None
    return _row_to_dict(row)


def _osrm_fetch(lat1: float, lon1: float, lat2: float, lon2: float) -> dict | None:
    url = (
        f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
        "?overview=full&geometries=geojson"
    )
    try:
        with httpx.Client(timeout=OSRM_TIMEOUT_S) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.warning("OSRM request failed: %s", exc)
        return None
    routes = data.get("routes") or []
    if not routes:
        return None
    route = routes[0]
    coords = route.get("geometry", {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    return {
        "coordinates": coords,
        "source": "osrm",
        "distance_m": float(route.get("distance") or 0),
        "duration_s": float(route.get("duration") or 0),
        "from_cache": False,
    }


def route_between(
    db: Session,
    from_cam: str,
    to_cam: str,
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> dict:
    cached = get_cached(db, from_cam, to_cam)
    if cached:
        return cached

    fetched = None
    if OSRM_ON_MISS:
        fetched = _osrm_fetch(lat1, lon1, lat2, lon2)
    if fetched:
        return _save(
            db,
            from_cam,
            to_cam,
            fetched["coordinates"],
            "osrm",
            fetched["distance_m"],
            fetched["duration_s"],
        )

    fallback = _fallback(lat1, lon1, lat2, lon2)
    return _save(
        db,
        from_cam,
        to_cam,
        fallback["coordinates"],
        "inferred",
        fallback["distance_m"],
        fallback["duration_s"],
    )


def load_osrm_file_cache(db: Session) -> int:
    path = CONTRACTS / "osrm_cache.json"
    if not path.exists():
        log.warning("osrm_cache.json not found at %s", path)
        return 0
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        log.warning("osrm_cache.json is incomplete or still writing, skip file load")
        return 0
    loaded = 0
    for item in rows:
        from_cam = item.get("from")
        to_cam = item.get("to")
        coords = item.get("coordinates")
        if not from_cam or not to_cam or not coords:
            continue
        key = route_key(from_cam, to_cam)
        existing = db.query(CachedRoute).filter(CachedRoute.key == key).one_or_none()
        if existing and existing.source == "osrm" and existing.coordinates:
            if existing.distance_m is None:
                existing.distance_m = item.get("distance_m")
                existing.duration_s = item.get("duration_s")
                db.commit()
                loaded += 1
            continue
        _save(
            db,
            from_cam,
            to_cam,
            coords,
            "osrm",
            item.get("distance_m"),
            item.get("duration_s"),
        )
        loaded += 1
    return loaded


def camera_pairs(cameras: list[Camera]) -> list[tuple[Camera, Camera]]:
    out = []
    for a in cameras:
        for b in cameras:
            if a.camera_id != b.camera_id:
                out.append((a, b))
    return out


def prewarm_missing_pairs(db: Session) -> int:
    cameras = db.query(Camera).all()
    filled = 0
    for a, b in camera_pairs(cameras):
        if get_cached(db, a.camera_id, b.camera_id):
            continue
        route_between(db, a.camera_id, b.camera_id, a.lat, a.lon, b.lat, b.lon)
        filled += 1
    return filled


def ensure_route_columns(engine) -> None:
    with engine.connect() as conn:
        tables = {r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "cached_routes" not in tables:
            return
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(cached_routes)"))}
        if "distance_m" not in cols:
            conn.execute(text("ALTER TABLE cached_routes ADD COLUMN distance_m FLOAT"))
        if "duration_s" not in cols:
            conn.execute(text("ALTER TABLE cached_routes ADD COLUMN duration_s FLOAT"))
        conn.commit()
