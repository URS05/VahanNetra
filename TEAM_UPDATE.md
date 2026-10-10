# VahanNetra — Team update (for PPT)

SIH 2026 | PS 26127 | City-wide multi-camera ANPR for Hyderabad

Use this note as PPT outline. Keep slides short.

---

## One line pitch

We connect 5 cameras into one system: read plates, show vehicle path on map, city traffic stats, and live alerts.

---

## Modules

| Module | What it does |
|---|---|
| M1 ANPR / OCR | Detect vehicle, find plate, read text, vote best plate |
| M2 Trajectory | Search plate, show path across cameras on map |
| M3 Analytics | Density, speed, OD flows, congestion, heatmap |
| M4 Alerts | Watchlist hit, cloned plate, circling |

---

## Stack we are using

**Demo / current build**

- ML: Python 3.11, Ultralytics YOLO (pretrained), ByteTrack, OpenCV, PaddleOCR (default)
- Backend: FastAPI, SQLite (WAL), WebSocket
- Routing: OSRM (cached offline in `contracts/osrm_cache.json`)
- Frontend (planned): React, Vite, TypeScript, MapLibre GL, deck.gl, Recharts, Tailwind
- Login: password-free roles (viewer / analyst / admin)

**Explored, not required for thin demo**

- fast-plate-ocr (alternate OCR; we may switch after clip bake-off)
- Dedicated plate detector weights (pretrained plate model when we have the `.pt` file)
- GPU path (demo can run CPU; full laptop demo targets NVIDIA GPU)
- Docker Compose (final bundle; local run works without Docker first)

**For full product later (not demo)**

- Stronger OCR / plate models on real CCTV
- Live camera ingest (not YouTube clips)
- Real-time city traffic feed (OSRM today is only road snap + drive time cache)
- Hardened deploy with Docker

---

## Data honesty (say this in demo)

Three labeled sources. Never call fake data real.

1. `real_clip` — YouTube clip through real detect + track + OCR
2. `simulated` — hero trip across cameras via `POST /api/simulate` (OSRM road times)
3. `synthetic` — bulk traffic for heatmap / analytics

UI must show Simulated tags. No fake plate photo on simulated-only cameras.

---

## Cameras (Hyderabad corridor)

CAM01 Hitech City → CAM02 Madhapur → CAM03 Kondapur → CAM04 Gachibowli → CAM05 Financial District

---

## What changed recently (code update)

Pushed as 3 separate PRs into `checkpoint/sih-2026-scaffold`:

1. **ML** (`feat/ml-anpr-pipeline`)
   - Full clip pipeline files: detect/track, OCR, consensus vote, crops, emit events
   - Config + ingest updates
   - Dry-run / test / validate scripts
   - Logic update: multi-frame vote beats single bad OCR read

2. **Backend** (`feat/backend-routing-tests`)
   - Routing logic fix for simulate / OSRM path
   - Trajectory + simulate tests updated

3. **Sim** (`feat/sim-demo-scenarios`)
   - Demo presets + scenario JSON (normal trip, fuzzy, cloned, circling, watchlist)
   - Seed / smoke / generate updates for demo checklist

**Still open**

- Frontend control room (teammate lane)
- Real CAM01–CAM05 clips in `data/videos/`
- Merge the 3 PRs, then pull

---

## Demo flow (PPT story)

1. Map + 5 cameras + heatmap  
2. OCR on a clip: per-frame reads → voted plate + confidence  
3. Simulate panel: CAM01→CAM05, plate moves on road path  
4. Fuzzy search (one wrong character) → possible match  
5. Analytics slides: density, speed, OD, hotspot  
6. Watchlist alert pops live  
7. Cloned plate (impossible travel) once  
8. Audit log + role login (no password)

---

## Handy demo plates

| Use | Plate |
|---|---|
| Hero trip | TS09VN2612 |
| Fuzzy search | TS09VN2613 |
| Watchlist | TS09WL9999 |
| Cloned | TS09CL0001 |
| Circling | TS09CR4444 |

---

## Repo

https://github.com/URS05/VahanNetra

Base branch for current work: `checkpoint/sih-2026-scaffold`

Frontend teammate needs Write access, then PRs into that branch (or `main` after merge).

---

## PPT slide list (quick)

1. Problem + pitch  
2. Architecture (M1–M4 + event stream)  
3. Stack (demo vs later)  
4. Data tiers (real / sim / synthetic)  
5. Map + cameras  
6. OCR pipeline  
7. Trajectory + simulate  
8. Analytics  
9. Alerts  
10. Roles + audit  
11. What’s done / what’s next (frontend)
