# Decisions

- Product name in the UI is Plate Trace. The repo remains VahanNetra.
- `http://127.0.0.1:8000/openapi.json` was not reachable while this was built. Types follow the FastAPI handlers in `backend/main.py`, `backend/schemas.py`, `backend/trajectory.py`, `backend/analytics.py`, `backend/alerts.py` and `backend/simulate.py`.
- Login uses BubbledotICG-FinePos from the OnlineWebFonts stylesheet, with Geist Pixel Circle as a local fallback. `public/fonts/GeistPixel-Circle.woff2` and `public/logo.webp` were not in the repo, so the headline falls back to monospace and the logo falls back to the letters PT.
- The internal dashboard reference image was not attached. The signed-in pages use a dark sidebar, glassy panels and the stat row from the written layout.
- The Simulated feed badge stays in the top bar on every signed-in page so simulated journeys are never unlabeled.
- Login stats render only values returned by `GET /api/cameras`, `GET /api/events` and `GET /health`. If those calls fail, the row is hidden.
- Camera markers use `GET /api/cameras`. If that call fails, `src/config/cameras.ts` is used and the map says to verify coordinates.
- Heat on the live map is counted from `GET /api/events`, split by `source`. If the events list is empty, `GET /api/analytics/heatmap` points are drawn and labeled as source not returned. No random points are added.
- Simulate playback follows road geometry. Segments whose `routing_source` is `osrm` are drawn as returned. Other segments call `VITE_ROUTING_URL` and are labeled Approximate road route. If that call fails, the segment is not drawn as a straight line.
- Playback compresses clock time so one minute of sighting time lasts about one second at 1x, then 2x and 4x speed up that playback. Sightings enter the feed only after the marker reaches the camera.
- `GET /api/analytics/speed` returns one average per camera, not a segment series and not a time series. Those two charts call `src/api/missing.ts` and show Backend endpoint not available yet.
- `GET /api/audit` returns id, user, role, query and time. Action, result count and outcome are shown as Not returned by API.
- Plate search returns plate text and match type only. Last camera, time and count are filled from the latest events page when that plate is present. They are not invented when it is absent.
- `plate_image_ref` is not served by the API. Simulated and synthetic sightings use the placeholder card. A real sighting with an http(s) URL would show that image. A file path is shown as text.
- Watchlist add sends `plate_text` and `note`, which is what `POST /api/watchlist` accepts.
- Viewer route guards hide search, simulate, watchlist, trajectory and the Audit log nav. `/audit` shows Not permitted for your role, then returns to the live map.
