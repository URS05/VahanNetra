# VahanNetra demo checklist

Each camera clip runs through real detection, tracking and OCR. Multi-camera trajectory is one simulated journey using real road distances and drive times. City-scale analytics use a synthetic generator.

Say that line if a judge asks where the data comes from. Simulated sightings wear a Simulated tag. Synthetic events stay labeled synthetic. Real clip reads stay on the camera that saw them.

## Status

| Item | Status |
|---|---|
| Synthetic generator, 100000 events, seeded, schema valid | Ready. Run `python sim/generate.py`. |
| Scenarios: hero, fuzzy, cloned, circling, watchlist | Ready in `sim/scenarios.py` and `sim/presets.json`. |
| Seed users and watchlist | Ready. Needs a running backend. Wipe API is not on the server yet. |
| Clip acquire docs and label tool | Ready. No URL is pinned, so nothing was downloaded. |
| Replay with blacklist hit | Ready. Needs a running backend. |
| Contract test | Ready. |
| Smoke test | Script ready. Not run here: backend was not already up, and this agent does not start it. |
| Four simulate presets | Payloads in `sim/presets.json`. Backend preset defaults still differ. See REQUESTS in the sim handoff. |

## Before the demo

1. Start the backend yourself: `cd backend` then `uvicorn main:app --port 8000`.
2. Optional wipe and rebuild (same seed every time):

```
python sim/seed_demo.py --wipe
```

Restart the backend after a file wipe, then:

```
python sim/seed_demo.py --synthetic 2500 --seed 42
```

3. Users are password-free. `POST /api/login` with `{ "role": "viewer" }`, `analyst`, or `admin`.
4. Watchlist plate: `TS09WL9999`.
5. Hero plate: `TS09VN2612`. One-character search: `TS09VN2613`.
6. Cloned plate: `TS09CL0001` at CAM01 and CAM05 inside 90 seconds.
7. Circling plate: `TS09CR4444` at CAM02 four times.
8. Put clips in `data/videos/CAM01.mp4` ... `CAM05.mp4` using `sim/clips/SOURCES.md`.

## Judge script

- [ ] Map shows CAM01 to CAM05. Heatmap uses synthetic density (`GET /api/analytics/heatmap`).
- [ ] Play each camera file through detection, tracking, and OCR. Show per-frame reads, the voted plate, and confidence. Source is `real_clip`.
- [ ] Open the Simulate panel. Route CAM01 to CAM05, plate `TS09VN2612`, preset `normal_trip`. The marker follows the road-snapped path. Search the plate: timestamps, direction, inferred segments, Simulated tag on simulated sightings.
- [ ] Search `TS09VN2613`. Fuzzy match returns `TS09VN2612` as a possible match.
- [ ] Analytics: density, average speed, origin-destination, congestion hotspot.
- [ ] Add `TS09WL9999` to the watchlist. Replay a hit (`python sim/replay.py --preset watchlist_hit --blacklist-hit`). Alert appears within seconds.
- [ ] Impossible travel for `TS09CL0001` is shown once (`preset cloned_plate`).
- [ ] Audit log shows who searched what and when. Viewer cannot open trajectory. Analyst and admin can.

## How to verify

```
python sim/contract_test.py
python sim/scenarios.py --write-presets
python sim/contract_test.py sim/presets.json sim/out/scenarios
python sim/generate.py --count 100000 --seed 42
python sim/smoke_test.py
```

`smoke_test.py` only talks to `http://127.0.0.1:8000`. It does not launch the server.
