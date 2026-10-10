"""Synthetic city-scale events. source=synthetic. Seeded RNG."""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (
    DEFAULT_BASE,
    DEFAULT_EVENT_COUNT,
    DEFAULT_SEED,
    DEMO_DAY_UTC,
    OUT_DIR,
    VEHICLE_TYPES,
    VEHICLE_WEIGHTS,
)
from contract_test import validate_event
from event_factory import IST, all_cameras, make_event, make_plate, pick_hour_ist
from http_util import login, request_json


def _day() -> datetime:
    y, m, d = (int(x) for x in DEMO_DAY_UTC.split("-"))
    return datetime(y, m, d, tzinfo=IST)


def _stamp(rng: random.Random) -> datetime:
    """Return a timestamp within the past 7 days, biased to IST rush hours."""
    hour = pick_hour_ist(rng)
    # Spread events over 7 days ending today for richer analytics
    day_offset = rng.randint(-6, 0)
    return (
        _day()
        + timedelta(
            days=day_offset,
            hours=hour,
            minutes=rng.randint(0, 59),
            seconds=rng.randint(0, 59),
        )
    ).astimezone(timezone.utc)


def _cam_weights(cams: list[dict]) -> list[float]:
    weights = []
    for c in cams:
        score = 1.0
        cid = c["camera_id"]
        if cid.startswith("CAM"):
            score += 8.0
        if c.get("hotspot"):
            score += 5.0
        weights.append(score)
    return weights


def generate_events(count: int, seed: int) -> tuple[list[dict], list[dict]]:
    rng = random.Random(seed)
    cams = all_cameras(rng)
    weights = _cam_weights(cams)
    plate_n = max(500, count // 3)
    plates = [make_plate(rng) for _ in range(plate_n)]
    events: list[dict] = []
    seq = 0

    def eid() -> str:
        nonlocal seq
        seq += 1
        return f"syn{seed:04d}{seq:07d}"

    while len(events) < count:
        if rng.random() < 0.42:
            hops = rng.randint(2, 5)
            plate = rng.choice(plates)
            vtype = rng.choices(VEHICLE_TYPES, weights=VEHICLE_WEIGHTS, k=1)[0]
            t = _stamp(rng)
            last_id = None
            for _ in range(hops):
                if len(events) >= count:
                    break
                cam = rng.choices(cams, weights=weights, k=1)[0]
                if last_id == cam["camera_id"] and rng.random() < 0.7:
                    continue
                events.append(
                    make_event(
                        event_id=eid(),
                        plate_text=plate,
                        camera=cam,
                        timestamp=t,
                        rng=rng,
                        source="synthetic",
                        vehicle_type=vtype,
                    )
                )
                last_id = cam["camera_id"]
                t = t + timedelta(seconds=rng.randint(80, 480))
        else:
            cam = rng.choices(cams, weights=weights, k=1)[0]
            events.append(
                make_event(
                    event_id=eid(),
                    plate_text=rng.choice(plates),
                    camera=cam,
                    timestamp=_stamp(rng),
                    rng=rng,
                    source="synthetic",
                )
            )
    events.sort(key=lambda e: e["timestamp"])
    return events, cams


def summarize(events: list[dict], cams: list[dict]) -> str:
    types: dict[str, int] = {}
    rush = 0
    hot_speeds: list[float] = []
    calm_speeds: list[float] = []
    hot_ids = {c["camera_id"] for c in cams if c.get("hotspot")}
    for ev in events:
        types[ev["vehicle_type"]] = types.get(ev["vehicle_type"], 0) + 1
        hour = datetime.fromisoformat(ev["timestamp"].replace("Z", "+00:00")).astimezone(IST).hour
        if hour in (8, 9, 17, 18, 19):
            rush += 1
        spd = ev.get("speed_estimate")
        if isinstance(spd, (int, float)):
            (hot_speeds if ev["camera_id"] in hot_ids else calm_speeds).append(float(spd))
    hot_mean = sum(hot_speeds) / len(hot_speeds) if hot_speeds else 0.0
    calm_mean = sum(calm_speeds) / len(calm_speeds) if calm_speeds else 0.0
    mix = ", ".join(f"{k}:{v}" for k, v in sorted(types.items()))
    return (
        f"rush_hour_share {rush / len(events):.2f}  "
        f"hotspot_mean_kmh {hot_mean:.1f}  other_mean_kmh {calm_mean:.1f}  types {mix}"
    )


def post_events(base: str, events: list[dict], rate: float, token: str | None) -> int:
    """POST in batches. rate is events per second. 0 means as fast as possible."""
    sent = 0
    batch = 25
    i = 0
    t0 = time.perf_counter()
    while i < len(events):
        chunk = events[i : i + batch]
        code, payload = request_json(
            "POST",
            f"{base.rstrip('/')}/api/events",
            {"events": chunk},
            token=token,
            timeout=120.0,
        )
        if code not in (200, 201):
            print(f"POST failed at {i}: {code} {payload}", file=sys.stderr)
            break
        sent += len(chunk)
        i += batch
        if rate > 0:
            target = sent / rate
            delay = target - (time.perf_counter() - t0)
            if delay > 0:
                time.sleep(delay)
        if sent % 500 == 0:
            print(f"posted {sent}/{len(events)}")
    return sent


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic VahanNetra events")
    parser.add_argument("--count", type=int, default=DEFAULT_EVENT_COUNT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", default=str(OUT_DIR / "events.jsonl"))
    parser.add_argument("--cameras-out", default=str(OUT_DIR / "virtual_cameras.json"))
    parser.add_argument("--post", action="store_true", help="POST to backend /api/events")
    parser.add_argument("--rate", type=float, default=0.0, help="POST events per second")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--role", default="admin")
    args = parser.parse_args()

    t0 = time.perf_counter()
    events, cams = generate_events(args.count, args.seed)
    elapsed = time.perf_counter() - t0
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        for ev in events:
            fh.write(json.dumps(ev, separators=(",", ":"), ensure_ascii=False))
            fh.write("\n")
    Path(args.cameras_out).write_text(json.dumps(cams, indent=2), encoding="utf-8")
    sample = (events[0], events[len(events) // 2], events[-1])
    for ev in sample:
        errs = validate_event(ev)
        if errs:
            print(f"schema FAIL {ev['event_id']}: {errs}", file=sys.stderr)
            return 1
    demo_n = sum(1 for e in events if str(e["camera_id"]).startswith("CAM") and not str(e["camera_id"]).startswith("VCAM"))
    vcam_n = sum(1 for c in cams if str(c["camera_id"]).startswith("VCAM"))
    print(f"wrote {len(events)} synthetic events to {out} in {elapsed:.2f}s")
    print(f"demo-camera events: {demo_n}  virtual cameras: {vcam_n}  cameras: {len(cams)}")
    print(summarize(events, cams))
    print(f"sample timestamp {events[0]['timestamp']} source={events[0]['source']}")
    if elapsed > 120 and args.count >= 100_000:
        print("WARN: 100000 events took longer than 2 minutes", file=sys.stderr)
        return 1
    if args.post:
        token = login(args.base, args.role)
        if not token:
            print("login failed, cannot POST", file=sys.stderr)
            return 1
        print("POST of large sets is slow because the backend commits per event.")
        posted = post_events(args.base, events, args.rate, token)
        print(f"posted {posted}")
        return 0 if posted == len(events) else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
