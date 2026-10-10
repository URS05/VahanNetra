import time

from tests.conftest import auth_headers


def test_alert_latency_watchlist(client):
    client.post("/api/watchlist", json={"plate_text": "TS09WL7777", "note": "demo"})
    t0 = time.perf_counter()
    r = client.post(
        "/api/events",
        json={
            "event_id": "ev-wl-1",
            "plate_text": "TS09WL7777",
            "plate_confidence": 0.98,
            "format_valid": True,
            "raw_reads": [],
            "camera_id": "CAM02",
            "timestamp": "2026-10-09T11:00:00Z",
            "direction": "S",
            "lane": 1,
            "vehicle_type": "car",
            "vehicle_color": "white",
            "speed_estimate": None,
            "plate_image_ref": "",
            "source": "real_clip",
        },
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert r.status_code == 200, r.text
    alerts = client.get("/api/alerts").json()
    hits = [a for a in alerts if a["kind"] == "watchlist" and a["plate_text"] == "TS09WL7777"]
    assert len(hits) == 1
    print(f"ALERT_LATENCY_MS={elapsed_ms:.1f}")
    assert elapsed_ms < 2000


def test_watchlist_fuzzy_and_circling(client):
    client.post("/api/watchlist", json={"plate_text": "TS09AB1234", "note": "fuzzy"})
    body = {
        "event_id": "ev-fz-wl",
        "plate_text": "TS09ABI234",
        "plate_confidence": 0.8,
        "format_valid": True,
        "raw_reads": [],
        "camera_id": "CAM03",
        "timestamp": "2026-10-09T11:10:00Z",
        "direction": "W",
        "lane": 1,
        "vehicle_type": "car",
        "vehicle_color": "white",
        "speed_estimate": None,
        "plate_image_ref": "",
        "source": "real_clip",
    }
    assert client.post("/api/events", json=body).status_code == 200
    kinds = [a["kind"] for a in client.get("/api/alerts").json() if a["plate_text"] == "TS09ABI234"]
    assert "watchlist" in kinds

    for i in range(4):
        r = client.post(
            "/api/events",
            json={
                **body,
                "event_id": f"ev-circ-{i}",
                "plate_text": "TS09CIRC01",
                "timestamp": f"2026-10-09T11:{20 + i:02d}:00Z",
            },
        )
        assert r.status_code == 200
    circling = [
        a
        for a in client.get("/api/alerts").json()
        if a["kind"] == "circling" and a["plate_text"] == "TS09CIRC01"
    ]
    assert len(circling) == 1


def test_ws_events_and_alerts(client):
    client.post("/api/watchlist", json={"plate_text": "TS09WS0001", "note": "ws"})
    payload = {
        "event_id": "ev-ws-1",
        "plate_text": "TS09WS0001",
        "plate_confidence": 0.99,
        "format_valid": True,
        "raw_reads": [],
        "camera_id": "CAM04",
        "timestamp": "2026-10-09T11:30:00Z",
        "direction": "S",
        "lane": 1,
        "vehicle_type": "car",
        "vehicle_color": "white",
        "speed_estimate": None,
        "plate_image_ref": "",
        "source": "simulated",
    }
    with client.websocket_connect("/ws/events") as events, client.websocket_connect("/ws/alerts") as alerts:
        assert client.post("/api/events", json=payload).status_code == 200
        event_msg = events.receive_json()
        alert_msg = alerts.receive_json()
    assert event_msg["event_id"] == "ev-ws-1"
    assert event_msg["source"] == "simulated"
    assert alert_msg["kind"] == "watchlist"
    assert alert_msg["plate_text"] == "TS09WS0001"


def test_login_password_free(client):
    r = client.post("/api/login", json={"role": "analyst"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "analyst"
    assert "token" in body
    headers = auth_headers(client, "viewer")
    denied = client.get("/api/trajectory/TS09XX", headers=headers)
    assert denied.status_code == 403
