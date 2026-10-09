"""Vehicle detect + track, then a plate box inside each vehicle."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from pathlib import Path

from config import (
    BOTTOM_PLATE_FRAC,
    COMPASS,
    DEVICE,
    GEOMETRIC_VEHICLE_THRESH,
    GEOMETRIC_VEHICLE_TYPE,
    IMGSZ,
    MAX_MATCH_PX,
    MIN_MOTION_PX,
    MIN_VEHICLE_AREA,
    MODELS_DIR,
    PLATE_ASPECT_MAX,
    PLATE_ASPECT_MIN,
    BOTTOM_BAND_MARGIN_FRAC,
    MIN_BRIGHT_PLATE_AREA,
    PLATE_BRIGHT_MIN,
    PLATE_SEARCH_Y_FRAC,
    PLATE_CONF,
    PLATE_PAD_PX,
    PLATE_WEIGHTS,
    TRACK_GONE_FRAMES,
    TRACKER,
    VEHICLE_CLASS_IDS,
    VEHICLE_CLASS_MAP,
    VEHICLE_CONF,
    VEHICLE_WEIGHTS,
)

log = logging.getLogger("ml.detect")


@dataclass
class Detection:
    track_id: int
    xyxy: tuple[int, int, int, int]
    plate_xyxy: tuple[int, int, int, int] | None
    vehicle_type: str
    det_conf: float
    plate_conf: float


@dataclass
class LiveTrack:
    track_id: int
    hits: int = 0
    last_seen: int = 0
    points: list[tuple[float, float]] = field(default_factory=list)
    types: list[str] = field(default_factory=list)
    colors: list[str] = field(default_factory=list)
    crops: list = field(default_factory=list)
    frame_w: int = 0
    frame_h: int = 0
    last_cx: float = 0.0


def resolve_vehicle_weights() -> str:
    local = MODELS_DIR / "yolov8n.pt"
    if local.is_file():
        return str(local)
    home = Path.home() / VEHICLE_WEIGHTS
    if home.is_file():
        return str(home)
    return VEHICLE_WEIGHTS


def bin_heading(deg: float) -> str:
    idx = int((deg % 360.0 + 22.5) // 45.0) % 8
    return COMPASS[idx]


def compass_from_motion(points: list[tuple[float, float]], heading_deg: float) -> str:
    """Image motion rotated by the camera heading. Up the frame follows the heading."""
    if len(points) < 2:
        return bin_heading(heading_deg)
    x0, y0 = points[0]
    x1, y1 = points[-1]
    dx, dy = x1 - x0, y1 - y0
    if math.hypot(dx, dy) < MIN_MOTION_PX:
        return bin_heading(heading_deg)
    ang = math.degrees(math.atan2(dx, -dy))
    return bin_heading((heading_deg + ang) % 360.0)


def lane_from_x(cx: float, frame_w: int, lanes: int) -> int:
    lanes = max(1, int(lanes))
    if frame_w <= 0:
        return 1
    lane = int((cx / frame_w) * lanes) + 1
    return max(1, min(lanes, lane))


def vehicle_color(bgr) -> str:
    try:
        import cv2
    except Exception as exc:
        log.error("OpenCV missing, color unknown: %s", exc)
        return "unknown"
    if bgr is None or getattr(bgr, "size", 0) == 0:
        return "unknown"
    h, w = bgr.shape[:2]
    y0, y1 = int(h * 0.25), int(h * 0.75)
    x0, x1 = int(w * 0.25), int(w * 0.75)
    sample = bgr[y0:y1, x0:x1]
    if sample.size == 0:
        sample = bgr
    hsv = cv2.cvtColor(sample, cv2.COLOR_BGR2HSV)
    hue = float(hsv[:, :, 0].mean())
    sat = float(hsv[:, :, 1].mean())
    val = float(hsv[:, :, 2].mean())
    if val < 55:
        return "black"
    if sat < 35 and val >= 190:
        return "white"
    if sat < 45:
        return "gray"
    if hue < 10 or hue >= 170:
        return "red"
    if hue < 20:
        return "orange"
    if hue < 35:
        return "yellow"
    if hue < 85:
        return "green"
    if hue < 130:
        return "blue"
    if hue < 160:
        return "purple"
    return "brown"


def _clip_box(box, width: int, height: int, pad: int = 0):
    x1, y1, x2, y2 = box
    x1 = max(0, min(width - 1, int(x1) - pad))
    y1 = max(0, min(height - 1, int(y1) - pad))
    x2 = max(0, min(width, int(x2) + pad))
    y2 = max(0, min(height, int(y2) + pad))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def _bottom_band(xyxy, frame_w: int, frame_h: int):
    x1, y1, x2, y2 = xyxy
    h = max(1, y2 - y1)
    w = max(1, x2 - x1)
    band_h = max(10, int(h * BOTTOM_PLATE_FRAC))
    margin = int(w * BOTTOM_BAND_MARGIN_FRAC)
    return _clip_box((x1 + margin, y2 - band_h, x2 - margin, y2), frame_w, frame_h)


class _CentroidBank:
    def __init__(self):
        self.tracks: dict[int, list[float]] = {}
        self.next_id = 1

    def assign(self, boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, tuple[int, int, int, int]]]:
        cands = []
        for bi, box in enumerate(boxes):
            cx = (box[0] + box[2]) / 2.0
            cy = (box[1] + box[3]) / 2.0
            for tid, st in self.tracks.items():
                dist = math.hypot(cx - st[0], cy - st[1])
                if dist <= MAX_MATCH_PX:
                    cands.append((dist, bi, tid, cx, cy))
        cands.sort(key=lambda row: row[0])
        assigned_b: set[int] = set()
        assigned_t: set[int] = set()
        chosen: dict[int, tuple[int, float, float]] = {}
        for _dist, bi, tid, cx, cy in cands:
            if bi in assigned_b or tid in assigned_t:
                continue
            assigned_b.add(bi)
            assigned_t.add(tid)
            chosen[bi] = (tid, cx, cy)
        out = []
        seen = set()
        for bi, box in enumerate(boxes):
            if bi in chosen:
                tid, cx, cy = chosen[bi]
            else:
                tid = self.next_id
                self.next_id += 1
                cx = (box[0] + box[2]) / 2.0
                cy = (box[1] + box[3]) / 2.0
            self.tracks[tid] = [cx, cy, 0]
            seen.add(tid)
            out.append((tid, box))
        for tid in list(self.tracks):
            if tid in seen:
                continue
            self.tracks[tid][2] += 1
            if self.tracks[tid][2] > TRACK_GONE_FRAMES:
                del self.tracks[tid]
        return out


class Detector:
    def __init__(self, mode: str = "yolo"):
        self.mode = mode
        self.vehicle = None
        self.plate = None
        self.device = DEVICE or None
        self._bank = _CentroidBank()
        self.backend = "geometric"
        if mode == "yolo":
            self._load_yolo()

    def _load_yolo(self):
        try:
            from ultralytics import YOLO
        except Exception as exc:
            log.error("ultralytics unavailable, geometric detector only: %s", exc)
            return
        weights = resolve_vehicle_weights()
        try:
            self.vehicle = YOLO(weights)
            self.backend = "yolo+bytetrack"
            log.info("vehicle weights %s", weights)
        except Exception as exc:
            log.error("vehicle model failed to load: %s", exc)
            self.vehicle = None
            return
        plate_path = Path(PLATE_WEIGHTS)
        if not plate_path.is_file():
            log.warning("plate weights missing at %s, searching inside the vehicle box", plate_path)
            return
        try:
            self.plate = YOLO(str(plate_path))
            log.info("plate weights %s", plate_path)
        except Exception as exc:
            log.error("plate model failed to load: %s", exc)
            self.plate = None

    def process(self, frame) -> list[Detection]:
        if self.vehicle is not None and self.mode == "yolo":
            return self._yolo(frame)
        return self._geometric(frame)

    def _vehicle_type(self, class_id: int) -> str:
        return VEHICLE_CLASS_MAP.get(int(class_id), "other")

    def _plate_from_model(self, crop):
        if self.plate is None or crop is None or crop.size == 0:
            return None
        try:
            res = self.plate.predict(
                crop,
                conf=PLATE_CONF,
                imgsz=IMGSZ,
                verbose=False,
                device=self.device,
            )
        except Exception as exc:
            log.error("plate predict failed: %s", exc)
            return None
        boxes = res[0].boxes if res else None
        if boxes is None or len(boxes) == 0:
            return None
        confs = boxes.conf.detach().cpu().numpy()
        i = int(confs.argmax())
        x1, y1, x2, y2 = boxes.xyxy[i].detach().cpu().numpy().tolist()
        return (x1, y1, x2, y2), float(confs[i])

    def _bright_plate(self, frame, xyxy):
        try:
            import cv2
        except Exception as exc:
            log.error("OpenCV missing, no plate box: %s", exc)
            return None
        height, width = frame.shape[:2]
        clipped = _clip_box(xyxy, width, height)
        if clipped is None:
            return None
        x1, y1, x2, y2 = clipped
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        found = self._plate_from_model(crop)
        if found is not None:
            (px1, py1, px2, py2), pconf = found
            box = _clip_box((x1 + px1, y1 + py1, x1 + px2, y1 + py2), width, height, PLATE_PAD_PX)
            if box is not None:
                return box, pconf
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        ch, cw = gray.shape[:2]
        yoff = int(ch * PLATE_SEARCH_Y_FRAC)
        roi = gray[yoff:, :]
        _thr, mask = cv2.threshold(roi, PLATE_BRIGHT_MIN, 255, cv2.THRESH_BINARY)
        contours, _hier = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_area = 0
        for cont in contours:
            x, y, bw, bh = cv2.boundingRect(cont)
            if bh < 8 or bw < 24:
                continue
            aspect = bw / float(bh)
            if aspect < PLATE_ASPECT_MIN or aspect > PLATE_ASPECT_MAX:
                continue
            area = bw * bh
            if area > best_area:
                best_area = area
                best = (x1 + x, y1 + yoff + y, x1 + x + bw, y1 + yoff + y + bh)
        if best is not None and best_area >= MIN_BRIGHT_PLATE_AREA:
            box = _clip_box(best, width, height, PLATE_PAD_PX)
            if box is not None:
                return box, 0.45
        band = _bottom_band((x1, y1, x2, y2), width, height)
        if band is None:
            return None
        return band, 0.2

    def _yolo(self, frame) -> list[Detection]:
        try:
            results = self.vehicle.track(
                frame,
                persist=True,
                tracker=TRACKER,
                classes=list(VEHICLE_CLASS_IDS),
                conf=VEHICLE_CONF,
                imgsz=IMGSZ,
                verbose=False,
                device=self.device,
            )
        except Exception as exc:
            log.error("YOLO track failed: %s", exc)
            return []
        boxes = results[0].boxes if results else None
        if boxes is None or len(boxes) == 0:
            return []
        if boxes.id is None:
            log.warning("ByteTrack returned boxes without ids, frame skipped")
            return []
        out = []
        ids = boxes.id.detach().cpu().numpy()
        clss = boxes.cls.detach().cpu().numpy()
        confs = boxes.conf.detach().cpu().numpy()
        xyxy = boxes.xyxy.detach().cpu().numpy()
        for i, tid in enumerate(ids):
            box = tuple(int(v) for v in xyxy[i].tolist())
            plate = self._bright_plate(frame, box)
            plate_box = plate[0] if plate else None
            plate_conf = plate[1] if plate else 0.0
            out.append(
                Detection(
                    track_id=int(tid),
                    xyxy=box,
                    plate_xyxy=plate_box,
                    vehicle_type=self._vehicle_type(int(clss[i])),
                    det_conf=float(confs[i]),
                    plate_conf=plate_conf,
                )
            )
        return out

    def _geometric(self, frame) -> list[Detection]:
        try:
            import cv2
        except Exception as exc:
            log.error("OpenCV missing, no detections: %s", exc)
            return []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        _thr, mask = cv2.threshold(gray, GEOMETRIC_VEHICLE_THRESH, 255, cv2.THRESH_BINARY)
        contours, _hier = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = []
        for cont in contours:
            x, y, bw, bh = cv2.boundingRect(cont)
            if bw * bh < MIN_VEHICLE_AREA or bw < bh:
                continue
            boxes.append((x, y, x + bw, y + bh))
        out = []
        for tid, box in self._bank.assign(boxes):
            plate = self._bright_plate(frame, box)
            plate_box = plate[0] if plate else None
            plate_conf = plate[1] if plate else 0.0
            out.append(
                Detection(
                    track_id=tid,
                    xyxy=box,
                    plate_xyxy=plate_box,
                    vehicle_type=GEOMETRIC_VEHICLE_TYPE,
                    det_conf=0.5,
                    plate_conf=plate_conf,
                )
            )
        return out


class TrackBook:
    def __init__(self):
        self.live: dict[int, LiveTrack] = {}

    def observe(self, det: Detection, frame_idx: int, color: str, frame_w: int, frame_h: int) -> None:
        tr = self.live.get(det.track_id)
        if tr is None:
            tr = LiveTrack(track_id=det.track_id)
            self.live[det.track_id] = tr
        cx = (det.xyxy[0] + det.xyxy[2]) / 2.0
        cy = (det.xyxy[1] + det.xyxy[3]) / 2.0
        tr.hits += 1
        tr.last_seen = frame_idx
        tr.points.append((cx, cy))
        tr.types.append(det.vehicle_type)
        tr.colors.append(color)
        tr.frame_w = frame_w
        tr.frame_h = frame_h
        tr.last_cx = cx

    def pop_finished(self, frame_idx: int) -> list[LiveTrack]:
        done = []
        for tid, tr in list(self.live.items()):
            if frame_idx - tr.last_seen >= TRACK_GONE_FRAMES:
                done.append(tr)
                del self.live[tid]
        return done

    def flush(self) -> list[LiveTrack]:
        done = list(self.live.values())
        self.live.clear()
        return done
