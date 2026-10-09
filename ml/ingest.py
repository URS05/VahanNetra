"""Video file or webcam frames with UTC timestamps."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from config import (
    DEFAULT_FPS,
    DRY_RUN_SOURCE,
    FRAME_STRIDE,
    SYNTH_CHAR_STEP,
    SYNTH_FONT_SCALE,
    SYNTH_FONT_THICK,
    SYNTH_FRAME_TEXT,
    SYNTH_FRAMES,
    SYNTH_H,
    SYNTH_PLATE,
    SYNTH_W,
    WEBCAM_MAX_FRAMES,
)

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
    max_frames: int | None = None,
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
                if max_frames and kept >= max_frames:
                    break
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


def synth_text_for_frame(frame_idx: int) -> str:
    return SYNTH_FRAME_TEXT.get(frame_idx, SYNTH_PLATE)


def _paint_synthetic(cv2, np, frame_idx: int, count: int):
    """Gray vehicle, white plate, black glyphs. Not a photograph."""
    frame = np.full((SYNTH_H, SYNTH_W, 3), 25, dtype=np.uint8)
    car_w, car_h = 300, 150
    span = max(1, count - 1)
    x = 40 + int((SYNTH_W - car_w - 80) * (frame_idx / span))
    y = 210
    cv2.rectangle(frame, (x, y), (x + car_w, y + car_h), (170, 170, 165), -1)
    text = synth_text_for_frame(frame_idx)
    plate_w = 16 + SYNTH_CHAR_STEP * max(1, len(text))
    plate_h = 52
    px = x + 28
    py = y + car_h - plate_h - 16
    cv2.rectangle(frame, (px, py), (px + plate_w, py + plate_h), (250, 250, 250), -1)
    baseline = py + 38
    for i, ch in enumerate(text):
        cv2.putText(
            frame,
            ch,
            (px + 8 + i * SYNTH_CHAR_STEP, baseline),
            cv2.FONT_HERSHEY_SIMPLEX,
            SYNTH_FONT_SCALE,
            (5, 5, 5),
            SYNTH_FONT_THICK,
            cv2.LINE_AA,
        )
    return frame


def iter_synthetic_frames(
    camera_id: str,
    clip_start: str | None = None,
    count: int | None = None,
) -> Iterator[FramePacket]:
    """Dry-run frames when clips are missing. Events from these use source synthetic."""
    try:
        import cv2
        import numpy as np
    except Exception as exc:
        log.error("OpenCV missing, cannot build synthetic frames: %s", exc)
        return
    n = count if count is not None else SYNTH_FRAMES
    n = max(1, n)
    start = parse_clip_start(clip_start)
    fps = DEFAULT_FPS
    log.info(
        "synthetic ingest camera=%s frames=%s source_tier=%s plate=%s",
        camera_id,
        n,
        DRY_RUN_SOURCE,
        SYNTH_PLATE,
    )
    for i in range(n):
        yield FramePacket(
            frame=_paint_synthetic(cv2, np, i, n),
            frame_idx=i,
            timestamp=start + timedelta(seconds=i / fps),
            fps=fps,
            path="synthetic://dry-run",
        )
