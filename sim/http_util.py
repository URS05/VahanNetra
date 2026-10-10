"""Tiny HTTP helper. Stdlib only."""

from __future__ import annotations

import json
import urllib.error
import urllib.request


def request_json(
    method: str,
    url: str,
    body: dict | list | None = None,
    token: str | None = None,
    timeout: float = 30.0,
) -> tuple[int, dict | list | str]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            code = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {"detail": str(exc)}
        except json.JSONDecodeError:
            parsed = raw
        return exc.code, parsed
    except urllib.error.URLError as exc:
        return 0, {"detail": str(exc.reason)}
    if not raw:
        return code, {}
    try:
        return code, json.loads(raw)
    except json.JSONDecodeError:
        return code, raw


def login(base: str, role: str = "analyst") -> str | None:
    code, payload = request_json("POST", f"{base.rstrip('/')}/api/login", {"role": role})
    if code == 200 and isinstance(payload, dict):
        return payload.get("token")
    return None
