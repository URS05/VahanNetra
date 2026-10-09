import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("VAHAN_DB_PATH", str(ROOT / "backend" / "data" / "vahan.db")))

# Cache first (osrm_cache.json then SQLite). Public OSRM only on a miss.
ROUTING_MODE = os.environ.get("VAHAN_ROUTING_MODE", "simulate")
OSRM_ON_MISS = os.environ.get("VAHAN_OSRM_ON_MISS", "1").lower() not in ("0", "false", "no")
OSRM_BASE_URL = os.environ.get(
    "VAHAN_OSRM_BASE_URL",
    "https://router.project-osrm.org",
)
OSRM_TIMEOUT_S = float(os.environ.get("VAHAN_OSRM_TIMEOUT_S", "8"))
FALLBACK_SPEED_KMH = 40.0
MAX_PLAUSIBLE_SPEED_KMH = 120.0
FUZZY_CONFIDENT_MAX_COST = 1.2
CIRCLING_COUNT = 4
CIRCLING_WINDOW_MINUTES = 20
HEATMAP_BUCKET_SECONDS = 60
CLONED_PLATE_MAX_SECONDS = 90.0

ROLES = ("viewer", "analyst", "admin")
SEARCH_ROLES = ("analyst", "admin")
