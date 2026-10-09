"""One clip in, Event objects out. Dry-run paints frames when the file is missing."""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime
from pathlib import Path

from config import (
    CAMERAS_JSON,
    DRY_RUN_SOURCE,
    EVENT_SOURCE,
    EVENTS_JSONL,
    MIN_TRACK_HITS,
    REPLAY_MAX_SLEEP_SEC,
    ROOT,
    SKIP_EMPTY_PLATE,
)
from consensus import best_single, vote
from crops import consider
from detect_track import Detector, TrackBook, compass_from_motion, lane_from_x, vehicle_color
from emit import build_event, emit_event, majority, save_plate_crop, speed_kmh
from ingest import iter_frames, iter_synthetic_frames, video_exists
from ocr import build_reader
from validate_events import validate_event

log = logging.getLogger("ml.run")


def load_camera(camera_id: str) -> dict:
    rows = json.loads(CAMERAS_JSON.read_text(encoding="utf-8"))
    for row in rows:
        if row["camera_id"] == camera_id:
            return row
    known = ", ".join(row["camera_id"] for row in rows)
    raise SystemExit(f"unknown camera {camera_id}. known: {known}")


def default_video(camera: dict) -> str:
    rel = camera.get("video_file") or ""
    return str((ROOT / rel).resolve()) if rel else ""


def _finish_track(tr, camera, reader, source: str, heading: float, lanes: int):
    if tr.hits < MIN_TRACK_HITS:
        log.info("track %s dropped, hits=%s", tr.track_id, tr.hits)
        return None
    reads = []
    for crop in tr.crops:
        read = reader.read(crop.image, crop.frame_idx)
        if read is not None:
            reads.append(read)
            log.info("ocr track=%s frame=%s text=%s conf=%.3f", tr.track_id, read.frame_idx, read.text, read.conf)
    result = vote(reads)
    if SKIP_EMPTY_PLATE and not result.plate_text:
        log.info("track %s skipped, empty plate (single=%s)", tr.track_id, best_single(reads))
        return None
    best = tr.crops[0] if tr.crops else None
    stamp: datetime = best.timestamp if best is not None else datetime.now()
    event_id_crop = best.image if best is not None else None
    # id is assigned in build_event; save crop after we know the id
    direction = compass_from_motion(tr.points, heading)
    lane = lane_from_x(tr.last_cx, tr.frame_w, lanes)
    vtype = majority(tr.types, "other")
    color = majority([c for c in tr.colors if c and c != "unknown"], "unknown")
    dt_sec = 0.0
    if len(tr.crops) >= 2:
        dt_sec = abs((tr.crops[-1].timestamp - tr.crops[0].timestamp).total_seconds())
    speed = speed_kmh(tr.points, dt_sec if dt_sec > 0 else 1.0)
    event = build_event(
        plate_text=result.plate_text,
        plate_confidence=result.plate_confidence,
        format_ok=result.format_valid,
        raw_reads=result.raw_reads,
        camera_id=camera["camera_id"],
        timestamp=stamp,
        direction=direction,
        lane=lane,
        vehicle_type=vtype,
        vehicle_color=color,
        speed_estimate=speed,
        plate_image_ref="",
        source=source,
    )
    ref = save_plate_crop(event_id_crop, event["event_id"])
    event["plate_image_ref"] = ref
    errors = validate_event(event)
    if errors:
        log.error("event failed schema, dropped: %s", "; ".join(errors))
        return None
    log.info(
        "event %s plate=%s conf=%.3f format=%s dir=%s source=%s",
        event["event_id"],
        event["plate_text"],
        event["plate_confidence"],
        event["format_valid"],
        event["direction"],
        event["source"],
    )
    return event


def process_source(
    camera_id: str = "CAM01",
    video: str = "",
    clip_start: str | None = None,
    dry_run: bool = False,
    replay: bool = False,
    max_frames: int = 0,
    jsonl_path: str | Path | None = None,
    do_post: bool = False,
    allow_template: bool | None = None,
) -> list[dict]:
    camera = load_camera(camera_id)
    heading = float(camera.get("heading") or 0)
    lanes = int(camera.get("lanes") or 1)
    if dry_run:
        packets = iter_synthetic_frames(camera_id, clip_start, count=max_frames or None)
        mode = "geometric"
        source = DRY_RUN_SOURCE
        use_template = True if allow_template is None else allow_template
    else:
        path = video or default_video(camera)
        if not video_exists(path):
            log.error("video missing: %s. Re-run with --dry-run.", path)
            return []
        packets = iter_frames(path, camera_id, clip_start, max_frames=max_frames or None)
        mode = "yolo"
        source = EVENT_SOURCE
        use_template = False if allow_template is None else allow_template
    detector = Detector(mode=mode)
    reader = build_reader(allow_template=use_template)
    book = TrackBook()
    events: list[dict] = []
    dest = Path(jsonl_path) if jsonl_path else EVENTS_JSONL
    last_stamp = None
    frame_idx_seen = -1

    def _emit(tr):
        nonlocal last_stamp
        event = _finish_track(tr, camera, reader, source, heading, lanes)
        if event is None:
            return
        if replay and last_stamp is not None:
            gap = _gap_seconds(last_stamp, event["timestamp"])
            time.sleep(min(max(gap, 0.0), REPLAY_MAX_SLEEP_SEC))
        last_stamp = event["timestamp"]
        emit_event(event, dest, do_post=do_post)
        events.append(event)

    for packet in packets:
        frame = packet.frame
        frame_idx_seen = packet.frame_idx
        height, width = frame.shape[:2]
        dets = detector.process(frame)
        for det in dets:
            book.observe(det, packet.frame_idx, vehicle_color(_crop(frame, det.xyxy)), width, height)
            tr = book.live.get(det.track_id)
            if tr is not None:
                consider(tr.crops, frame, det.plate_xyxy, packet.frame_idx, packet.timestamp)
        for done in book.pop_finished(packet.frame_idx):
            _emit(done)
    if frame_idx_seen < 0:
        log.error("no frames ingested")
        return events
    for done in book.flush():
        _emit(done)
    log.info("done events=%s detector=%s ocr=%s", len(events), detector.backend, reader.name)
    return events


def _crop(frame, xyxy):
    x1, y1, x2, y2 = xyxy
    return frame[y1:y2, x1:x2]


def _gap_seconds(prev_iso: str, curr_iso: str) -> float:
    prev = datetime.fromisoformat(prev_iso.replace("Z", "+00:00"))
    curr = datetime.fromisoformat(curr_iso.replace("Z", "+00:00"))
    return (curr - prev).total_seconds()


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="VahanNetra M1: one clip to events")
    parser.add_argument("--video", default="", help="Video path. Default is the camera file in contracts/cameras.json")
    parser.add_argument("--camera", default="CAM01")
    parser.add_argument("--clip-start", default=None, help="ISO UTC start time for frame 0")
    parser.add_argument("--replay", action="store_true", help="Sleep between events to follow clip time")
    parser.add_argument("--dry-run", action="store_true", help="Paint synthetic frames when clips are missing")
    parser.add_argument("--max-frames", type=int, default=0, help="Stop after this many yielded frames. 0 means all")
    parser.add_argument("--no-post", action="store_true", help="Skip POST /api/events. JSONL is still written")
    parser.add_argument("--jsonl", default=str(EVENTS_JSONL))
    args = parser.parse_args(argv)
    events = process_source(
        camera_id=args.camera,
        video=args.video,
        clip_start=args.clip_start,
        dry_run=args.dry_run,
        replay=args.replay,
        max_frames=args.max_frames,
        jsonl_path=args.jsonl,
        do_post=not args.no_post,
    )
    print(f"events={len(events)} jsonl={args.jsonl}")
    if not events:
        return 2 if not args.dry_run else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
