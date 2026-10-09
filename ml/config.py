"""All ML knobs for VahanNetra. No magic numbers in other modules."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML_DIR = Path(__file__).resolve().parent
CONTRACTS = ROOT / "contracts"
CAMERAS_JSON = CONTRACTS / "cameras.json"
EVENT_SCHEMA = CONTRACTS / "event_schema.json"
VIDEOS_DIR = ROOT / "data" / "videos"
CROPS_DIR = ROOT / "data" / "crops"
EVENTS_JSONL = ROOT / "data" / "events.jsonl"
MODELS_DIR = ML_DIR / "models"
BENCHMARK_OUT = ML_DIR / "benchmark_last.json"

API_EVENTS_URL = "http://127.0.0.1:8000/api/events"
EVENT_SOURCE = "real_clip"

# Ingest
FRAME_STRIDE = 2
WEBCAM_MAX_FRAMES = 0  # 0 means until interrupted
DEFAULT_FPS = 25.0

# Detection and tracking (pretrained only)
VEHICLE_WEIGHTS = "yolov8n.pt"
PLATE_WEIGHTS = MODELS_DIR / "license_plate_detector.pt"
# Optional download, off by default so dry runs stay offline
PLATE_WEIGHTS_URL = ""
TRACKER = "bytetrack.yaml"
IMGSZ = 640
VEHICLE_CONF = 0.25
PLATE_CONF = 0.25
DEVICE = ""  # empty: ultralytics picks GPU if present, else CPU
VEHICLE_CLASS_IDS = (2, 3, 5, 7)  # COCO car, motorcycle, bus, truck
VEHICLE_CLASS_MAP = {
    2: "car",
    3: "bike",
    5: "bus",
    7: "truck",
    1: "bike",
}
TRACK_GONE_FRAMES = 15
MIN_TRACK_HITS = 3

# Crops
CROPS_PER_TRACK = 5
PLATE_WARP_W = 240
PLATE_WARP_H = 80
MIN_PLATE_AREA = 400
BOTTOM_PLATE_FRAC = 0.35  # fallback crop if plate model missing

# OCR
OCR_BACKEND = "paddleocr"  # paddleocr | fast_plate_ocr | none
OCR_LANG = "en"
OCR_MIN_CONF = 0.3
OCR_USE_GPU = True

# Consensus
MIN_PLATE_LEN = 6
MAX_PLATE_LEN = 13
CONFUSABLE = {
    "O": "0",
    "I": "1",
    "L": "1",
    "B": "8",
    "S": "5",
    "Z": "2",
}

# Emit
POST_RETRIES = 3
POST_RETRY_SEC = 0.8
POST_TIMEOUT_SEC = 8.0
REPLAY_MAX_SLEEP_SEC = 8.0
SKIP_EMPTY_PLATE = True

# Speed: leave 0 to always emit speed_estimate null
PIXELS_PER_METER = 0.0

# Benchmark
BENCH_MAX_FRAMES = 120
