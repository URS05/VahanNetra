from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RawRead(BaseModel):
    frame_idx: int
    text: str
    conf: float


class EventIn(BaseModel):
    event_id: str
    plate_text: str
    plate_confidence: float = Field(ge=0, le=1)
    format_valid: bool
    raw_reads: list[RawRead] = []
    camera_id: str
    timestamp: str
    direction: Literal["N", "NE", "E", "SE", "S", "SW", "W", "NW", "IN", "OUT"]
    lane: int
    vehicle_type: Literal["car", "bike", "truck", "bus", "auto", "other"]
    vehicle_color: str
    speed_estimate: float | None = None
    plate_image_ref: str = ""
    source: Literal["real_clip", "simulated", "synthetic"]


class EventBatch(BaseModel):
    events: list[EventIn]


class LoginIn(BaseModel):
    role: Literal["viewer", "analyst", "admin"]


class WatchlistIn(BaseModel):
    plate_text: str
    note: str = ""


class SimulateIn(BaseModel):
    plate: str
    camera_order: list[str] = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
    start_time: str | None = None
    speed_factor: float = Field(default=1.0, gt=0)
    jitter_pct: float = Field(default=0.05, ge=0)
    preset: str | None = None
