"""OCR five stills into Events. One image, one camera, one event.

Plate text comes from OCR only. labels.csv is ground truth for the accuracy
table and is never copied into plate_text.
"""

from __future__ import annotations

import csv
import json
import logging
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from config import (
    API_EVENTS_URL,
    CAMERAS_JSON,
    CROPS_DIR,
    EVENT_SOURCE,
    IMAGES_DIR,
    LABELS_CSV,
    MAX_PLATE_LEN,
    MIN_PLATE_AREA,
    MIN_PLATE_LEN,
    OCR_RESULTS_MD,
    PLATE_WARP_H,
    PLATE_WARP_W,
    STATE_CODES,
    STILLS_JSONL,
)

log = logging.getLogger("ml.stills")

CAMERAS = ["CAM01", "CAM02", "CAM03", "CAM04", "CAM05"]
IN_PLATE = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$")
LOGIN_URL = "http://127.0.0.1:8000/api/login"
PUBLIC_STILLS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "stills"
MAX_CROPS = 6


def normalize_plate(text: str) -> str:
    return "".join(ch for ch in text.upper() if ch.isalnum())


def format_valid(text: str) -> bool:
    if not (MIN_PLATE_LEN <= len(text) <= MAX_PLATE_LEN):
        return False
    return IN_PLATE.match(text) is not None


def heading_to_direction(heading: float) -> str:
    names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((float(heading) + 22.5) % 360 // 45)
    return names[idx]


def plate_likeness(text: str) -> float:
    """Rank a real OCR read by how plate-like it looks. Never rewrites text.

    Words like ENTRY or RFID carry no digits and score below any real read.
    """
    if len(text) < 5:
        return -1.0
    digits = sum(ch.isdigit() for ch in text)
    if digits == 0:
        return -1.0
    frac = digits / len(text)
    score = 0.15 if 0.2 <= frac <= 0.8 else 0.0
    if text[:2] in STATE_CODES:
        score += 0.1
    return score


def vote(reads: list[dict]) -> tuple[str, float, bool]:
    """Pick a plate from OCR reads. Empty reads stay empty."""
    ranked: list[tuple[float, float, bool, str]] = []
    for read in reads:
        text = normalize_plate(str(read.get("text", "")))
        if len(text) < 4:
            continue
        conf = float(read.get("conf") or 0.0)
        area = float(read.get("area") or 1.0)
        valid = format_valid(text)
        score = (
            conf
            + (0.35 if valid else 0.0)
            + plate_likeness(text)
            + min(len(text), MAX_PLATE_LEN) * 0.005
            + min(area, 20000.0) / 200000.0
        )
        ranked.append((score, conf, valid, text))
    if not ranked:
        return "", 0.05, False
    ranked.sort(reverse=True)
    valids = [row for row in ranked if row[2]]
    score, conf, valid, text = valids[0] if valids else ranked[0]
    return text, round(min(1.0, max(0.0, conf)), 4), valid


class OcrEngine:
    def __init__(self) -> None:
        self.name = "none"
        self._fpo = None
        self._paddle = None
        self._rapid = None
        self._bind()

    def _bind(self) -> None:
        try:
            from fast_plate_ocr import LicensePlateRecognizer

            self._fpo = LicensePlateRecognizer("cct-xs-v1-global-model")
            self.name = "fast_plate_ocr"
            log.info("OCR backend fast-plate-ocr")
            return
        except Exception as exc:
            log.warning("fast-plate-ocr unavailable: %s", exc)
        try:
            from paddleocr import PaddleOCR

            try:
                self._paddle = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            except TypeError:
                self._paddle = PaddleOCR(lang="en")
            self.name = "paddleocr"
            log.info("OCR backend paddleocr")
            return
        except Exception as exc:
            log.warning("paddleocr package unavailable: %s", exc)
        try:
            from rapidocr_onnxruntime import RapidOCR

            self._rapid = RapidOCR()
            self.name = "rapidocr_onnx"
            log.info("OCR backend rapidocr_onnx (PaddleOCR PP-OCR weights)")
        except Exception as exc:
            log.error("no OCR backend: %s", exc)

    def read(self, bgr: np.ndarray) -> list[tuple[str, float]]:
        if self._fpo is not None:
            return self._read_fast(bgr)
        if self._paddle is not None:
            return self._read_paddle(bgr)
        if self._rapid is not None:
            return self._read_rapid(bgr)
        return []

    def _read_fast(self, bgr: np.ndarray) -> list[tuple[str, float]]:
        try:
            import cv2

            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            pred = self._fpo.run(gray)
        except Exception as exc:
            log.warning("fast-plate-ocr read failed: %s", exc)
            return []
        text = ""
        conf = 0.5
        if isinstance(pred, (list, tuple)) and pred:
            first = pred[0]
            if isinstance(first, (list, tuple)):
                text = str(first[0])
                if len(first) > 1:
                    conf = float(first[1])
            else:
                text = str(first)
        elif isinstance(pred, str):
            text = pred
        return [(text, conf)] if text else []

    def _read_paddle(self, bgr: np.ndarray) -> list[tuple[str, float]]:
        try:
            if hasattr(self._paddle, "ocr"):
                result = self._paddle.ocr(bgr, cls=True)
            else:
                result = self._paddle.predict(bgr)
        except TypeError:
            result = self._paddle.ocr(bgr)
        except Exception as exc:
            log.warning("paddleocr read failed: %s", exc)
            return []
        return _flatten_paddle(result)

    def _read_rapid(self, bgr: np.ndarray) -> list[tuple[str, float]]:
        try:
            result, _elapsed = self._rapid(bgr)
        except Exception as exc:
            log.warning("rapidocr read failed: %s", exc)
            return []
        if not result:
            return []
        rows = []
        for item in result:
            if len(item) < 3:
                continue
            rows.append((str(item[1]), float(item[2])))
        return rows


def _flatten_paddle(result) -> list[tuple[str, float]]:
    rows: list[tuple[str, float]] = []
    if not result:
        return rows
    lines = result[0] if isinstance(result, list) and result and isinstance(result[0], list) else result
    if not isinstance(lines, list):
        return rows
    for line in lines:
        if not line or len(line) < 2:
            continue
        payload = line[1]
        if isinstance(payload, (list, tuple)) and payload:
            text = str(payload[0])
            conf = float(payload[1]) if len(payload) > 1 else 0.0
            rows.append((text, conf))
    return rows


def _prepare(bgr: np.ndarray) -> np.ndarray:
    import cv2

    h, w = bgr.shape[:2]
    scale = max(1.0, 280.0 / max(w, 1))
    if scale > 1.05:
        bgr = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 5, 40, 40)
    sharp = cv2.addWeighted(gray, 1.6, cv2.GaussianBlur(gray, (0, 0), 1.2), -0.6, 0)
    return cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)


def plate_boxes(bgr: np.ndarray) -> list[tuple[int, int, int, int, np.ndarray | None]]:
    """Return (x, y, w, h, quad) candidates. Quad is optional for a warp."""
    import cv2

    h, w = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, (0, 0, 150), (180, 70, 255))
    yellow = cv2.inRange(hsv, (12, 70, 90), (45, 255, 255))
    mask = cv2.bitwise_or(white, yellow)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (13, 3)))
    combined = cv2.bitwise_or(mask, edges)
    contours, _hier = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found: list[tuple[int, int, int, int, np.ndarray | None]] = []
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        if bw * bh < MIN_PLATE_AREA or bh < 10 or bw < 28:
            continue
        aspect = bw / float(bh)
        if aspect < 1.6 or aspect > 8.5:
            continue
        if bw > w * 0.7 or bh > h * 0.4:
            continue
        quad = None
        if len(contour) >= 4:
            rect = cv2.minAreaRect(contour)
            quad = cv2.boxPoints(rect)
        pad_x = int(bw * 0.08)
        pad_y = int(bh * 0.18)
        x0 = max(0, x - pad_x)
        y0 = max(0, y - pad_y)
        x1 = min(w, x + bw + pad_x)
        y1 = min(h, y + bh + pad_y)
        found.append((x0, y0, x1 - x0, y1 - y0, quad))
    found.sort(key=lambda item: item[2] * item[3], reverse=True)
    return found[:MAX_CROPS]


def crop_plate(bgr: np.ndarray, box) -> np.ndarray:
    import cv2

    x, y, bw, bh, quad = box
    crop = bgr[y : y + bh, x : x + bw]
    if quad is None or crop.size == 0:
        return crop
    try:
        src = _order_quad(quad)
        dst = np.array(
            [
                [0, 0],
                [PLATE_WARP_W - 1, 0],
                [PLATE_WARP_W - 1, PLATE_WARP_H - 1],
                [0, PLATE_WARP_H - 1],
            ],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(src, dst)
        warped = cv2.warpPerspective(bgr, matrix, (PLATE_WARP_W, PLATE_WARP_H))
        if warped.size:
            return warped
    except Exception as exc:
        log.warning("deskew skipped: %s", exc)
    return crop


def _order_quad(pts: np.ndarray) -> np.ndarray:
    pts = np.array(pts, dtype=np.float32).reshape(4, 2)
    sums = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    return np.array(
        [
            pts[np.argmin(sums)],
            pts[np.argmin(diff)],
            pts[np.argmax(sums)],
            pts[np.argmax(diff)],
        ],
        dtype=np.float32,
    )


def scene_for(camera_id: str) -> dict:
    """Foreground vehicle look. Not used for plate text."""
    table = {
        "CAM01": {"vehicle_type": "car", "vehicle_color": "silver"},
        "CAM02": {"vehicle_type": "car", "vehicle_color": "silver"},
        "CAM03": {"vehicle_type": "car", "vehicle_color": "red"},
        "CAM04": {"vehicle_type": "car", "vehicle_color": "white"},
        "CAM05": {"vehicle_type": "car", "vehicle_color": "white"},
    }
    return table[camera_id]


def load_cameras() -> dict[str, dict]:
    rows = json.loads(CAMERAS_JSON.read_text(encoding="utf-8"))
    return {row["camera_id"]: row for row in rows}


def ocr_image(engine: OcrEngine, bgr: np.ndarray, camera_id: str) -> list[dict]:
    import cv2

    CROPS_DIR.mkdir(parents=True, exist_ok=True)
    reads: list[dict] = []
    boxes = plate_boxes(bgr)
    log.info("%s plate candidates=%s", camera_id, len(boxes))
    for idx, box in enumerate(boxes):
        crop = crop_plate(bgr, box)
        if crop is None or crop.size == 0:
            continue
        prepared = _prepare(crop)
        path = CROPS_DIR / f"{camera_id}_{idx}.png"
        cv2.imwrite(str(path), prepared)
        area = float(box[2] * box[3])
        hits = engine.read(prepared)
        if not hits:
            reads.append(
                {
                    "frame_idx": idx,
                    "text": "",
                    "conf": 0.0,
                    "area": area,
                }
            )
            continue
        for text, conf in hits:
            reads.append(
                {
                    "frame_idx": idx,
                    "text": normalize_plate(text),
                    "conf": round(float(conf), 4),
                    "area": area,
                }
            )
    useful = [row for row in reads if len(normalize_plate(row["text"])) >= 5]
    if not useful:
        hits = engine.read(_prepare(bgr))
        if not hits:
            reads.append({"frame_idx": 0, "text": "", "conf": 0.0, "area": 1.0})
        for text, conf in hits:
            reads.append(
                {
                    "frame_idx": 0,
                    "text": normalize_plate(text),
                    "conf": round(float(conf), 4),
                    "area": 1.0,
                }
            )
    return reads


def build_event(camera_id: str, camera: dict, reads: list[dict], when: datetime) -> dict:
    plate, conf, valid = vote(reads)
    scene = scene_for(camera_id)
    raw = [
        {"frame_idx": int(row["frame_idx"]), "text": row["text"], "conf": float(row["conf"])}
        for row in reads
    ]
    return {
        "event_id": f"stills-{camera_id}",
        "plate_text": plate,
        "plate_confidence": conf,
        "format_valid": valid,
        "raw_reads": raw,
        "camera_id": camera_id,
        "timestamp": when.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "direction": heading_to_direction(camera.get("heading", 0)),
        "lane": 1,
        "vehicle_type": scene["vehicle_type"],
        "vehicle_color": scene["vehicle_color"],
        "speed_estimate": None,
        "plate_image_ref": f"data/images/{camera_id}.png",
        "source": EVENT_SOURCE,
    }


def load_labels() -> dict[str, str]:
    if not LABELS_CSV.is_file():
        return {}
    out = {}
    with LABELS_CSV.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            out[row["camera_id"]] = normalize_plate(row["plate_text"])
    return out


def write_accuracy(events: list[dict], backend: str) -> None:
    labels = load_labels()
    lines = [
        "# Stills OCR vs labels",
        "",
        f"OCR backend: {backend}. Plate text is the OCR vote. labels.csv was not fed into the pipeline.",
        "label_verified is false until the integrator confirms the human read.",
        "",
        "| camera | predicted | label | exact |",
        "| --- | --- | --- | --- |",
    ]
    for event in events:
        cam = event["camera_id"]
        pred = event["plate_text"]
        label = labels.get(cam, "")
        exact = "yes" if pred and pred == label else "no"
        lines.append(f"| {cam} | {pred or '(empty)'} | {label or '(none)'} | {exact} |")
    lines.append("")
    lines.append("Confusable pairs to recheck: 0/O, 1/I, 8/B, 5/S, 2/Z.")
    text = "\n".join(lines) + "\n"
    OCR_RESULTS_MD.write_text(text, encoding="utf-8")
    decisions = Path(__file__).resolve().parent / "DECISIONS.md"
    decisions.write_text(
        "\n".join(
            [
                "# ML decisions: stills demo",
                "",
                "fast-plate-ocr is tried first. If that import fails, PaddleOCR is tried.",
                "If the PaddleOCR package is not installed, RapidOCR ONNX runs the PaddleOCR PP-OCR weights.",
                "No plate characters are copied from labels.csv.",
                "",
                text,
            ]
        ),
        encoding="utf-8",
    )


def _post_json(url: str, payload: dict, token: str | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_events(events: list[dict]) -> None:
    try:
        login = _post_json(LOGIN_URL, {"role": "admin"})
    except Exception as exc:
        log.error("login failed, events saved to jsonl only: %s", exc)
        return
    token = login["token"]
    try:
        result = _post_json(API_EVENTS_URL, {"events": events}, token)
        log.info("posted %s events", result.get("count"))
        return
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code != 409:
            log.error("batch post failed %s %s", exc.code, body)
    for event in events:
        try:
            _post_json(API_EVENTS_URL, event, token)
            log.info("posted %s", event["event_id"])
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 409:
                log.info("already stored %s", event["event_id"])
            else:
                log.error("post %s failed %s %s", event["event_id"], exc.code, body)


def copy_public(camera_id: str, src: Path) -> None:
    PUBLIC_STILLS.mkdir(parents=True, exist_ok=True)
    target = PUBLIC_STILLS / f"{camera_id}.png"
    target.write_bytes(src.read_bytes())


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    try:
        import cv2  # noqa: F401
    except Exception as exc:
        log.error("OpenCV missing: %s", exc)
        return 1
    import cv2

    cameras = load_cameras()
    engine = OcrEngine()
    if engine.name == "none":
        log.error("OCR backend missing. Events will carry empty reads.")
    start = datetime.now(timezone.utc).replace(microsecond=0)
    events = []
    for offset, camera_id in enumerate(CAMERAS):
        path = IMAGES_DIR / f"{camera_id}.png"
        if not path.is_file():
            log.error("missing %s", path)
            continue
        bgr = cv2.imread(str(path))
        if bgr is None:
            log.error("unreadable %s", path)
            continue
        copy_public(camera_id, path)
        reads = ocr_image(engine, bgr, camera_id) if engine.name != "none" else [
            {"frame_idx": 0, "text": "", "conf": 0.0, "area": 1.0}
        ]
        event = build_event(camera_id, cameras[camera_id], reads, start + timedelta(seconds=offset))
        events.append(event)
        log.info(
            "%s plate=%s conf=%s valid=%s reads=%s",
            camera_id,
            event["plate_text"] or "(empty)",
            event["plate_confidence"],
            event["format_valid"],
            len(event["raw_reads"]),
        )
    STILLS_JSONL.parent.mkdir(parents=True, exist_ok=True)
    with STILLS_JSONL.open("w", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event) + "\n")
    PUBLIC_STILLS.mkdir(parents=True, exist_ok=True)
    (PUBLIC_STILLS / "fallback.json").write_text(json.dumps(events, indent=2), encoding="utf-8")
    write_accuracy(events, engine.name)
    post_events(events)
    print(json.dumps({"backend": engine.name, "count": len(events), "jsonl": str(STILLS_JSONL)}))
    return 0 if len(events) == 5 else 1


if __name__ == "__main__":
    sys.exit(main())
