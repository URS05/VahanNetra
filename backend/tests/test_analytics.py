from tests.conftest import auth_headers


def _event(event_id: str, plate: str, camera: str, ts: str) -> dict:
    return {
        "event_id": event_id,
        "plate_text": plate,
        "plate_confidence": 0.9,
        "format_valid": True,
        "raw_reads": [],
        "camera_id": camera,
        "timestamp": ts,
        "direction": "S",
        "lane": 1,
        "vehicle_type": "car",
        "vehicle_color": "white",
        "speed_estimate": 42.0,
        "plate_image_ref": "",
        "source": "synthetic",
    }


def test_analytics_density_speed_od_congestion_heatmap(client):
    body = {
        "events": [
            _event("an-1", "TS09AN1001", "CAM01", "2026-10-09T12:00:00Z"),
            _event("an-2", "TS09AN1001", "CAM05", "2026-10-09T12:20:00Z"),
            _event("an-3", "TS09AN1002", "CAM01", "2026-10-09T12:01:00Z"),
            _event("an-4", "TS09AN1002", "CAM05", "2026-10-09T12:22:00Z"),
            _event("an-5", "TS09AN1003", "CAM01", "2026-10-09T12:02:00Z"),
        ]
    }
    r = client.post("/api/events", json=body)
    assert r.status_code == 200, r.text

    density = client.get(
        "/api/analytics/density",
        params={"from": "2026-10-09T12:00:00Z", "to": "2026-10-09T13:00:00Z", "bucket": 3600},
    )
    assert density.status_code == 200
    by_cam = density.json()["by_camera"]
    assert sum(by_cam["CAM01"].values()) == 3
    assert sum(by_cam["CAM05"].values()) == 2

    speed = client.get("/api/analytics/speed").json()["average_speed_kmh"]
    assert speed["CAM01"] is not None
    assert 0 < speed["CAM01"] <= 120

    od = client.get("/api/analytics/od").json()
    assert od["matrix"]["CAM01"]["CAM05"] == 2
    assert len(od["flows"]) == 2

    hotspots = client.get("/api/analytics/congestion").json()["hotspots"]
    assert hotspots[0]["camera_id"] == "CAM01"
    assert hotspots[0]["count"] == 3

    heat = client.get("/api/analytics/heatmap", params={"t": "2026-10-09T12:10:00Z"}).json()
    assert len(heat["points"]) >= 3
    assert all("lat" in p and "lon" in p and p["weight"] == 1 for p in heat["points"])


def test_search_time_window_and_audit(client):
    client.post(
        "/api/events",
        json={
            "events": [
                _event("tw-1", "TS09TW0001", "CAM02", "2026-10-09T08:00:00Z"),
                _event("tw-2", "TS09TW0002", "CAM02", "2026-10-09T18:00:00Z"),
            ]
        },
    )
    headers = auth_headers(client)
    early = client.get(
        "/api/plates/search",
        params={"q": "TS09TW0001", "fuzzy": True, "from": "2026-10-09T07:00:00Z", "to": "2026-10-09T09:00:00Z"},
        headers=headers,
    )
    assert early.status_code == 200
    plates = {row["plate_text"] for row in early.json()["results"]}
    assert plates == {"TS09TW0001"}

    audit = client.get("/api/audit", headers=headers).json()
    assert any(row["query"] == "TS09TW0001" and row["role"] == "analyst" for row in audit)
