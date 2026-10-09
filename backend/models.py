from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    role: Mapped[str] = mapped_column(String(16))


class Camera(Base):
    __tablename__ = "cameras"
    camera_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    heading: Mapped[int] = mapped_column(Integer)
    lanes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    video_file: Mapped[str] = mapped_column(String(256))


class Event(Base):
    __tablename__ = "events"
    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plate_text: Mapped[str] = mapped_column(String(16), index=True)
    plate_confidence: Mapped[float] = mapped_column(Float)
    format_valid: Mapped[bool] = mapped_column(Boolean)
    raw_reads: Mapped[str] = mapped_column(Text)
    camera_id: Mapped[str] = mapped_column(String(16), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    direction: Mapped[str] = mapped_column(String(8))
    lane: Mapped[int] = mapped_column(Integer)
    vehicle_type: Mapped[str] = mapped_column(String(16))
    vehicle_color: Mapped[str] = mapped_column(String(32))
    speed_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    plate_image_ref: Mapped[str] = mapped_column(String(256))
    source: Mapped[str] = mapped_column(String(16))


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Watchlist(Base):
    __tablename__ = "watchlist"
    plate_text: Mapped[str] = mapped_column(String(16), primary_key=True)
    note: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    plate_text: Mapped[str] = mapped_column(String(16), index=True)
    camera_id: Mapped[str] = mapped_column(String(16))
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    direction: Mapped[str] = mapped_column(String(8))
    plate_image_ref: Mapped[str] = mapped_column(String(256))
    priority: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(String(256))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user: Mapped[str] = mapped_column(String(32))
    role: Mapped[str] = mapped_column(String(16))
    query: Mapped[str] = mapped_column(String(128))
    time: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CachedRoute(Base):
    __tablename__ = "cached_routes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    coordinates: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16))
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)


Index("ix_events_plate_time", Event.plate_text, Event.timestamp)
Index("ix_events_cam_time", Event.camera_id, Event.timestamp)
