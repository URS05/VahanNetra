from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from config import CIRCLING_COUNT, CIRCLING_WINDOW_MINUTES, FUZZY_CONFIDENT_MAX_COST
from fuzzy import match_type, normalize_plate
from models import Alert, Event, Watchlist


def watchlist_hit(db: Session, plate: str) -> Watchlist | None:
    plate_n = normalize_plate(plate)
    for row in db.query(Watchlist).all():
        kind = match_type(plate_n, row.plate_text, FUZZY_CONFIDENT_MAX_COST)
        if kind:
            return row
    return None


def circling(db: Session, event: Event) -> bool:
    window_start = event.timestamp - timedelta(minutes=CIRCLING_WINDOW_MINUTES)
    n = (
        db.query(Event)
        .filter(
            Event.plate_text == event.plate_text,
            Event.camera_id == event.camera_id,
            Event.timestamp >= window_start,
            Event.timestamp <= event.timestamp,
        )
        .count()
    )
    return n >= CIRCLING_COUNT


def create_alert(
    db: Session,
    kind: str,
    event: Event,
    message: str,
    priority: str,
) -> Alert:
    alert = Alert(
        kind=kind,
        plate_text=event.plate_text,
        camera_id=event.camera_id,
        timestamp=event.timestamp,
        direction=event.direction,
        plate_image_ref=event.plate_image_ref,
        priority=priority,
        message=message,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def alert_payload(alert: Alert) -> dict:
    return {
        "id": alert.id,
        "kind": alert.kind,
        "plate_text": alert.plate_text,
        "camera_id": alert.camera_id,
        "timestamp": alert.timestamp.isoformat() + "Z",
        "direction": alert.direction,
        "plate_image_ref": alert.plate_image_ref,
        "priority": alert.priority,
        "message": alert.message,
    }
