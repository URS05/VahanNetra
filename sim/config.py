"""Sim and QA config. Keep numbers here, not in callers."""

from datetime import date, timedelta
from pathlib import Path

_today = date.today()
_yesterday = _today - timedelta(days=1)

ROOT = Path(__file__).resolve().parents[1]
SIM_DIR = Path(__file__).resolve().parent
CONTRACTS = ROOT / "contracts"
CAMERAS_PATH = CONTRACTS / "cameras.json"
SCHEMA_PATH = CONTRACTS / "event_schema.json"
OSRM_CACHE = CONTRACTS / "osrm_cache.json"
PRESETS_PATH = SIM_DIR / "presets.json"
OUT_DIR = SIM_DIR / "out"
CLIPS_DIR = SIM_DIR / "clips"
VIDEOS_DIR = ROOT / "data" / "videos"
BACKEND_DB = ROOT / "backend" / "data" / "vahan.db"

DEFAULT_BASE = "http://127.0.0.1:8000"
DEFAULT_SEED = 42
# 500 synthetic events is enough for a fast demo seed
DEFAULT_EVENT_COUNT = 500

# Hyderabad corridor bbox used for virtual cameras.
LAT_MIN, LAT_MAX = 17.36, 17.50
LON_MIN, LON_MAX = 78.30, 78.42
VIRTUAL_CAMERA_COUNT = 250

VEHICLE_TYPES = ("car", "bike", "truck", "bus", "auto", "other")
VEHICLE_WEIGHTS = (0.55, 0.25, 0.06, 0.04, 0.08, 0.02)
COLORS = ("white", "silver", "black", "red", "blue", "grey", "yellow", "green",
          "maroon", "beige", "orange")
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW", "IN", "OUT")

# km/h by type, (min, max) then rush-hour scale.
SPEED_RANGE = {
    "car": (22.0, 55.0),
    "bike": (25.0, 60.0),
    "truck": (18.0, 40.0),
    "bus": (18.0, 38.0),
    "auto": (15.0, 35.0),
    "other": (12.0, 30.0),
}
RUSH_HOURS_IST = frozenset({8, 9, 17, 18, 19})
RUSH_SPEED_SCALE = 0.72
RUSH_VOLUME_WEIGHT = 3.2

HOTSPOT_DEMO = ("CAM01", "CAM04")
CONGESTION_SPEED_KMH = 12.0

# Multi-state plates. Hyderabad sees TS (local), AP, KA, MH traffic.
# Weights: TS 70%, AP 15%, KA 10%, MH 5% - mirrors real Hyderabad traffic mix.
PLATE_STATE_WEIGHTS: dict[str, float] = {
    "TS": 0.70,
    "AP": 0.15,
    "KA": 0.10,
    "MH": 0.05,
}
STATE_DISTRICTS: dict[str, tuple] = {
    "TS": ("09", "10", "11", "12", "13", "14", "15"),
    "AP": ("28", "03", "09", "13", "14"),
    "KA": ("01", "03", "04", "05"),
    "MH": ("12", "02", "14"),
}
# Keep PLATE_STATES / PLATE_DISTRICTS for any code that still references them.
PLATE_STATES = tuple(PLATE_STATE_WEIGHTS.keys())
PLATE_DISTRICTS = STATE_DISTRICTS["TS"]
PLATE_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"

# Demo plates used by scenarios, presets, seed, smoke, checklist.
HERO_PLATE = "TS09VN2612"
FUZZY_QUERY = "TS09VN2613"  # one wrong character vs HERO_PLATE (3->2 in last digit)
FUZZY_CAMERA = "CAM03"
CLONE_PLATE = "TS09CL0001"
CIRCLE_PLATE = "TS09CR4444"
WATCHLIST_PLATE = "TS09WL9999"
WATCHLIST_NOTE = "Suspected stolen vehicle - reported missing from Secunderabad"

# Dynamic demo day: always today so timestamps fall within the 7-day view.
DEMO_DAY_UTC = _today.isoformat()
# Hero journey starts at 09:00 IST = 03:30 UTC
HERO_START_UTC = f"{_today.isoformat()}T03:30:00Z"
# Clone event 2 hours later to avoid overlap with hero journey
CLONE_START_UTC = f"{_today.isoformat()}T04:30:00Z"
# Watchlist hit 20 minutes into the hero journey window
WATCH_START_UTC = f"{_today.isoformat()}T03:50:00Z"
# Circling starts 2 hours after hero
CIRCLE_START_UTC = f"{_today.isoformat()}T05:30:00Z"
# 60 seconds between two clone sightings - well below the 90s cloned-plate threshold
CLONE_GAP_SECONDS = 60
CIRCLE_GAP_SECONDS = 180
CIRCLE_COUNT = 4

# Consecutive OSRM cache durations for CAM01-CAM05 (seconds).
HERO_LEG_SECONDS = (217.3, 363.0, 520.3, 325.6)

ROLES = ("viewer", "analyst", "admin")
