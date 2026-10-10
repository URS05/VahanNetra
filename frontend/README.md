# Plate Trace

Frontend for the VahanNetra Hyderabad plate tracking demo.

## Run

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The API is expected at `http://127.0.0.1:8000`.

## Check

```bash
npm run typecheck
npm run lint
npm run check:dashes
npm run build
```

Open `/login`, choose Viewer, Analyst or Admin, then visit Live map, Analytics and Audit log.

## What is verified

Run the scripts above, then sign in against a live API and exercise search, simulate, trajectory, alerts, analytics and audit.

## Not done

Image files `public/logo.webp` and `public/fonts/GeistPixel-Circle.woff2` are optional. See `DECISIONS.md` for API fields the backend does not return.
