"""Smoke tests against a running backend. Does not start the server."""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import DEFAULT_BASE, FUZZY_CAMERA, PRESETS_PATH
from http_util import login, request_json
PRESET_NAMES = ("normal_trip", "fuzzy_plate", "cloned_plate", "watchlist_hit")


def _one_off(plate: str) -> str:
    chars = list(plate)
    chars[-1] = "0" if chars[-1] != "0" else "1"
    return "".join(chars)


def _edits(a: str, b: str) -> int:
    return sum(x != y for x, y in zip(a, b)) + abs(len(a) - len(b))


class Smoke:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token
        self.suffix = int(time.time()) % 10000
        self.rows: list[tuple[str, str, float, str]] = []

    def plate(self, letter: str) -> str:
        return f"TS09{letter}{self.suffix:04d}"

    def call(self, method: str, path: str, body=None, token: str | None = None, timeout: float = 60.0):
        return request_json(method, f"{self.base}{path}", body, token=token if token is not None else self.token, timeout=timeout)

    def check(self, name: str, fn) -> None:
        t0 = time.perf_counter()
        try:
            ok, detail = fn()
        except Exception as exc:  # noqa: BLE001 - one row per check
            ok, detail = False, str(exc)
        ms = (time.perf_counter() - t0) * 1000.0
        self.rows.append((name, "PASS" if ok else "FAIL", ms, detail))

    def simulate(self, preset: str, plate: str, **extra) -> tuple[int, object]:
        body = {
            "plate": plate,
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": "2026-10-08T03:30:00Z",
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": preset,
        }
        body.update(extra)
        return self.call("POST", "/api/simulate", body, timeout=90.0)

    def run(self) -> int:
        self.check("presets_listed", self.presets_listed)
        self.check("preset_normal_trip", self.preset_normal)
        self.check("trajectory", self.trajectory)
        self.check("fuzzy", self.fuzzy)
        self.check("preset_fuzzy_plate", self.preset_fuzzy)
        self.check("analytics", self.analytics)
        self.check("alert", self.alert)
        self.check("preset_watchlist_hit", self.preset_watch)
        self.check("impossible_travel", self.impossible)
        self.check("preset_cloned_plate", self.preset_cloned)
        self.check("audit", self.audit)
        self._print()
        return 1 if any(r[1] == "FAIL" for r in self.rows) else 0

    def _print(self) -> None:
        print(f"{'check':<24} {'result':<6} {'ms':>8}  detail")
        for name, result, ms, detail in self.rows:
            print(f"{name:<24} {result:<6} {ms:8.0f}  {detail}")
        failed = sum(1 for r in self.rows if r[1] == "FAIL")
        print(f"{len(self.rows) - failed} PASS, {failed} FAIL")

    def presets_listed(self):
        code, payload = self.call("GET", "/api/simulate/presets", token="")
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code}"
        missing = [name for name in PRESET_NAMES if name not in payload]
        if missing:
            return False, "missing " + ",".join(missing)
        note = self._preset_diff(payload)
        return True, note or "four presets"

    def _preset_diff(self, live: dict) -> str:
        if not PRESETS_PATH.exists():
            return "local presets.json missing"
        local = __import__("json").loads(PRESETS_PATH.read_text(encoding="utf-8"))
        diffs = []
        for name in PRESET_NAMES:
            sim = local.get(name, {}).get("simulate", {})
            got = live.get(name, {})
            if list(got.get("camera_order") or []) != list(sim.get("camera_order") or []):
                if name != "watchlist_hit":
                    diffs.append(f"{name} camera_order")
            if name == "fuzzy_plate" and got.get("fuzzy_camera") != sim.get("fuzzy_camera"):
                diffs.append("fuzzy_camera")
            if name == "cloned_plate":
                cap = got.get("max_total_seconds")
                want = sim.get("max_elapsed_s")
                if cap is not None and want is not None and float(cap) != float(want):
                    diffs.append("cloned cap")
            if name == "watchlist_hit" and list(got.get("camera_order") or []) != list(sim.get("camera_order") or []):
                diffs.append("watchlist camera")
        return "payload diff: " + ", ".join(diffs) if diffs else ""

    def preset_normal(self):
        plate = self.plate("N")
        code, payload = self.simulate("normal_trip", plate)
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code} {payload}"
        cams = [e["camera_id"] for e in payload.get("events", [])]
        if cams != ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]:
            return False, str(cams)
        if any(e.get("source") != "simulated" for e in payload["events"]):
            return False, "source not simulated"
        self.normal_plate = plate
        return True, plate

    def trajectory(self):
        plate = getattr(self, "normal_plate", self.plate("N"))
        code, payload = self.call("GET", f"/api/trajectory/{plate}?fuzzy=true")
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code}"
        cams = [s["camera_id"] for s in payload.get("sightings", [])]
        if cams[:5] != ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]:
            return False, str(cams)
        times = [s["timestamp"] for s in payload["sightings"][:5]]
        if times != sorted(times):
            return False, "timestamps not increasing"
        segs = payload.get("segments") or []
        if len(segs) < 4:
            return False, f"{len(segs)} segments"
        return True, f"{len(payload['sightings'])} sightings"

    def fuzzy(self):
        plate = getattr(self, "normal_plate", "")
        if not plate:
            return False, "no normal trip plate"
        query = _one_off(plate)
        code, payload = self.call("GET", f"/api/plates/search?q={query}&fuzzy=true")
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code}"
        hits = payload.get("results") or []
        ok = any(row.get("plate_text") == plate and row.get("match_type") == "possible" for row in hits)
        self.audit_query = query
        return (True, f"{query} -> {plate}") if ok else (False, f"no possible match for {query}")

    def preset_fuzzy(self):
        plate = self.plate("F")
        code, payload = self.simulate("fuzzy_plate", plate, jitter_pct=0.05)
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code} {payload}"
        events = payload.get("events") or []
        odd = [e for e in events if e.get("plate_text") != plate]
        if len(odd) != 1:
            return False, f"{len(odd)} altered plates"
        if odd[0].get("camera_id") != FUZZY_CAMERA and odd[0].get("camera_id") not in ("CAM03",):
            return False, f"altered at {odd[0].get('camera_id')}"
        if _edits(plate, odd[0]["plate_text"]) != 1:
            return False, f"{plate} vs {odd[0]['plate_text']}"
        return True, f"{odd[0]['camera_id']} {odd[0]['plate_text']}"

    def analytics(self):
        needed = {
            "/api/analytics/density?bucket=60": "by_camera",
            "/api/analytics/speed": "average_speed_kmh",
            "/api/analytics/od": "matrix",
            "/api/analytics/congestion": "hotspots",
        }
        for path, key in needed.items():
            code, payload = self.call("GET", path, token="")
            if code != 200 or not isinstance(payload, dict) or key not in payload:
                return False, f"{path} HTTP {code}"
        return True, "density speed od congestion"

    def alert(self):
        plate = self.plate("W")
        code, _ = self.call("POST", "/api/watchlist", {"plate_text": plate, "note": "smoke"})
        if code not in (200, 201):
            return False, f"watchlist HTTP {code}"
        t0 = time.perf_counter()
        code, payload = self.simulate(
            "watchlist_hit",
            plate,
            camera_order=["CAM03"],
            start_time="2026-10-08T03:50:00Z",
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        if code != 200:
            return False, f"simulate HTTP {code} {payload}"
        self.watch_plate = plate
        self.watch_events = payload.get("events") if isinstance(payload, dict) else []
        code, alerts = self.call("GET", "/api/alerts", token="")
        if code != 200 or not isinstance(alerts, list):
            return False, f"alerts HTTP {code}"
        hits = [a for a in alerts if a.get("kind") == "watchlist" and a.get("plate_text") == plate]
        if not hits:
            return False, "no watchlist alert"
        return True, f"{len(hits)} hit in {elapsed_ms:.0f} ms"

    def preset_watch(self):
        plate = getattr(self, "watch_plate", "")
        events = getattr(self, "watch_events", None)
        if not plate or not events:
            return False, "watchlist simulate did not run"
        if events[0].get("camera_id") != "CAM03" or events[0].get("plate_text") != plate:
            return False, str(events[0].get("camera_id"))
        return True, f"{plate} at CAM03"

    def impossible(self):
        plate = self.plate("C")
        code, payload = self.simulate(
            "cloned_plate",
            plate,
            camera_order=["CAM01", "CAM05"],
            start_time="2026-10-08T04:30:00Z",
            jitter_pct=0.0,
        )
        if code != 200 or not isinstance(payload, dict):
            return False, f"HTTP {code} {payload}"
        events = payload.get("events") or []
        cams = [e["camera_id"] for e in events]
        if cams != ["CAM01", "CAM05"]:
            return False, str(cams)
        from datetime import datetime

        t0 = datetime.fromisoformat(events[0]["timestamp"].replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(events[1]["timestamp"].replace("Z", "+00:00"))
        gap = (t1 - t0).total_seconds()
        if gap > 120:
            return False, f"gap {gap:.0f}s"
        code, traj = self.call("GET", f"/api/trajectory/{plate}?fuzzy=false")
        if code != 200 or not isinstance(traj, dict) or not traj.get("cloned_plate_flag"):
            return False, f"flag HTTP {code} {traj if isinstance(traj, dict) else ''}"
        code, alerts = self.call("GET", "/api/alerts", token="")
        cloned = [
            a
            for a in (alerts or [])
            if isinstance(a, dict) and a.get("kind") == "cloned_plate" and a.get("plate_text") == plate
        ]
        if len(cloned) != 1:
            return False, f"{len(cloned)} cloned alerts"
        self.clone_events = events
        return True, f"gap {gap:.0f}s, 1 alert"

    def preset_cloned(self):
        events = getattr(self, "clone_events", None)
        if not events:
            return False, "cloned simulate did not run"
        if [e["camera_id"] for e in events] != ["CAM01", "CAM05"]:
            return False, "camera order"
        if any(e.get("source") != "simulated" for e in events):
            return False, "source"
        return True, "CAM01 CAM05 simulated"

    def audit(self):
        query = getattr(self, "audit_query", self.plate("N"))
        code, payload = self.call("GET", "/api/audit")
        if code != 200 or not isinstance(payload, list):
            return False, f"HTTP {code}"
        found = any(row.get("query") in (query, getattr(self, "normal_plate", "")) for row in payload)
        if not found:
            return False, f"query {query} not in audit"
        return True, query


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="VahanNetra smoke test. Backend must already be running.")
    parser.add_argument("--base", default=DEFAULT_BASE)
    args = parser.parse_args()
    code, health = request_json("GET", f"{args.base.rstrip('/')}/health", timeout=3.0)
    if code == 0:
        print(f"{'check':<24} {'result':<6} {'ms':>8}  detail")
        print(f"{'backend':<24} {'FAIL':<6} {'0':>8}  {health}")
        print("0 PASS, 1 FAIL")
        print("Backend is not running. Start it, then: python sim/smoke_test.py")
        return 1
    token = login(args.base, "analyst")
    if not token:
        print("login failed")
        return 1
    return Smoke(args.base, token).run()


if __name__ == "__main__":
    raise SystemExit(main())
