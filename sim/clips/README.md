# Camera clips

Each of the five corridor cameras plays one local file. There is no live RTSP feed.

Final files, named exactly as `contracts/cameras.json`:

| Output | Camera | Place |
|---|---|---|
| data/videos/CAM01.mp4 | CAM01 | Hitech City Junction |
| data/videos/CAM02.mp4 | CAM02 | Madhapur |
| data/videos/CAM03.mp4 | CAM03 | Kondapur |
| data/videos/CAM04.mp4 | CAM04 | Gachibowli Junction |
| data/videos/CAM05.mp4 | CAM05 | Financial District |

Video 1 is camera 1. Video 3 is camera 3.

Clips are 30 to 60 seconds, cut from public YouTube traffic footage. Working copies are named by camera and condition (`CAM01_day.mp4`, `CAM04_rain.mp4`) under `sim/clips/raw/`. The demo path is always `data/videos/CAM0N.mp4`.

`data/videos/*.mp4` is gitignored. Do not commit video files.

Commands, the vetting checklist, and the label tool are in `SOURCES.md`.

After the files are in place:

1. `GET /api/cameras` shows `video_present: true` for each camera.
2. ML runs: `python ml/run_clip.py --camera CAM01 --video data/videos/CAM01.mp4`
3. One event per vehicle per camera pass is POSTed to `/api/events` with `source: real_clip`.
4. The same plate will not appear on all five clips. The multi-camera journey is `POST /api/simulate` (source `simulated`). City analytics use `python sim/generate.py` (source `synthetic`).
