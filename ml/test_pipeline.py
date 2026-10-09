"""Small checks for consensus, schema, direction, and the dry-run path."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from consensus import best_single, format_valid, vote
from detect_track import compass_from_motion, vehicle_color
from emit import build_event
from ocr import Read
from validate_events import validate_event


class ConsensusTests(unittest.TestCase):
    def test_confusable_vote(self):
        reads = [
            Read(0, "TS09AB1234", 0.9),
            Read(3, "TSO9AB1234", 0.6),
            Read(7, "TS09A81234", 0.55),
            Read(11, "TS09ABI234", 0.5),
        ]
        result = vote(reads)
        self.assertEqual(result.plate_text, "TS09AB1234")
        self.assertTrue(result.format_valid)
        self.assertGreater(result.plate_confidence, 0.5)
        self.assertEqual(len(result.raw_reads), 4)
        self.assertEqual(best_single(reads), "TS09AB1234")

    def test_format_rules(self):
        self.assertTrue(format_valid("TS09AB1234"))
        self.assertTrue(format_valid("MH12A1234"))
        self.assertTrue(format_valid("22BH1234AA"))
        self.assertFalse(format_valid("HELLO"))
        self.assertFalse(format_valid("TS09AB123"))

    def test_empty(self):
        result = vote([])
        self.assertEqual(result.plate_text, "")
        self.assertFalse(result.format_valid)


class MotionTests(unittest.TestCase):
    def test_rightward_with_camera_heading(self):
        points = [(10.0, 100.0), (200.0, 100.0)]
        self.assertEqual(compass_from_motion(points, 135), "SW")

    def test_image_up_is_heading(self):
        points = [(50.0, 200.0), (50.0, 40.0)]
        self.assertEqual(compass_from_motion(points, 0), "N")


class ColorTests(unittest.TestCase):
    def test_solid_colors(self):
        import numpy as np

        red = np.zeros((40, 40, 3), dtype=np.uint8)
        red[:, :, 2] = 220
        black = np.zeros((40, 40, 3), dtype=np.uint8)
        white = np.full((40, 40, 3), 255, dtype=np.uint8)
        self.assertEqual(vehicle_color(red), "red")
        self.assertEqual(vehicle_color(black), "black")
        self.assertEqual(vehicle_color(white), "white")


class SchemaTests(unittest.TestCase):
    def test_round_trip(self):
        from datetime import datetime, timezone

        event = build_event(
            plate_text="TS09AB1234",
            plate_confidence=0.8,
            format_ok=True,
            raw_reads=[{"frame_idx": 0, "text": "TS09AB1234", "conf": 0.8}],
            camera_id="CAM01",
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
            direction="SW",
            lane=2,
            vehicle_type="other",
            vehicle_color="gray",
            speed_estimate=None,
            plate_image_ref="",
            source="synthetic",
        )
        self.assertEqual(validate_event(event), [])

    def test_rejects_bad_direction(self):
        event = {
            "event_id": "x",
            "plate_text": "TS09AB1234",
            "plate_confidence": 0.5,
            "format_valid": True,
            "raw_reads": [],
            "camera_id": "CAM01",
            "timestamp": "2026-01-01T00:00:00Z",
            "direction": "UP",
            "lane": 1,
            "vehicle_type": "car",
            "vehicle_color": "white",
            "speed_estimate": None,
            "plate_image_ref": "",
            "source": "real_clip",
        }
        self.assertTrue(validate_event(event))


class DryRunTests(unittest.TestCase):
    def test_dry_run_event_validates(self):
        from run_clip import process_source

        with tempfile.TemporaryDirectory() as tmp:
            events = process_source(
                camera_id="CAM01",
                dry_run=True,
                jsonl_path=Path(tmp) / "events.jsonl",
                do_post=False,
            )
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(validate_event(event), [])
        self.assertEqual(event["source"], "synthetic")
        self.assertEqual(event["plate_text"], "TS09AB1234")
        self.assertTrue(event["format_valid"])
        self.assertEqual(event["direction"], "SW")
        self.assertIsNone(event["speed_estimate"])
        self.assertGreaterEqual(len(event["raw_reads"]), 1)


if __name__ == "__main__":
    unittest.main()
