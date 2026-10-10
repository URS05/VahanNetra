"""Demo scenario payloads. source=simulated except where noted."""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (
    CIRCLE_COUNT,
    CIRCLE_GAP_SECONDS,
    CIRCLE_PLATE,
    CIRCLE_START_UTC,
    CLONE_GAP_SECONDS,
    CLONE_PLATE,
    CLONE_START_UTC,
    DEFAULT_BASE,
    DEFAULT_SEED,
    FUZZY_CAMERA,
    FUZZY_QUERY,
    HERO_LEG_SECONDS,
    HERO_PLATE,
    HERO_START_UTC,
    OUT_DIR,
    PRESETS_PATH,
    WATCH_START_UTC,
    WATCHLIST_NOTE,
    WATCHLIST_PLATE,
)
from event_factory import load_demo_cameras, make_event, parse_utc
from http_util import login, request_json

def _rng() -> random.Random:
    """Fresh RNG per scenario so files are identical every run."""
    return random.Random(DEFAULT_SEED)


def _cam_map() -> dict[str, dict]:
    return {c["camera_id"]: c for c in load_demo_cameras()}


def _hero_times():
    t = parse_utc(HERO_START_UTC)
    times = [t]
    for gap in HERO_LEG_SECONDS:
        t = t + timedelta(seconds=gap)
        times.append(t)
    return times


def scenario_normal_trip() -> list[dict]:
    cams = _cam_map()
    rng = _rng()
    order = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
    events = []
    for i, (cid, ts) in enumerate(zip(order, _hero_times())):
        events.append(
            make_event(
                event_id=f"sim-hero-{i+1:02d}",
                plate_text=HERO_PLATE,
                camera=cams[cid],
                timestamp=ts,
                rng=rng,
                source="simulated",
                vehicle_type="car",
                plate_confidence=0.94,
                plate_image_ref="simulated",
            )
        )
    return events


def scenario_fuzzy_plate() -> list[dict]:
    """Hero trip, one wrong character at FUZZY_CAMERA. Search either plate as possible match."""
    events = scenario_normal_trip()
    for i, ev in enumerate(events):
        ev["event_id"] = f"sim-fuzzy-{i+1:02d}"
        if ev["camera_id"] != FUZZY_CAMERA:
            continue
        ev["plate_text"] = FUZZY_QUERY
        ev["plate_confidence"] = 0.72
        ev["format_valid"] = True
        for read in ev["raw_reads"]:
            read["text"] = FUZZY_QUERY
    return events


def scenario_cloned_plate() -> list[dict]:
    cams = _cam_map()
    rng = _rng()
    t0 = parse_utc(CLONE_START_UTC)
    t1 = t0 + timedelta(seconds=CLONE_GAP_SECONDS)
    return [
        make_event(
            event_id="sim-clone-01",
            plate_text=CLONE_PLATE,
            camera=cams["CAM01"],
            timestamp=t0,
            rng=rng,
            source="simulated",
            vehicle_type="car",
            plate_confidence=0.91,
            plate_image_ref="simulated",
        ),
        make_event(
            event_id="sim-clone-05",
            plate_text=CLONE_PLATE,
            camera=cams["CAM05"],
            timestamp=t1,
            rng=rng,
            source="simulated",
            vehicle_type="car",
            plate_confidence=0.90,
            plate_image_ref="simulated",
        ),
    ]


def scenario_circling() -> list[dict]:
    cams = _cam_map()
    rng = _rng()
    t0 = parse_utc(CIRCLE_START_UTC)
    events = []
    for i in range(CIRCLE_COUNT):
        events.append(
            make_event(
                event_id=f"sim-circle-{i+1:02d}",
                plate_text=CIRCLE_PLATE,
                camera=cams["CAM02"],
                timestamp=t0 + timedelta(seconds=i * CIRCLE_GAP_SECONDS),
                rng=rng,
                source="simulated",
                vehicle_type="car",
                plate_confidence=0.88,
                plate_image_ref="simulated",
            )
        )
    return events


def scenario_watchlist_hit() -> list[dict]:
    cams = _cam_map()
    rng = _rng()
    t0 = parse_utc(WATCH_START_UTC)
    return [
        make_event(
            event_id="sim-watch-01",
            plate_text=WATCHLIST_PLATE,
            camera=cams["CAM03"],
            timestamp=t0,
            rng=rng,
            source="simulated",
            vehicle_type="car",
            plate_confidence=0.96,
            plate_image_ref="simulated",
        )
    ]


SCENARIOS = {
    "normal_trip": scenario_normal_trip,
    "fuzzy_plate": scenario_fuzzy_plate,
    "cloned_plate": scenario_cloned_plate,
    "circling": scenario_circling,
    "watchlist_hit": scenario_watchlist_hit,
}


def simulate_bodies() -> dict:
    return {
        "normal_trip": {
            "plate": HERO_PLATE,
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": HERO_START_UTC,
            "speed_factor": 1.0,
            "jitter_pct": 0.05,
            "preset": "normal_trip",
        },
        "fuzzy_plate": {
            "plate": HERO_PLATE,
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": HERO_START_UTC,
            "speed_factor": 1.0,
            "jitter_pct": 0.05,
            "preset": "fuzzy_plate",
            "fuzzy_camera": FUZZY_CAMERA,
            "altered_plate": FUZZY_QUERY,
            "search_query": FUZZY_QUERY,
            "note": "One wrong character at CAM03 (TS09VN2613). Search either plate: the other is a possible match.",
        },
        "cloned_plate": {
            "plate": CLONE_PLATE,
            "camera_order": ["CAM01", "CAM05"],
            "start_time": CLONE_START_UTC,
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": "cloned_plate",
            "max_elapsed_s": CLONE_GAP_SECONDS,
            "note": "CAM01 then CAM05 within 90 seconds so impossible travel fires once.",
        },
        "watchlist_hit": {
            "plate": WATCHLIST_PLATE,
            "camera_order": ["CAM03"],
            "start_time": WATCH_START_UTC,
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": "watchlist_hit",
            "watchlist_note": WATCHLIST_NOTE,
        },
    }


def build_presets() -> dict:
    bodies = simulate_bodies()
    return {
        "normal_trip": {
            "simulate": bodies["normal_trip"],
            "events": scenario_normal_trip(),
        },
        "fuzzy_plate": {
            "simulate": bodies["fuzzy_plate"],
            "events": scenario_fuzzy_plate(),
        },
        "cloned_plate": {
            "simulate": bodies["cloned_plate"],
            "events": scenario_cloned_plate(),
        },
        "watchlist_hit": {
            "simulate": bodies["watchlist_hit"],
            "events": scenario_watchlist_hit(),
        },
        "circling": {
            "simulate": {
                "plate": CIRCLE_PLATE,
                "camera_order": ["CAM02", "CAM02", "CAM02", "CAM02"],
                "start_time": CIRCLE_START_UTC,
                "speed_factor": 1.0,
                "jitter_pct": 0.0,
                "preset": "circling",
            },
            "events": scenario_circling(),
        },
    }


def write_presets(path: Path = PRESETS_PATH) -> None:
    path.write_text(json.dumps(build_presets(), indent=2) + "\n", encoding="utf-8")


def write_scenario_files(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, fn in SCENARIOS.items():
        (out_dir / f"{name}.json").write_text(
            json.dumps(fn(), indent=2) + "\n", encoding="utf-8"
        )


SIMULATE_KEYS = ("plate", "camera_order", "start_time", "speed_factor", "jitter_pct", "preset")


def simulate_request(name: str) -> dict:
    """Fields POST /api/simulate accepts. Notes stay in presets.json only."""
    body = simulate_bodies()[name]
    return {k: body[k] for k in SIMULATE_KEYS}


def post_via_simulate(base: str, token: str, name: str) -> tuple[int, object]:
    return request_json(
        "POST",
        f"{base.rstrip('/')}/api/simulate",
        simulate_request(name),
        token=token,
    )


def post_via_events(base: str, token: str, events: list[dict]) -> tuple[int, object]:
    return request_json(
        "POST", f"{base.rstrip('/')}/api/events", {"events": events}, token=token
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build demo scenario payloads")
    parser.add_argument("--write-presets", action="store_true")
    parser.add_argument("--out-dir", default=str(OUT_DIR / "scenarios"))
    parser.add_argument("--post", action="store_true")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument(
        "--name",
        choices=list(SCENARIOS) + ["all"],
        default="all",
    )
    args = parser.parse_args()

    write_scenario_files(Path(args.out_dir))
    if args.write_presets:
        write_presets()
        print(f"wrote {PRESETS_PATH}")
    print(f"wrote scenarios under {args.out_dir}")
    for name, fn in SCENARIOS.items():
        print(f"  {name}: {len(fn())} events")

    if args.post:
        token = login(args.base, "admin")
        if not token:
            print("login failed", file=sys.stderr)
            return 1
        names = list(SCENARIOS) if args.name == "all" else [args.name]
        for name in names:
            if name == "circling":
                code, payload = post_via_events(args.base, token, scenario_circling())
            elif name in simulate_bodies():
                code, payload = post_via_simulate(args.base, token, name)
                if code in (0, 404):
                    print(f"{name}: simulate missing ({code}), falling back to /api/events")
                    code, payload = post_via_events(args.base, token, SCENARIOS[name]())
            else:
                code, payload = post_via_events(args.base, token, SCENARIOS[name]())
            print(f"{name}: HTTP {code}")
            if code not in (200, 201):
                print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
