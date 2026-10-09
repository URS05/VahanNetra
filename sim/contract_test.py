"""Validate Event objects against contracts/event_schema.json. No extra deps."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

SCHEMA = json.loads((ROOT / "contracts" / "event_schema.json").read_text(encoding="utf-8"))
REQUIRED = SCHEMA["required"]
PROPS = SCHEMA["properties"]
SOURCE = set(PROPS["source"]["enum"])
DIRECTION = set(PROPS["direction"]["enum"])
VEHICLE = set(PROPS["vehicle_type"]["enum"])
ALLOWED = set(PROPS.keys())


def _type_ok(value, declared: dict) -> bool:
    kinds = declared.get("type")
    if kinds is None:
        return True
    if isinstance(kinds, list):
        return any(_type_ok(value, {**declared, "type": k}) for k in kinds)
    if kinds == "null":
        return value is None
    if kinds == "string":
        return isinstance(value, str)
    if kinds == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kinds == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kinds == "boolean":
        return isinstance(value, bool)
    if kinds == "array":
        return isinstance(value, list)
    if kinds == "object":
        return isinstance(value, dict)
    return False


def validate_event(obj: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(obj, dict):
        return ["not an object"]
    for key in REQUIRED:
        if key not in obj:
            errors.append(f"missing {key}")
    extra = set(obj.keys()) - ALLOWED
    if extra:
        errors.append(f"extra keys {sorted(extra)}")
    for key, declared in PROPS.items():
        if key not in obj:
            continue
        val = obj[key]
        if not _type_ok(val, declared):
            errors.append(f"{key} bad type")
            continue
        if "enum" in declared and val not in declared["enum"]:
            errors.append(f"{key} not in enum: {val}")
        if declared.get("type") == "number" or (
            isinstance(declared.get("type"), list) and "number" in declared["type"]
        ):
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                if "minimum" in declared and val < declared["minimum"]:
                    errors.append(f"{key} below minimum")
                if "maximum" in declared and val > declared["maximum"]:
                    errors.append(f"{key} above maximum")
    if obj.get("source") not in SOURCE and "source" in obj:
        errors.append(f"bad source {obj.get('source')}")
    if obj.get("direction") not in DIRECTION and "direction" in obj:
        errors.append(f"bad direction {obj.get('direction')}")
    if obj.get("vehicle_type") not in VEHICLE and "vehicle_type" in obj:
        errors.append(f"bad vehicle_type {obj.get('vehicle_type')}")
    reads = obj.get("raw_reads")
    if isinstance(reads, list):
        for i, item in enumerate(reads):
            if not isinstance(item, dict):
                errors.append(f"raw_reads[{i}] not object")
                continue
            for k in ("frame_idx", "text", "conf"):
                if k not in item:
                    errors.append(f"raw_reads[{i}] missing {k}")
            frame_idx = item.get("frame_idx")
            if "frame_idx" in item and (not isinstance(frame_idx, int) or isinstance(frame_idx, bool)):
                errors.append(f"raw_reads[{i}].frame_idx bad type")
            if "text" in item and not isinstance(item.get("text"), str):
                errors.append(f"raw_reads[{i}].text bad type")
            conf = item.get("conf")
            if "conf" in item and (not isinstance(conf, (int, float)) or isinstance(conf, bool)):
                errors.append(f"raw_reads[{i}].conf bad type")
    return errors


def load_events(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8").strip()
    if path.suffix == ".jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    data = json.loads(text)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "events" in data:
        return data["events"]
    if isinstance(data, dict) and all(k in data for k in ("normal_trip", "cloned_plate")):
        events = []
        for block in data.values():
            if isinstance(block, dict) and "events" in block:
                events.extend(block["events"])
        return events
    return [data]


def check_path(path: Path) -> tuple[int, int]:
    if path.is_dir():
        print(f"FAIL {path}: no json or jsonl files")
        return 0, 1
    if not path.exists():
        print(f"FAIL {path}: missing")
        return 0, 1
    events = load_events(path)
    failed = 0
    for i, ev in enumerate(events):
        errs = validate_event(ev)
        if errs:
            print(f"FAIL {path.name} [{i}]: {errs}")
            failed += 1
            if failed >= 20:
                print(f"{path}: stopping after 20 failures")
                break
    print(f"{path}: checked {len(events)}, failed {failed}")
    return len(events), failed


def iter_targets(path: Path):
    if path.is_dir():
        files = [
            p
            for p in sorted(path.rglob("*"))
            if p.is_file() and p.suffix.lower() in {".json", ".jsonl"}
        ]
        if not files:
            yield path
            return
        yield from files
        return
    yield path


def _self_test() -> int:
    good = {
        "event_id": "e1",
        "plate_text": "TS09VN2612",
        "plate_confidence": 0.9,
        "format_valid": True,
        "raw_reads": [{"frame_idx": 1, "text": "TS09VN2612", "conf": 0.9}],
        "camera_id": "CAM01",
        "timestamp": "2026-10-08T03:30:00Z",
        "direction": "SE",
        "lane": 1,
        "vehicle_type": "car",
        "vehicle_color": "white",
        "speed_estimate": 32.5,
        "plate_image_ref": "synthetic:e1",
        "source": "synthetic",
    }
    assert not validate_event(good), validate_event(good)
    bad_source = {**good, "source": "live"}
    assert validate_event(bad_source)
    extra = {**good, "secret": 1}
    assert validate_event(extra)
    missing = dict(good)
    missing.pop("camera_id")
    assert validate_event(missing)
    conf = {**good, "plate_confidence": 1.5}
    assert validate_event(conf)
    bad_read = {**good, "raw_reads": [{"frame_idx": "1", "text": 5, "conf": "high"}]}
    assert validate_event(bad_read)
    print("self-test PASS")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) <= 1 or argv[1] in ("--self-test", "-h", "--help"):
        if len(argv) > 1 and argv[1] in ("-h", "--help"):
            print("usage: python sim/contract_test.py [event.json|events.jsonl|directory ...]")
            print("no args runs the built-in self-test")
        return _self_test()
    failed_total = 0
    checked_total = 0
    for arg in argv[1:]:
        for path in iter_targets(Path(arg)):
            n, f = check_path(path)
            checked_total += n
            failed_total += f
    print(f"total checked {checked_total}, failed {failed_total}")
    return 1 if failed_total else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
