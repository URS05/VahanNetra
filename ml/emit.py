"""Build a schema Event, save the plate crop, POST it, and append JSONL."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from config import (
    API_EVENTS_URL,
    CROPS_DIR,
    EVENT_SOURCE,
    EVENTS_JSONL,
    PIXELS_PER_METER,
    POST_RETRIES,
    POST_RETRY_SEC,
    POST_TIMEOUT_SEC,
)

log = logging.getLogger("ml.emit")

_DIRECTIONS = {"N", "NE", "E", "SE", "S", "SW", "W", "NW", "IN", "OUT"}
_TYPES = {"car", "bike", "truck", "bus", "auto", "other"}


def iso_utc(ts: datetime) -> str:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def majority(items: list[str], default: str) -> str:
    if not items:
        return default
    return Counter(items).most_common(1)[0][0]


def speed_kmh(points: list[tuple[float, float]], dt_sec: float) -> float | None:
    if PIXELS_PER_METER <= 0 or dt_sec <= 0 or len(points) < 2:
        return None
    import math

    x0, y0 = points[0]
    x1, y1 = points[-1]
    meters = math.hypot(x1 - x0, y1 - y0) / PIXELS_PER_METER
    return (meters / dt_sec) * 3.6


def save_plate_crop(image, event_id: str) -> str:
    if image is None:
        return ""
    try:
        import cv2
    except Exception as exc:
        log.error("OpenCV missing, plate crop not saved: %s", exc)
        return ""
    try:
        CROPS_DIR.mkdir(parents=True, exist_ok=True)
        path = CROPS_DIR / f"{event_id}.jpg"
        ok = cv2.imwrite(str(path), image)
        if not ok:
            log.error("failed to write plate crop %s", path)
            return ""
        return f"data/crops/{event_id}.jpg"
    except Exception as exc:
        log.error("plate crop save failed: %s", exc)
        return ""


def build_event(
    plate_text: str,
    plate_confidence: float,
    format_ok: bool,
    raw_reads: list[dict],
    camera_id: str,
    timestamp: datetime,
    direction: str,
    lane: int,
    vehicle_type: str,
    vehicle_color: str,
    speed_estimate: float | None,
    plate_image_ref: str,
    source: str = EVENT_SOURCE,
    event_id: str | None = None,
) -> dict:
    if direction not in _DIRECTIONS:
        log.warning("bad direction %s, using OUT", direction)
        direction = "OUT"
    if vehicle_type not in _TYPES:
        vehicle_type = "other"
    if source not in ("real_clip", "simulated", "synthetic"):
        source = EVENT_SOURCE
    conf = max(0.0, min(1.0, float(plate_confidence)))
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "plate_text": plate_text,
        "plate_confidence": conf,
        "format_valid": bool(format_ok),
        "raw_reads": raw_reads,
        "camera_id": camera_id,
        "timestamp": iso_utc(timestamp),
        "direction": direction,
        "lane": int(lane),
        "vehicle_type": vehicle_type,
        "vehicle_color": vehicle_color or "unknown",
        "speed_estimate": None if speed_estimate is None else float(speed_estimate),
        "plate_image_ref": plate_image_ref or "",
        "source": source,
    }


def append_jsonl(event: dict, path: Path | None = None) -> bool:
    dest = Path(path) if path is not None else EVENTS_JSONL
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=True) + "\n")
        log.info("jsonl append %s", dest)
        return True
    except Exception as exc:
        log.error("jsonl append failed: %s", exc)
        return False


def post_event(event: dict) -> bool:
    payload = json.dumps(event).encode("utf-8")
    for attempt in range(1, POST_RETRIES + 1):
        try:
            req = urllib.request.Request(
                API_EVENTS_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=POST_TIMEOUT_SEC) as resp:
                body = resp.read()
            log.info("POST %s ok bytes=%s id=%s", API_EVENTS_URL, len(body), event.get("event_id"))
            return True
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            log.warning("POST attempt %s/%s failed: %s", attempt, POST_RETRIES, exc)
            if attempt < POST_RETRIES:
                time.sleep(POST_RETRY_SEC)
        except Exception as exc:
            log.warning("POST attempt %s/%s failed: %s", attempt, POST_RETRIES, exc)
            if attempt < POST_RETRIES:
                time.sleep(POST_RETRY_SEC)
    log.error("POST gave up, event kept in JSONL only: %s", event.get("event_id"))
    return False


def emit_event(event: dict, jsonl_path: Path | None = None, do_post: bool = True) -> bool:
    wrote = append_jsonl(event, jsonl_path)
    posted = post_event(event) if do_post else False
    if do_post and not posted:
        log.info("backend unreachable, JSONL fallback used for %s", event.get("event_id"))
    return wrote
