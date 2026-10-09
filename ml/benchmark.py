"""Measure detector FPS and dry-run consensus. Unmeasured fields stay null."""

from __future__ import annotations

import argparse
import json
import logging
import tempfile
import time
from pathlib import Path

from config import BENCH_MAX_FRAMES, BENCHMARK_OUT, SYNTH_FRAME_TEXT, SYNTH_PLATE
from consensus import best_single
from detect_track import Detector
from ingest import iter_synthetic_frames, synth_text_for_frame
from ocr import build_reader
from run_clip import process_source

log = logging.getLogger("ml.benchmark")


def _torch_cuda() -> tuple[bool, str]:
    try:
        import torch
    except Exception as exc:
        return False, f"torch import failed: {exc}"
    cuda = bool(torch.cuda.is_available())
    return cuda, f"torch {torch.__version__} cuda={cuda}"


def _time_yolo(frames: int) -> dict | None:
    detector = Detector(mode="yolo")
    if detector.vehicle is None:
        return None
    packets = list(iter_synthetic_frames("CAM01", count=max(2, frames)))
    # warmup
    detector.process(packets[0].frame)
    t0 = time.perf_counter()
    detections = 0
    timed = packets[1:]
    for packet in timed:
        detections += len(detector.process(packet.frame))
    seconds = time.perf_counter() - t0
    n = len(timed)
    fps = (n / seconds) if seconds > 0 else 0.0
    return {
        "frames": n,
        "seconds": round(seconds, 4),
        "fps": round(fps, 3),
        "detections": detections,
        "device_note": "ultralytics device auto, CPU torch build",
        "note": "Frames are synthetic drawings. Detection count is not clip accuracy.",
    }


def _consensus_stats(events: list[dict]) -> dict:
    raw_total = 0
    raw_match_painted = 0
    raw_match_plate = 0
    consensus_match = 0
    single_match = 0
    details = []
    for event in events:
        reads = event.get("raw_reads") or []
        raw_total += len(reads)
        painted_hits = 0
        plate_hits = 0
        for read in reads:
            painted = synth_text_for_frame(int(read["frame_idx"]))
            if read["text"] == painted:
                painted_hits += 1
            if read["text"] == SYNTH_PLATE:
                plate_hits += 1
        raw_match_painted += painted_hits
        raw_match_plate += plate_hits
        if event.get("plate_text") == SYNTH_PLATE:
            consensus_match += 1
        # best single raw read inside this event
        class _R:
            def __init__(self, frame_idx, text, conf):
                self.frame_idx = frame_idx
                self.text = text
                self.conf = conf

        objs = [_R(r["frame_idx"], r["text"], r["conf"]) for r in reads]
        single = best_single(objs)
        if single == SYNTH_PLATE:
            single_match += 1
        details.append(
            {
                "plate_text": event.get("plate_text"),
                "plate_confidence": event.get("plate_confidence"),
                "best_single_raw": single,
                "raw_reads": reads,
                "format_valid": event.get("format_valid"),
            }
        )
    n = len(events)
    return {
        "events": n,
        "raw_reads": raw_total,
        "raw_exact_painted": raw_match_painted,
        "raw_exact_synth_plate": raw_match_plate,
        "consensus_match_synth_plate": consensus_match,
        "best_single_match_synth_plate": single_match,
        "consensus_beats_single": consensus_match > single_match,
        "painted_variants": SYNTH_FRAME_TEXT,
        "true_plate": SYNTH_PLATE,
        "events_detail": details,
        "note": "Counts are from this dry synthetic run only. No sample clips, so clip OCR was not measured.",
    }


def run_benchmark(yolo_frames: int | None = None) -> dict:
    cuda, torch_note = _torch_cuda()
    yolo = None
    yolo_error = ""
    try:
        yolo = _time_yolo(yolo_frames or BENCH_MAX_FRAMES)
    except Exception as exc:
        yolo_error = str(exc)
        log.error("yolo timing failed: %s", exc)
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = Path(tmp) / "events.jsonl"
        t0 = time.perf_counter()
        events = process_source(
            camera_id="CAM01",
            dry_run=True,
            jsonl_path=jsonl,
            do_post=False,
            allow_template=True,
        )
        seconds = time.perf_counter() - t0
    from config import SYNTH_FRAMES

    fps = (SYNTH_FRAMES / seconds) if seconds > 0 else 0.0
    reader = build_reader(allow_template=False)
    report = {
        "torch": torch_note,
        "gpu_fps": None,
        "gpu_note": "torch reports CUDA, but this script did not time a separate GPU pass"
        if cuda
        else "torch is CPU-only here, GPU FPS not measured",
        "yolo_cpu": yolo,
        "yolo_error": yolo_error or None,
        "dry_pipeline": {
            "frames": SYNTH_FRAMES,
            "seconds": round(seconds, 4),
            "fps": round(fps, 3),
            "events": len(events),
            "detector": "geometric",
            "ocr": "template",
        },
        "installed_ocr_without_template": reader.name,
        "consensus_vs_single": _consensus_stats(events) if events else {
            "events": 0,
            "note": "No events, consensus vs single-frame not measured.",
        },
    }
    BENCHMARK_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Measure VahanNetra M1 throughput")
    parser.add_argument("--yolo-frames", type=int, default=BENCH_MAX_FRAMES)
    args = parser.parse_args(argv)
    report = run_benchmark(args.yolo_frames)
    print(json.dumps({k: report[k] for k in report if k != "consensus_vs_single"}, indent=2))
    print(json.dumps(report["consensus_vs_single"], indent=2))
    print(f"wrote {BENCHMARK_OUT}")
    return 0 if report["dry_pipeline"]["events"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
