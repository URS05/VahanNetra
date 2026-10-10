# VahanNetra (SIH 2026 PS 26127)

Build a live-demo prototype of a city-wide multi-camera ANPR platform for Hyderabad. Isolated camera feeds become one connected system: reliable plate reading, full vehicle trajectories on a map, city traffic analytics, and real-time alerts. Working thin slice beats unfinished coverage.

## Hard constraints
- Total build time is 21 hours, solo integrator. Prefer the simplest thing that works.
- No model training or fine-tuning. Use pretrained models only.
- Everything must run offline on one gaming laptop with an NVIDIA GPU. No paid APIs. Network features (OSRM, map tiles) need a cached or offline fallback.
- We cannot film our own footage. Data comes from three tiers, and every event must carry its tier in the source field:
  1. real_clip: YouTube clips (one per camera) run through the real detection, tracking and OCR pipeline.
  2. simulated: one hero vehicle's journey across all cameras, created by POST /api/simulate using OSRM road distances and drive times. Only one camera's sighting (if any) comes from a real read, the rest are injected.
  3. synthetic: bulk generated traffic for city-scale analytics (heatmap, density, OD, congestion).
- Never present simulated or synthetic data as real. Label it in the UI (Simulated tag on every simulated sighting, Simulated feed badge in the top bar) and in the data itself.
- Never reuse a plate crop from a real clip as the photo at cameras where that plate was only simulated. Show a Simulated sighting placeholder card there.
- Login is password-free: POST /api/login with role only (viewer, analyst, admin).
- Feature freeze at hour 16. After that, only bug fixes.

## Stack (fixed, do not swap without asking)
- ML: Python 3.11, Ultralytics YOLO (pretrained, vehicle detection plus a pretrained plate detector), Ultralytics built-in ByteTrack, OCR with fast-plate-ocr or PaddleOCR (pick whichever gives better results on the sample clips, decide in the first 90 minutes), OpenCV.
- Backend: FastAPI, SQLite (WAL mode) via SQLAlchemy, in-process asyncio queue, WebSocket for push. Pydantic models from contracts/event_schema.json.
- Frontend: React, Vite, TypeScript, MapLibre GL, deck.gl (heatmap, arcs, paths), Recharts, Tailwind.
- Routing: public OSRM endpoint (driving profile) used for two things only: road-snapped paths and realistic distance and drive time between consecutive cameras. Every result is cached in the database and in contracts/osrm_cache.json. Warm the cache for every camera pair and every simulate preset before the demo so it runs fully offline. Straight-line fallback, drawn dashed and labeled inferred. OSRM does no detection or tracking and knows nothing about live traffic.
- Cameras sit on real roads along the Hitech City to Financial District corridor. Coordinates live only in contracts/cameras.json.
- Infra: Docker Compose for the final bundle, but local dev runs without Docker first.

## Folder ownership (never edit outside your folder)
- /contracts : owned by the integrator only.
- /ml : Agent ML
- /backend : Agent Backend
- /frontend : Agent Frontend
- /sim : Agent Sim and QA
If you need a change in another folder, write it under REQUESTS in your final message and stop. Do not edit it.

## Terminology (use exactly)
- Modules: M1 ANPR/OCR Engine, M2 Trajectory Engine, M3 Traffic Analytics, M4 Alerts.
- Event means one vehicle sighting at one camera, as defined in contracts/event_schema.json.
- Possible match means a fuzzy plate match below the confident threshold.
- Inferred segment means a road-snapped or straight-line gap between two sightings.
- Simulated sighting means an event created by POST /api/simulate, with source simulated.
- Simulate panel means the sidebar UI that runs a simulated vehicle journey.

## Engineering rules
- Every task ends with: how to run it, how to test it, what was verified, what is not done.
- Write a small test or script for each deliverable. A feature is not done until it has been run once end to end.
- Keep files small and functions readable. No clever abstractions. No new dependencies without a one-line reason.
- Config in one place per module (config.py or config.ts). No magic numbers inline.
- Log clearly. On any failure, degrade gracefully and show a status in the UI, never crash the demo.
- Do not use em dashes or en dashes in any UI text, docs or comments. Use commas, colons or hyphens.
- Do not git commit unless the integrator asks.

## Definition of done (demo script)
1. Map of Hyderabad with 5 cameras and a live heatmap.
2. OCR on hard clips shows the per-frame reads, the voted result and confidence.
3. Open the Simulate panel, choose the camera route (CAM01 to CAM05), enter a plate, click Simulate: a vehicle marker moves along the road-snapped path and each camera sighting appears as it is reached. Then search the plate: the full trajectory shows with timestamps, direction arrows, inferred segments dashed, and a Simulated tag on simulated sightings.
4. Search a plate with one wrong character: fuzzy match returns it as possible match.
5. Analytics: density, average speed, origin-destination flows, congestion hotspot.
6. Add a plate to the watchlist, replay a clip: alert pops up live within seconds.
7. Impossible-travel (cloned plate) alert is shown once.
8. Audit log screen shows who searched what and when. Login has roles: viewer, analyst, admin. Password-free.
