# VahanNetra

City-wide AI engine for multi-camera ANPR trajectory tracking and urban traffic analytics.

SIH 2026 | Problem statement 26127 | Bharat Electronics Limited | Software | Smart Automation

## What we are trying to ace

- **M1 ANPR/OCR.** Read Indian plates from camera clips in hard conditions. Multi-frame consensus, not a single crop.
- **M2 Trajectory.** Search a plate and reconstruct its path across five Hyderabad cameras on a map.
- **M3 Traffic analytics.** Density, average speed, origin-destination flows, congestion, live heatmap.
- **M4 Alerts.** Watchlist hits, cloned-plate (impossible travel), circling. Push in seconds.
- **One event stream.** Every sighting is one Event. Trajectories, analytics, and alerts all consume that stream.
- **Honest data.** Three labeled tiers: `real_clip`, `simulated`, `synthetic`. Never shown as live city CCTV.
- **Demo that does not die.** Cache-first routing, password-free role login, seedable demo.

Judge line we will use: each camera clip runs through real detection, tracking, and OCR. The multi-camera trajectory is one simulated journey using real road distances and drive times. City-scale analytics use a synthetic generator.

## Status (2026-10-09 checkpoint)

Planned and frozen in `contracts/` and `AGENTS.md`. Backend, ML, and sim are in progress on this branch. Frontend is deferred. Parallel agents were paused so work continues one lane at a time.

| Lane | Folder | State |
|---|---|---|
| Contracts | `contracts/` | Event schema, API, OSM-snapped cameras, OSRM route cache |
| Backend | `backend/` | FastAPI, SQLite, search, trajectory, analytics, alerts, simulate API |
| ML | `ml/` | Ingest started. Detection, OCR, consensus still to finish |
| Sim / QA | `sim/` | Generator, scenarios, seed, smoke, clip notes |
| Frontend | `frontend/` | Scaffold only. Not in scope this checkpoint |

## Layout

- `contracts/` shared schema, camera registry, API, OSRM cache
- `backend/` FastAPI + SQLite (WAL)
- `ml/` clip to Event pipeline
- `sim/` synthetic traffic, demo seed, clip download notes
- `frontend/` dashboard (later)
- `data/videos/` drop `CAM01.mp4` through `CAM05.mp4` (not in git)

## Stack

Python 3.11, FastAPI, SQLite, Ultralytics YOLO, ByteTrack, PaddleOCR (or fast-plate-ocr after a clip bake-off), OpenCV. Public OSRM used only to fill a cache. Demo runs from `contracts/osrm_cache.json` plus SQLite. Frontend later: React, Vite, TypeScript, MapLibre, deck.gl.

Login is password-free: pick `viewer`, `analyst`, or `admin`. Plate search needs analyst or admin and is audited.

## Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health: http://127.0.0.1:8000/health

```bash
curl -X POST http://127.0.0.1:8000/api/login -H "Content-Type: application/json" -d "{\"role\":\"analyst\"}"
```

Tests:

```bash
cd backend
python -m pytest tests -q
```

## Cameras

Five sites on the Hitech City to Financial District corridor. Coordinates were snapped to drivable roads with OSM + OSRM. Evidence: `contracts/cameras_report.md`.

| ID | Place |
|---|---|
| CAM01 | Hitech City Junction |
| CAM02 | Madhapur |
| CAM03 | Kondapur |
| CAM04 | Gachibowli Junction |
| CAM05 | Financial District |

Simulate a trip: `POST /api/simulate` (presets: `normal_trip`, `cloned_plate`, `fuzzy_plate`, `watchlist_hit`).

## Stills demo

The current judge view uses five still images in `data/images/` (CAM01.png through CAM05.png), not video. `ml/run_images.py` OCRs each still, writes `ml/out/stills.jsonl`, and POSTs one `real_clip` event per camera. Open http://127.0.0.1:5173/demo to see each input image beside that camera's OCR output from GET /api/events.

## Next

1. Finish and test backend simulate + cache-first routing.
2. Finish sim seed and smoke tests against a running API.
3. Finish ML clip runner when `data/videos/` has the five YouTube cuts.
4. Frontend control room after the API is stable.
