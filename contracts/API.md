# VahanNetra API

Base URL: `http://127.0.0.1:8000`

Auth is password-free. `POST /api/login` with `{ "role": "viewer" | "analyst" | "admin" }`. Returns `{ "token", "role" }`. Send `Authorization: Bearer <token>`. Plate search and trajectory need analyst or admin.

## Events
- `POST /api/events` body: one Event or `{ "events": [Event, ...] }`
- `GET /api/events`

## Simulate
- `POST /api/simulate` body `{ plate, camera_order[], start_time, speed_factor, jitter_pct, preset (optional) }`. For each consecutive camera pair, get distance and duration from OSRM (cached), create one event per camera with source `simulated` and cumulative timestamps plus jitter, run normal alert and impossible-travel checks, broadcast on `/ws/events`, return the ordered events and path segments.
- `GET /api/simulate/presets` returns `normal_trip` (CAM01 to CAM05 in order), `cloned_plate` (same plate at CAM01 and CAM05 within 2 minutes), `fuzzy_plate` (plate with one wrong character at one camera), `watchlist_hit` (a chosen plate arrives at a chosen camera).

## Cameras
- `GET /api/cameras`

## Plates
- `GET /api/plates/search?q=&fuzzy=true&from=&to=`
  - `match_type`: `exact` or `possible`

## Trajectory (M2)
- `GET /api/trajectory/{plate}?fuzzy=true`

## Analytics (M3)
- `GET /api/analytics/density?from=&to=&bucket=`
- `GET /api/analytics/speed`
- `GET /api/analytics/od`
- `GET /api/analytics/congestion`
- `GET /api/analytics/heatmap?t=`

## Alerts (M4)
- `GET|POST|DELETE /api/watchlist`
- `GET /api/alerts`
- `WS /ws/alerts`
- `WS /ws/events`

## Audit
- `GET /api/audit`

## Login
- `POST /api/login` `{ "role": "analyst" }` no password
