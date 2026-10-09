"""Wipe and rebuild a repeatable demo dataset via API (and optional local DB wipe)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import (
    BACKEND_DB,
    DEFAULT_BASE,
    DEFAULT_SEED,
    OUT_DIR,
    ROLES,
    WATCHLIST_NOTE,
    WATCHLIST_PLATE,
)
from generate import generate_events, post_events
from http_util import login, request_json
from scenarios import (
    scenario_circling,
    scenario_cloned_plate,
    scenario_normal_trip,
    scenario_watchlist_hit,
    simulate_bodies,
    simulate_request,
    write_presets,
    write_scenario_files,
)


def wipe_local_db() -> None:
    for suffix in ("", "-wal", "-shm"):
        path = Path(str(BACKEND_DB) + suffix) if suffix else BACKEND_DB
        if suffix:
            path = BACKEND_DB.parent / (BACKEND_DB.name + suffix)
        if path.exists():
            path.unlink()
            print(f"removed {path}")
    if BACKEND_DB.exists():
        BACKEND_DB.unlink()
        print(f"removed {BACKEND_DB}")


def try_api_wipe(base: str, token: str) -> bool:
    for path in ("/api/demo/reset", "/api/admin/reset"):
        code, payload = request_json("POST", f"{base.rstrip('/')}{path}", {}, token=token)
        if code == 200:
            print(f"wiped via {path}")
            return True
        if code not in (0, 404):
            print(f"{path}: HTTP {code} {payload}")
    return False


def ensure_watchlist(base: str, token: str) -> None:
    code, payload = request_json(
        "POST",
        f"{base.rstrip('/')}/api/watchlist",
        {"plate_text": WATCHLIST_PLATE, "note": WATCHLIST_NOTE},
        token=token,
    )
    print(f"watchlist {WATCHLIST_PLATE}: HTTP {code}")
    if code not in (200, 201):
        print(payload)


def ensure_users(base: str) -> bool:
    """Password-free roles. A token for each role means that user can log in."""
    ok = True
    for role in ROLES:
        token = login(base, role)
        print(f"user {role}: {'ok' if token else 'FAIL'}")
        ok = ok and bool(token)
    return ok


def inject_scenario(base: str, token: str, name: str, events: list[dict]) -> None:
    if name in simulate_bodies():
        code, payload = request_json(
            "POST",
            f"{base.rstrip('/')}/api/simulate",
            simulate_request(name),
            token=token,
        )
        if code in (200, 201):
            print(f"{name} via /api/simulate: HTTP {code}")
            return
        print(f"{name}: simulate HTTP {code}, falling back to /api/events")
    code, payload = request_json(
        "POST",
        f"{base.rstrip('/')}/api/events",
        {"events": events},
        token=token,
        timeout=60.0,
    )
    print(f"{name} via /api/events: HTTP {code}")
    if code not in (200, 201):
        print(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed a repeatable VahanNetra demo")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--wipe", action="store_true", help="Delete local SQLite files")
    parser.add_argument("--synthetic", type=int, default=2500, help="Synthetic events to POST")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--skip-post", action="store_true", help="Only write files")
    args = parser.parse_args()

    write_presets()
    write_scenario_files(OUT_DIR / "scenarios")
    print("Users are password-free roles: " + ", ".join(ROLES))
    print('Login: POST /api/login {"role": "viewer"|"analyst"|"admin"}')
    print(f"Seed {args.seed} rebuilds the same synthetic set every run.")

    if args.wipe:
        if not try_api_wipe(args.base, login(args.base, "admin") or ""):
            wipe_local_db()
            print("Restart the backend so tables and CAM01-CAM05 are created again, then re-run without --wipe.")
            return 0

    if args.skip_post:
        events, _ = generate_events(args.synthetic, args.seed)
        (OUT_DIR / "seed_events.jsonl").write_text(
            "\n".join(__import__("json").dumps(e, separators=(",", ":")) for e in events) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {len(events)} events, skipped POST")
        return 0

    if not ensure_users(args.base):
        print("Cannot login. Start backend: cd backend && uvicorn main:app --port 8000", file=sys.stderr)
        return 1
    token = login(args.base, "admin")
    if not token:
        return 1

    ensure_watchlist(args.base, token)

    events, _ = generate_events(args.synthetic, args.seed)
    posted = post_events(args.base, events, rate=0.0, token=token)
    print(f"synthetic posted {posted}/{len(events)}")

    inject_scenario(args.base, token, "normal_trip", scenario_normal_trip())
    inject_scenario(args.base, token, "cloned_plate", scenario_cloned_plate())
    inject_scenario(args.base, token, "watchlist_hit", scenario_watchlist_hit())
    inject_scenario(args.base, token, "circling", scenario_circling())
    print("fuzzy_plate reuses HERO_PLATE from normal_trip. Search TS09VN2613.")
    print("seed_demo done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
