"""Build schema-matching Event dicts. No extra keys."""

from __future__ import annotations

import json
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import (
    CAMERAS_PATH,
    COLORS,
    CONGESTION_SPEED_KMH,
    DIRECTIONS,
    HOTSPOT_DEMO,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    PLATE_DISTRICTS,
    PLATE_LETTERS,
    PLATE_STATES,
    RUSH_HOURS_IST,
    RUSH_SPEED_SCALE,
    RUSH_VOLUME_WEIGHT,
    SPEED_RANGE,
    VEHICLE_TYPES,
    VEHICLE_WEIGHTS,
    VIRTUAL_CAMERA_COUNT,
)

PLATE_RE = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$")
IST = timezone(timedelta(hours=5, minutes=30))
HEADING_TO_DIR = {
    0: "N",
    45: "NE",
    90: "E",
    135: "SE",
    180: "S",
    225: "SW",
    270: "W",
    315: "NW",
}


def load_demo_cameras() -> list[dict]:
    return json.loads(CAMERAS_PATH.read_text(encoding="utf-8"))


def utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def format_valid_plate(text: str) -> bool:
    return bool(PLATE_RE.match(text.replace(" ", "").upper()))


def make_plate(rng: random.Random) -> str:
    state = rng.choice(PLATE_STATES)
    dist = rng.choice(PLATE_DISTRICTS)
    n_letters = 2 if rng.random() > 0.08 else 1
    letters = "".join(rng.choice(PLATE_LETTERS) for _ in range(n_letters))
    num = rng.randint(1, 9999)
    return f"{state}{dist}{letters}{num:04d}"


def virtual_cameras(rng: random.Random, n: int = VIRTUAL_CAMERA_COUNT) -> list[dict]:
    demo = load_demo_cameras()
    hubs = [(c["lat"], c["lon"], c["camera_id"]) for c in demo]
    out = []
    for i in range(1, n + 1):
        if rng.random() < 0.65:
            lat0, lon0, _ = rng.choice(hubs)
            lat = lat0 + rng.uniform(-0.018, 0.018)
            lon = lon0 + rng.uniform(-0.018, 0.018)
        else:
            lat = rng.uniform(LAT_MIN, LAT_MAX)
            lon = rng.uniform(LON_MIN, LON_MAX)
        heading = rng.choice(list(HEADING_TO_DIR))
        lanes = rng.choice((2, 3, 4))
        hotspot = i % 17 == 0
        out.append(
            {
                "camera_id": f"VCAM{i:03d}",
                "name": f"Hyderabad virtual {i:03d}",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "heading": heading,
                "lanes": lanes,
                "status": "synthetic",
                "hotspot": hotspot,
            }
        )
    return out


def all_cameras(rng: random.Random) -> list[dict]:
    demo = []
    for c in load_demo_cameras():
        row = dict(c)
        row["hotspot"] = row["camera_id"] in HOTSPOT_DEMO
        demo.append(row)
    return demo + virtual_cameras(rng)


def pick_hour_ist(rng: random.Random) -> int:
    hours = list(range(6, 23))
    weights = [RUSH_VOLUME_WEIGHT if h in RUSH_HOURS_IST else 1.0 for h in hours]
    return rng.choices(hours, weights=weights, k=1)[0]


def speed_for(rng: random.Random, vtype: str, hour_ist: int, hotspot: bool) -> float:
    lo, hi = SPEED_RANGE[vtype]
    spd = rng.uniform(lo, hi)
    if hour_ist in RUSH_HOURS_IST:
        spd *= RUSH_SPEED_SCALE
    if hotspot:
        spd = min(spd, CONGESTION_SPEED_KMH + rng.uniform(0, 8))
    return round(spd, 1)


def noisy_reads(rng: random.Random, plate: str, conf: float) -> list[dict]:
    n = rng.randint(2, 5)
    reads = []
    for i in range(n):
        text = plate
        if rng.random() < 0.12:
            pos = rng.randrange(len(plate))
            text = plate[:pos] + rng.choice(PLATE_LETTERS + "0123456789") + plate[pos + 1 :]
        reads.append(
            {
                "frame_idx": i * rng.randint(2, 6),
                "text": text,
                "conf": round(min(1.0, max(0.05, conf + rng.uniform(-0.12, 0.08))), 3),
            }
        )
    return reads


def make_event(
    *,
    event_id: str,
    plate_text: str,
    camera: dict,
    timestamp: datetime,
    rng: random.Random,
    source: str,
    vehicle_type: str | None = None,
    direction: str | None = None,
    speed: float | None = None,
    plate_confidence: float | None = None,
    plate_image_ref: str | None = None,
) -> dict:
    vtype = vehicle_type or rng.choices(VEHICLE_TYPES, weights=VEHICLE_WEIGHTS, k=1)[0]
    hour_ist = timestamp.astimezone(IST).hour if timestamp.tzinfo else timestamp.hour
    hotspot = bool(camera.get("hotspot"))
    conf = plate_confidence if plate_confidence is not None else round(rng.uniform(0.72, 0.98), 3)
    heading = camera.get("heading", 0)
    default_dir = HEADING_TO_DIR.get(int(heading) % 360 // 45 * 45, rng.choice(DIRECTIONS))
    lanes = int(camera.get("lanes") or 3)
    return {
        "event_id": event_id,
        "plate_text": plate_text.upper().replace(" ", ""),
        "plate_confidence": conf,
        "format_valid": format_valid_plate(plate_text),
        "raw_reads": noisy_reads(rng, plate_text.upper().replace(" ", ""), conf),
        "camera_id": camera["camera_id"],
        "timestamp": utc_iso(timestamp),
        "direction": direction or default_dir,
        "lane": rng.randint(1, max(1, lanes)),
        "vehicle_type": vtype,
        "vehicle_color": rng.choice(COLORS),
        "speed_estimate": speed if speed is not None else speed_for(rng, vtype, hour_ist, hotspot),
        "plate_image_ref": plate_image_ref if plate_image_ref is not None else f"{source}:{event_id}",
        "source": source,
    }


def write_jsonl(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for ev in events:
            fh.write(json.dumps(ev, separators=(",", ":"), ensure_ascii=False))
            fh.write("\n")


def iter_jsonl(path: Path):
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)
