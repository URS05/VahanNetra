"""Record a YouTube clip label and print the cut command. Does not download."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import VIDEOS_DIR

LABELS = Path(__file__).resolve().parent / "labels.json"
CAMERAS = ("CAM01", "CAM02", "CAM03", "CAM04", "CAM05")
CONDITIONS = ("day", "dusk", "night", "rain", "blur", "angle", "dirty")


def load() -> dict:
    if not LABELS.exists():
        return {"clips": []}
    return json.loads(LABELS.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    LABELS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def end_clock(start: str, duration: int) -> str:
    parts = [int(p) for p in start.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    total = parts[0] * 3600 + parts[1] * 60 + parts[2] + duration
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def ytdlp(camera: str, condition: str, url: str, start: str, duration: int) -> str:
    raw = Path("sim/clips/raw") / f"{camera}_{condition}.mp4"
    final = VIDEOS_DIR / f"{camera}.mp4"
    end = end_clock(start, duration)
    return (
        f'yt-dlp --download-sections "*{start}-{end}" '
        f'-f "bv*[height<=480]+ba/b[height<=480]" '
        f'-o "{raw}" "{url}"\n'
        f'ffmpeg -y -i "{raw}" -c copy "{final}"'
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Label a camera clip. Does not download.")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--camera", choices=CAMERAS)
    parser.add_argument("--condition", choices=CONDITIONS)
    parser.add_argument("--url", default="")
    parser.add_argument("--start", default="00:00:00", help="Start clock HH:MM:SS")
    parser.add_argument("--duration", type=int, default=45, help="Seconds, 30 to 60")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    data = load()
    if args.list or not args.camera:
        for row in data.get("clips", []):
            print(
                f"{row['camera']} {row['condition']} {row['duration_s']}s "
                f"{row.get('url') or '(no url)'}"
            )
        print(f"{len(data.get('clips', []))} labels in {LABELS}")
        return 0

    if not 30 <= args.duration <= 60:
        print("duration must be 30 to 60 seconds", file=sys.stderr)
        return 1
    if args.url and "youtube.com" not in args.url and "youtu.be" not in args.url:
        print("url should be a YouTube link", file=sys.stderr)
        return 1

    row = {
        "camera": args.camera,
        "condition": args.condition or "day",
        "url": args.url,
        "start": args.start,
        "duration_s": args.duration,
        "working_name": f"{args.camera}_{args.condition or 'day'}.mp4",
        "output": f"data/videos/{args.camera}.mp4",
        "notes": args.notes,
    }
    clips = [c for c in data.get("clips", []) if c.get("camera") != args.camera]
    clips.append(row)
    clips.sort(key=lambda c: c["camera"])
    data["clips"] = clips
    save(data)
    print(f"saved {args.camera} to {LABELS}")
    print(ytdlp(args.camera, row["condition"], args.url or "URL", args.start, args.duration))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
