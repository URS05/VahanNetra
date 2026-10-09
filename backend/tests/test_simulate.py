from datetime import datetime

from tests.conftest import auth_headers


def test_presets_listed(client):
    r = client.get("/api/simulate/presets")
    assert r.status_code == 200
    body = r.json()
    for key in ("normal_trip", "cloned_plate", "fuzzy_plate", "watchlist_hit"):
        assert key in body


def test_simulate_five_cameras_increasing_timestamps(client):
    r = client.post(
        "/api/simulate",
        json={
            "plate": "TS09AB1234",
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": "2026-10-09T06:00:00Z",
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
        },
    )
    assert r.status_code == 200, r.text
    events = r.json()["events"]
    assert len(events) == 5
    assert [e["camera_id"] for e in events] == ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
    times = [datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")) for e in events]
    assert times == sorted(times)
    assert all(t1 > t0 for t0, t1 in zip(times, times[1:]))
    assert all(e["source"] == "simulated" for e in events)
    segs = r.json()["segments"]
    assert len(segs) == 4
    assert all(s["kind"] == "inferred" for s in segs)
    assert all(s["routing_source"] == "osrm" for s in segs)
    assert all(len(s["coordinates"]) >= 2 for s in segs)


def test_fuzzy_plate_preset_is_possible_match(client):
    r = client.post(
        "/api/simulate",
        json={
            "plate": "TS09FZ1234",
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": "2026-10-09T07:30:00Z",
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": "fuzzy_plate",
        },
    )
    assert r.status_code == 200, r.text
    plates = [e["plate_text"] for e in r.json()["events"]]
    assert plates.count("TS09FZ1234") == 4
    odd = [p for p in plates if p != "TS09FZ1234"]
    assert len(odd) == 1
    headers = auth_headers(client)
    found = client.get("/api/plates/search", params={"q": "TS09FZ1234", "fuzzy": True}, headers=headers).json()
    kinds = {row["plate_text"]: row["match_type"] for row in found["results"]}
    assert kinds["TS09FZ1234"] == "exact"
    assert kinds[odd[0]] == "possible"
    traj = client.get("/api/trajectory/TS09FZ1234", headers=headers).json()
    assert [s["camera_id"] for s in traj["sightings"]] == ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]


def test_cloned_plate_preset(client):
    r = client.post(
        "/api/simulate",
        json={
            "plate": "TS09CL0001",
            "camera_order": ["CAM01", "CAM02"],
            "start_time": "2026-10-09T07:00:00Z",
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": "cloned_plate",
        },
    )
    assert r.status_code == 200, r.text
    events = r.json()["events"]
    assert [e["camera_id"] for e in events] == ["CAM01", "CAM05"]
    t0 = datetime.fromisoformat(events[0]["timestamp"].replace("Z", "+00:00"))
    t1 = datetime.fromisoformat(events[1]["timestamp"].replace("Z", "+00:00"))
    assert (t1 - t0).total_seconds() <= 120
    alerts = client.get("/api/alerts").json()
    kinds = {a["kind"] for a in alerts}
    assert "cloned_plate" in kinds
