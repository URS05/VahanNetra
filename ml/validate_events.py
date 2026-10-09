"""Validate Event objects against contracts/event_schema.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from config import EVENT_SCHEMA

_VALIDATOR = None


def _validator():
    global _VALIDATOR
    if _VALIDATOR is not None:
        return _VALIDATOR
    import jsonschema

    schema = json.loads(EVENT_SCHEMA.read_text(encoding="utf-8"))
    _VALIDATOR = jsonschema.Draft202012Validator(schema)
    return _VALIDATOR


def validate_event(event: dict) -> list[str]:
    return [err.message for err in _validator().iter_errors(event)]


def validate_jsonl(path: Path) -> tuple[int, int, list[str]]:
    ok = 0
    bad = 0
    messages = []
    text = path.read_text(encoding="utf-8")
    for line_no, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            bad += 1
            messages.append(f"line {line_no}: {exc}")
            continue
        errors = validate_event(event)
        if errors:
            bad += 1
            messages.append(f"line {line_no}: {'; '.join(errors)}")
        else:
            ok += 1
    return ok, bad, messages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate VahanNetra events against the contract schema")
    parser.add_argument("--jsonl", default="", help="JSONL file of events")
    parser.add_argument("--event", default="", help="One JSON event file")
    args = parser.parse_args(argv)
    if not args.jsonl and not args.event:
        print("pass --jsonl or --event", file=sys.stderr)
        return 2
    if args.event:
        event = json.loads(Path(args.event).read_text(encoding="utf-8"))
        errors = validate_event(event)
        if errors:
            print("invalid: " + "; ".join(errors))
            return 1
        print("valid 1")
        return 0
    ok, bad, messages = validate_jsonl(Path(args.jsonl))
    for msg in messages:
        print(msg)
    print(f"valid {ok} invalid {bad}")
    return 0 if bad == 0 and ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
