"""Video file or webcam frames with UTC timestamps."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from config import DEFAULT_FPS, FRAME_STRIDE, WEBCAM_MAX_FRAMES

log = logging.getLogger("ml.ingest")


@dataclass
class FramePacket:
    frame: object
    frame_idx: int
    timestamp: datetime
    fps: float
    path: str


def _open_capture(source: str | int):
    try:
        import cv2
    except Exception as exc:
        log.error("OpenCV missing, cannot ingest: %s", exc)
        return None, None
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        log.error("Could not open video source: %s", source)
        return None, None
    return cv2, cap


def parse_clip_start(clip_start: str | None) -> datetime:
    if not clip_start:
        return datetime.now(timezone.utc)
    text = clip_start.replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def resolve_source(video: str) -> str | int:
    if video.isdigit():
        return int(video)
    return video


def iter_frames(
    video: str,
    camera_id: str,
    clip_start: str | None = None,
    frame_stride: int | None = None,
) -> Iterator[FramePacket]:
    """Yield frames. camera_id is logged only; timestamps start at clip_start."""
    stride = frame_stride if frame_stride is not None else FRAME_STRIDE
    stride = max(1, stride)
    start = parse_clip_start(clip_start)
    source = resolve_source(video)
    cv2, cap = _open_capture(source)
    if cap is None:
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if fps < 1.0:
        fps = DEFAULT_FPS
        log.warning("Bad FPS on %s, using %s", video, fps)

    log.info("ingest camera=%s source=%s fps=%.2f stride=%s", camera_id, video, fps, stride)
    idx = 0
    kept = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if WEBCAM_MAX_FRAMES and isinstance(source, int) and idx >= WEBCAM_MAX_FRAMES:
                break
            if idx % stride == 0:
                ts = start + timedelta(seconds=idx / fps)
                yield FramePacket(
                    frame=frame,
                    frame_idx=idx,
                    timestamp=ts,
                    fps=fps,
                    path=str(video),
                )
                kept += 1
            idx += 1
    except Exception as exc:
        log.error("ingest stopped after frame %s: %s", idx, exc)
    finally:
        cap.release()
    log.info("ingest done frames_read=%s yielded=%s", idx, kept)


def video_exists(video: str) -> bool:
    if video.isdigit():
        return True
    return Path(video).is_file()
