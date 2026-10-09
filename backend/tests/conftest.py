import os
import sys
import tempfile
from pathlib import Path

_backend = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_backend))

_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_fd)
os.environ["VAHAN_DB_PATH"] = _db_path
os.environ["VAHAN_OSRM_ON_MISS"] = "0"

import pytest
from fastapi.testclient import TestClient

from db import SessionLocal
from main import app
from models import Alert, AuditLog, Event, Watchlist


@pytest.fixture(scope="session", autouse=True)
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_events():
    db = SessionLocal()
    try:
        db.query(Alert).delete()
        db.query(Event).delete()
        db.query(Watchlist).delete()
        db.query(AuditLog).delete()
        db.commit()
    finally:
        db.close()
    yield


def auth_headers(client: TestClient, role: str = "analyst") -> dict:
    r = client.post("/api/login", json={"role": role})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}
