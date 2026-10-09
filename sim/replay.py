"""Replay events in timestamp order. Optional watchlist hit trigger."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import DEFAULT_BASE, OUT_DIR, PRESETS_PATH, WATCHLIST_NOTE, WATCHLIST_PLATE
from event_factory import iter_jsonl, parse_utc
from http_util import login, request_json
from scenarios import SCENARIOS, scenario_watchlist_hit


def load_events(path: Path | None, preset: str | None) -> list[dict]:
    if preset:
        if preset in SCENARIOS:
            return SCENARIOS[preset]()
        data = json.loads(PRESETS_PATH.read_text(encoding="utf-8"))
        if preset not in data:
            raise SystemExit(f"unknown preset {preset}")
        return data[preset]["events"]
    if not path or not path.exists():
        raise SystemExit("need --file JSONL or --preset")
    return list(iter_jsonl(path))


def sleep_until(prev: datetime | None, cur: datetime, realtime: bool, speed: float) -> None:
    if not realtime or prev is None:
        return
    gap = (cur - prev).total_seconds() / max(speed, 0.01)
    if 0 < gap < 120:
        time.sleep(gap)


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay events to a running backend")
    parser.add_argument("--file", default=str(OUT_DIR / "events.jsonl"))
    parser.add_argument("--preset", default=None)
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--realtime", action="store_true")
    parser.add_argument("--speed", type=float, default=10.0, help="Realtime speed factor")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--blacklist-hit", action="store_true", help="Put watchlist plate on list, then replay that hit")
    parser.add_argument("--role", default="admin")
    args = parser.parse_args()

    token = login(args.base, args.role)
    if not token:
        print("login failed, is the backend up?", file=sys.stderr)
        return 1

    events = load_events(Path(args.file) if args.file else None, args.preset)
    events.sort(key=lambda e: e["timestamp"])
    if args.limit:
        events = events[: args.limit]

    if args.blacklist_hit:
        request_json(
            "POST",
            f"{args.base.rstrip('/')}/api/watchlist",
            {"plate_text": WATCHLIST_PLATE, "note": WATCHLIST_NOTE},
            token=token,
        )
        extra = scenario_watchlist_hit()
        events = extra + events
        events.sort(key=lambda e: e["timestamp"])
        print(f"watchlist armed for {WATCHLIST_PLATE}")

    prev = None
    sent = 0
    for ev in events:
        row = dict(ev)
        ts = parse_utc(row["timestamp"])
        sleep_until(prev, ts, args.realtime, args.speed)
        code, payload = request_json(
            "POST", f"{args.base.rstrip('/')}/api/events", row, token=token
        )
        if code not in (200, 201):
            print(f"FAIL {row['event_id']}: {code} {payload}")
            if code == 409:
                prev = ts
                continue
            return 1
        sent += 1
        print(f"{row['timestamp']} {row['camera_id']} {row['plate_text']} {row.get('source')}")
        prev = ts
    print(f"replayed {sent} events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
