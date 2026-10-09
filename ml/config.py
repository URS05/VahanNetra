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
MIN_SHARPNESS = 2.0
BOTTOM_PLATE_FRAC = 0.35  # fallback crop if plate model missing
PLATE_PAD_PX = 2
PLATE_ASPECT_MIN = 1.6
PLATE_ASPECT_MAX = 7.0
PLATE_BRIGHT_MIN = 175
PLATE_SEARCH_Y_FRAC = 0.40
BOTTOM_BAND_MARGIN_FRAC = 0.08
MIN_BRIGHT_PLATE_AREA = 200
QUAD_MIN_AREA_FRAC = 0.45
CANNY_LOW = 40
CANNY_HIGH = 140
SHARPNESS_WEIGHT = 1.0
AREA_WEIGHT = 0.002
ANGLE_PENALTY = 1.5
DESKEW_MIN_DEG = 3.0
GLYPH_W = 24
GLYPH_H = 40

# Geometric detector used when YOLO is off or the clip is a dry synthetic frame
MIN_VEHICLE_AREA = 2500
GEOMETRIC_VEHICLE_THRESH = 70
MAX_MATCH_PX = 140
MIN_MOTION_PX = 12
GEOMETRIC_VEHICLE_TYPE = "other"

# OCR
OCR_BACKEND = "paddleocr"  # paddleocr | fast_plate_ocr | none
OCR_LANG = "en"
OCR_MIN_CONF = 0.3
OCR_USE_GPU = True

# Consensus
MIN_PLATE_LEN = 6
MAX_PLATE_LEN = 13
# Letter lookalikes rewritten when the plate slot expects a digit.
CONFUSABLE = {
    "O": "0",
    "I": "1",
    "L": "1",
    "B": "8",
    "S": "5",
    "Z": "2",
}
# Standard private plate, and Bharat series (2 digits, BH, 4 digits, 1-2 letters).
PLATE_PATTERNS = (
    r"^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4}$",
    r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$",
)
TEMPLATE_MIN_SCORE = 0.35

# Emit
POST_RETRIES = 3
POST_RETRY_SEC = 0.8
POST_TIMEOUT_SEC = 8.0
REPLAY_MAX_SLEEP_SEC = 8.0
SKIP_EMPTY_PLATE = True

# Speed: leave 0 to always emit speed_estimate null
PIXELS_PER_METER = 0.0

# Benchmark. GPU FPS is left unmeasured when torch has no CUDA.
BENCH_MAX_FRAMES = 40

# Dry synthetic frames (no sample clips in data/videos). Source tier is synthetic.
SYNTH_FRAMES = 16
SYNTH_W = 960
SYNTH_H = 540
SYNTH_PLATE = "TS09AB1234"
SYNTH_FONT_SCALE = 0.85
SYNTH_FONT_THICK = 2
SYNTH_CHAR_STEP = 20
# A few frames paint a confusable character. Keys are frame indexes.
SYNTH_FRAME_TEXT = {
    3: "TSO9AB1234",
    7: "TS09A81234",
    11: "TS09ABI234",
}
DRY_RUN_SOURCE = "synthetic"
COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
