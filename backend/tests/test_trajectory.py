from tests.conftest import auth_headers


def test_trajectory_order_and_osrm_polylines(client):
    client.post(
        "/api/simulate",
        json={
            "plate": "TS09TR9999",
            "camera_order": ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"],
            "start_time": "2026-10-09T08:00:00Z",
            "speed_factor": 1.0,
            "jitter_pct": 0.0,
            "preset": "normal_trip",
        },
    )
    headers = auth_headers(client)
    r = client.get("/api/trajectory/TS09TR9999", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    cams = [s["camera_id"] for s in data["sightings"]]
    assert cams == ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
    times = [s["timestamp"] for s in data["sightings"]]
    assert times == sorted(times)
    assert data["cloned_plate_flag"] is False
    assert len(data["segments"]) == 4
    for seg in data["segments"]:
        assert seg["kind"] == "inferred"
        assert len(seg["coordinates"]) >= 2
        assert seg["routing_source"] == "osrm"
        assert seg["coordinates"][0] != seg["coordinates"][-1]


def test_fuzzy_search_possible_match(client):
    client.post(
        "/api/events",
        json={
            "event_id": "ev-fuzzy-1",
            "plate_text": "TS09AB1234",
            "plate_confidence": 0.9,
            "format_valid": True,
            "raw_reads": [{"frame_idx": 1, "text": "TS09AB1234", "conf": 0.9}],
            "camera_id": "CAM01",
            "timestamp": "2026-10-09T09:00:00Z",
            "direction": "S",
            "lane": 1,
            "vehicle_type": "car",
            "vehicle_color": "white",
            "speed_estimate": None,
            "plate_image_ref": "",
            "source": "real_clip",
        },
    )
    headers = auth_headers(client)
    r = client.get("/api/plates/search", params={"q": "TS09ABI234", "fuzzy": True}, headers=headers)
    assert r.status_code == 200
    results = r.json()["results"]
    assert any(row["plate_text"] == "TS09AB1234" and row["match_type"] == "possible" for row in results)


def test_impossible_travel_flag(client):
    for i, (cam, ts) in enumerate(
        [("CAM01", "2026-10-09T10:00:00Z"), ("CAM05", "2026-10-09T10:00:30Z")]
    ):
        r = client.post(
            "/api/events",
            json={
                "event_id": f"ev-clone-{i}",
                "plate_text": "TS09IM0001",
                "plate_confidence": 0.95,
                "format_valid": True,
                "raw_reads": [],
                "camera_id": cam,
                "timestamp": ts,
                "direction": "S",
                "lane": 1,
                "vehicle_type": "car",
                "vehicle_color": "white",
                "speed_estimate": None,
                "plate_image_ref": "",
                "source": "synthetic",
            },
        )
        assert r.status_code == 200, r.text
    headers = auth_headers(client)
    traj = client.get("/api/trajectory/TS09IM0001", headers=headers).json()
    assert traj["cloned_plate_flag"] is True
    alerts = client.get("/api/alerts").json()
    cloned = [a for a in alerts if a["kind"] == "cloned_plate" and a["plate_text"] == "TS09IM0001"]
    assert len(cloned) == 1
