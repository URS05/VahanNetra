"""Confidence-weighted plate vote with confusable characters and Indian format checks."""

from __future__ import annotations

import re
from dataclasses import dataclass

from config import CONFUSABLE, MAX_PLATE_LEN, MIN_PLATE_LEN, OCR_MIN_CONF, PLATE_PATTERNS

_TO_DIGIT = dict(CONFUSABLE)
_TO_ALPHA = {digit: letter for letter, digit in CONFUSABLE.items()}
_PATTERNS = tuple(re.compile(p) for p in PLATE_PATTERNS)


@dataclass
class Consensus:
    plate_text: str
    plate_confidence: float
    format_valid: bool
    raw_reads: list[dict]


def clean_text(text: str) -> str:
    return "".join(ch for ch in (text or "").upper() if ch.isalnum())


def format_valid(text: str) -> bool:
    return any(p.match(text) for p in _PATTERNS)


def _map_char(ch: str, kind: str) -> str:
    if kind == "D":
        return _TO_DIGIT.get(ch, ch)
    if kind == "A":
        return _TO_ALPHA.get(ch, ch)
    return ch


def _apply_mask(text: str, mask: str) -> str | None:
    if len(text) != len(mask):
        return None
    out = []
    for ch, kind in zip(text, mask):
        mapped = _map_char(ch, kind)
        if kind == "D" and not mapped.isdigit():
            return None
        if kind == "A" and not mapped.isalpha():
            return None
        out.append(mapped)
    return "".join(out)


def canonical_candidates(text: str) -> list[str]:
    raw = clean_text(text)
    found: list[str] = []
    if len(raw) in (9, 10, 11):
        series = len(raw) - 8
        mask = "AA" + "DD" + ("A" * series) + "DDDD"
        fixed = _apply_mask(raw, mask)
        if fixed:
            found.append(fixed)
    if len(raw) in (9, 10):
        series = len(raw) - 8
        mask = "DD" + "AA" + "DDDD" + ("A" * series)
        fixed = _apply_mask(raw, mask)
        if fixed and fixed[2:4] == "BH":
            found.append(fixed)
    if raw:
        found.append(raw)
    uniq = []
    for item in found:
        if item not in uniq:
            uniq.append(item)
    return uniq


def choose_canonical(text: str) -> str:
    options = canonical_candidates(text)
    for opt in options:
        if format_valid(opt):
            return opt
    return options[0] if options else ""


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def vote(reads) -> Consensus:
    raw_reads = []
    weights: dict[str, float] = {}
    counts: dict[str, int] = {}
    for read in reads:
        text = clean_text(read.text)
        conf = _clamp(read.conf)
        raw_reads.append({"frame_idx": int(read.frame_idx), "text": text, "conf": conf})
        if conf < OCR_MIN_CONF:
            continue
        if not (MIN_PLATE_LEN <= len(text) <= MAX_PLATE_LEN):
            continue
        chosen = choose_canonical(text)
        if not chosen:
            continue
        weights[chosen] = weights.get(chosen, 0.0) + conf
        counts[chosen] = counts.get(chosen, 0) + 1
    if not weights:
        return Consensus("", 0.0, False, raw_reads)
    best = max(weights, key=lambda key: weights[key])
    total = sum(weights.values())
    agreement = weights[best] / total if total else 0.0
    mean_winner = weights[best] / counts[best]
    confidence = _clamp(agreement * mean_winner)
    return Consensus(best, confidence, format_valid(best), raw_reads)


def best_single(reads) -> str:
    """Highest-confidence raw string, before voting. Empty if there are no reads."""
    if not reads:
        return ""
    best = max(reads, key=lambda read: read.conf)
    return clean_text(best.text)
