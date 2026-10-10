from __future__ import annotations

import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import analytics as analytics_mod
from alerts import alert_payload, circling, create_alert, watchlist_hit
from config import CONTRACTS, ROLES, SEARCH_ROLES
from db import Base, SessionLocal, engine, get_db
from models import Alert, AuditLog, CachedRoute, Camera, Event, User, Watchlist
from routing import ensure_route_columns, load_osrm_file_cache, prewarm_missing_pairs
from schemas import EventBatch, EventIn, LoginIn, SimulateIn, WatchlistIn
from simulate import PRESETS, build_simulated_journey
from trajectory import build_trajectory, find_plates

TOKENS: dict[str, dict] = {}


class Hub:
    def __init__(self):
        self.alert_clients: list[WebSocket] = []
        self.event_clients: list[WebSocket] = []

    async def broadcast(self, group: str, payload: dict):
        clients = self.alert_clients if group == "alerts" else self.event_clients
        dead = []
        for ws in clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            clients.remove(ws)


hub = Hub()


def seed(db: Session):
    cameras = json.loads((CONTRACTS / "cameras.json").read_text(encoding="utf-8"))
    cols = {c.key for c in Camera.__table__.columns}
    if db.query(Camera).count() == 0:
        for row in cameras:
            db.add(Camera(**{k: v for k, v in row.items() if k in cols}))
    if db.query(User).count() == 0:
        for role in ROLES:
            db.add(User(username=role, role=role))
    db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_route_columns(engine)
    db = SessionLocal()
    try:
        seed(db)
        load_osrm_file_cache(db)
        prewarm_missing_pairs(db)
    finally:
        db.close()
    yield


app = FastAPI(title="VahanNetra", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "login required")
    token = authorization.split(" ", 1)[1]
    user = TOKENS.get(token)
    if not user:
        raise HTTPException(401, "invalid token")
    return user


def require_search(user: dict = Depends(current_user)) -> dict:
    if user["role"] not in SEARCH_ROLES:
        raise HTTPException(403, "analyst or admin role required")
    return user


def event_to_row(body: EventIn) -> Event:
    return Event(
        event_id=body.event_id,
        plate_text=body.plate_text.upper().replace(" ", ""),
        plate_confidence=body.plate_confidence,
        format_valid=body.format_valid,
        raw_reads=json.dumps([r.model_dump() for r in body.raw_reads]),
        camera_id=body.camera_id,
        timestamp=parse_ts(body.timestamp),
        direction=body.direction,
        lane=body.lane,
        vehicle_type=body.vehicle_type,
        vehicle_color=body.vehicle_color,
        speed_estimate=body.speed_estimate,
        plate_image_ref=body.plate_image_ref,
        source=body.source,
    )


def event_out(e: Event) -> dict:
    return {
        "event_id": e.event_id,
        "plate_text": e.plate_text,
        "plate_confidence": e.plate_confidence,
        "format_valid": e.format_valid,
        "raw_reads": json.loads(e.raw_reads),
        "camera_id": e.camera_id,
        "timestamp": e.timestamp.isoformat() + "Z",
        "direction": e.direction,
        "lane": e.lane,
        "vehicle_type": e.vehicle_type,
        "vehicle_color": e.vehicle_color,
        "speed_estimate": e.speed_estimate,
        "plate_image_ref": e.plate_image_ref,
        "source": e.source,
    }


async def ingest_one(db: Session, body: EventIn) -> Event:
    if db.get(Event, body.event_id):
        raise HTTPException(409, "duplicate event_id")
    row = event_to_row(body)
    db.add(row)
    db.commit()
    db.refresh(row)

    payload = event_out(row)
    await hub.broadcast("events", payload)

    hit = watchlist_hit(db, row.plate_text)
    if hit:
        alert = create_alert(
            db,
            "watchlist",
            row,
            f"Watchlist hit {row.plate_text} at {row.camera_id}",
            "high",
        )
        await hub.broadcast("alerts", alert_payload(alert))

    if circling(db, row):
        alert = create_alert(
            db,
            "circling",
            row,
            f"{row.plate_text} circling at {row.camera_id}",
            "medium",
        )
        await hub.broadcast("alerts", alert_payload(alert))

    traj = build_trajectory(db, row.plate_text, fuzzy=False)
    if traj.get("cloned_plate_flag"):
        existing = (
            db.query(Alert)
            .filter(Alert.kind == "cloned_plate", Alert.plate_text == row.plate_text)
            .first()
        )
        if not existing:
            alert = create_alert(
                db,
                "cloned_plate",
                row,
                f"Impossible travel for {row.plate_text}",
                "high",
            )
            await hub.broadcast("alerts", alert_payload(alert))

    return row


@app.get("/health")
def health(db: Session = Depends(get_db)):
    n = db.query(CachedRoute).count()
    return {
        "ok": True,
        "project": "VahanNetra",
        "routing": "cache-first",
        "cached_routes": n,
    }


@app.post("/api/login")
def login(body: LoginIn):
    token = secrets.token_urlsafe(24)
    TOKENS[token] = {"username": body.role, "role": body.role}
    return {"token": token, "role": body.role, "username": body.role}


@app.get("/api/cameras")
def cameras(db: Session = Depends(get_db)):
    rows = db.query(Camera).all()
    return [
        {
            "camera_id": c.camera_id,
            "name": c.name,
            "lat": c.lat,
            "lon": c.lon,
            "heading": c.heading,
            "lanes": c.lanes,
            "status": c.status,
            "video_file": c.video_file,
            "video_present": Path(c.video_file).exists()
            if Path(c.video_file).is_absolute()
            else (Path(__file__).resolve().parents[1] / c.video_file).exists(),
        }
        for c in rows
    ]


@app.post("/api/events")
async def post_events(body: EventIn | EventBatch, db: Session = Depends(get_db)):
    items = body.events if isinstance(body, EventBatch) else [body]
    stored = []
    for item in items:
        stored.append(event_out(await ingest_one(db, item)))
    return {"count": len(stored), "events": stored}


@app.get("/api/simulate/presets")
def simulate_presets():
    return PRESETS


@app.post("/api/simulate")
async def post_simulate(body: SimulateIn, db: Session = Depends(get_db)):
    try:
        built = build_simulated_journey(db, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    stored = []
    for item in built["events"]:
        stored.append(event_out(await ingest_one(db, item)))
    return {
        "preset": built["preset"],
        "plate": built["plate"],
        "count": len(stored),
        "events": stored,
        "segments": built["segments"],
    }


@app.get("/api/events")
def list_events(
    camera_id: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(Event).order_by(Event.timestamp.desc())
    if camera_id:
        q = q.filter(Event.camera_id == camera_id)
    return [event_out(e) for e in q.limit(limit).all()]


@app.get("/api/plates/search")
def search_plates(
    q: str,
    fuzzy: bool = True,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    user: dict = Depends(require_search),
    db: Session = Depends(get_db),
):
    db.add(AuditLog(user=user["username"], role=user["role"], query=q))
    db.commit()
    start = parse_ts(from_) if from_ else None
    end = parse_ts(to) if to else None
    hits = find_plates(db, q, fuzzy, start, end)
    return {
        "query": q,
        "results": [{"plate_text": plate, "match_type": kind} for plate, kind in hits],
    }


@app.get("/api/trajectory/{plate}")
def trajectory(
    plate: str,
    fuzzy: bool = True,
    user: dict = Depends(require_search),
    db: Session = Depends(get_db),
):
    db.add(AuditLog(user=user["username"], role=user["role"], query=plate))
    db.commit()
    return build_trajectory(db, plate, fuzzy)


@app.get("/api/analytics/density")
def density(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    bucket: int = 60,
    db: Session = Depends(get_db),
):
    return analytics_mod.density(db, from_, to, bucket)


@app.get("/api/analytics/speed")
def speed(db: Session = Depends(get_db)):
    return analytics_mod.average_speed(db)


@app.get("/api/analytics/od")
def od(db: Session = Depends(get_db)):
    return analytics_mod.origin_destination(db)


@app.get("/api/analytics/congestion")
def congestion(db: Session = Depends(get_db)):
    return analytics_mod.congestion(db)


@app.get("/api/analytics/heatmap")
def heatmap(t: str | None = None, db: Session = Depends(get_db)):
    return analytics_mod.heatmap(db, t)


@app.get("/api/watchlist")
def get_watchlist(db: Session = Depends(get_db)):
    return [
        {"plate_text": w.plate_text, "note": w.note, "created_at": w.created_at.isoformat() + "Z"}
        for w in db.query(Watchlist).all()
    ]


@app.post("/api/watchlist")
def add_watchlist(body: WatchlistIn, db: Session = Depends(get_db)):
    plate = body.plate_text.upper().replace(" ", "")
    row = db.get(Watchlist, plate) or Watchlist(plate_text=plate)
    row.note = body.note
    db.add(row)
    db.commit()
    return {"plate_text": plate, "note": body.note}


@app.delete("/api/watchlist/{plate}")
def delete_watchlist(plate: str, db: Session = Depends(get_db)):
    row = db.get(Watchlist, plate.upper().replace(" ", ""))
    if not row:
        raise HTTPException(404, "not on watchlist")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/alerts")
def list_alerts(db: Session = Depends(get_db)):
    rows = db.query(Alert).order_by(Alert.id.desc()).limit(200).all()
    return [alert_payload(a) for a in rows]


@app.get("/api/audit")
def audit(user: dict = Depends(current_user), db: Session = Depends(get_db)):
    if user["role"] == "viewer":
        raise HTTPException(403, "analyst or admin role required")
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
    return [
        {
            "id": r.id,
            "user": r.user,
            "role": r.role,
            "query": r.query,
            "time": r.time.isoformat() + "Z",
        }
        for r in rows
    ]


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await ws.accept()
    hub.alert_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in hub.alert_clients:
            hub.alert_clients.remove(ws)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    hub.event_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in hub.event_clients:
            hub.event_clients.remove(ws)
