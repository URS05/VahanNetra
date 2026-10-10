from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Direction = Literal["N", "NE", "E", "SE", "S", "SW", "W", "NW", "IN", "OUT"]
VehicleType = Literal["car", "bike", "truck", "bus", "auto", "other"]
SourceTier = Literal["real_clip", "simulated", "synthetic"]


class RawRead(BaseModel):
    frame_idx: int
    text: str
    conf: float


class Event(BaseModel):
    event_id: str
    plate_text: str
    plate_confidence: float = Field(ge=0, le=1)
    format_valid: bool
    raw_reads: list[RawRead] = []
    camera_id: str
    timestamp: str
    direction: Direction
    lane: int
    vehicle_type: VehicleType
    vehicle_color: str
    speed_estimate: float | None = None
    plate_image_ref: str = ""
    source: SourceTier


class SimulateIn(BaseModel):
    plate: str
    camera_order: list[str] = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
    start_time: str | None = None
    speed_factor: float = 1.0
    jitter_pct: float = 0.05
    preset: str | None = None
