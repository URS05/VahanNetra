# Clip sources

No YouTube URL is pinned in this repo yet. Do not download a full video. Record the URL with the label tool, then cut a 30 to 60 second section.

## Working name and final name

Working file (camera plus condition): `sim/clips/raw/CAM01_day.mp4`

Conditions to use in the name: day, dusk, night, rain, blur, angle, dirty.

Final file the app reads: `data/videos/CAM01.mp4` through `data/videos/CAM05.mp4`.

## Download a short section only

Replace `URL`, `START`, and `END`. Keep the window between 30 and 60 seconds.

```
yt-dlp --download-sections "*START-END" -f "bv*[height<=480]+ba/b[height<=480]" -o "sim/clips/raw/CAM01_day.mp4" "URL"
```

Example window: `*00:01:10-00:01:55` (45 seconds).

If the site will not cut on download, grab a short format and trim:

```
yt-dlp -f "b[height<=480]" --max-filesize 80M -o "sim/clips/raw/CAM01_day_src.mp4" "URL"
ffmpeg -y -ss 00:01:10 -t 45 -i "sim/clips/raw/CAM01_day_src.mp4" -c:v libx264 -c:a aac "sim/clips/raw/CAM01_day.mp4"
```

Delete the `_src` file after the trim. Copy the cut into the demo slot:

```
ffmpeg -y -i "sim/clips/raw/CAM01_day.mp4" -c copy "data/videos/CAM01.mp4"
```

Repeat for CAM02, CAM03, CAM04, CAM05. Height 480 keeps the file small enough for one laptop.

## Label tool

```
python sim/clips/label_tool.py --camera CAM01 --condition day --url "https://www.youtube.com/watch?v=VIDEO" --start 00:01:10 --duration 45 --notes "plates readable in lane 2"
```

This writes `sim/clips/labels.json` and prints the yt-dlp command. It does not download.

```
python sim/clips/label_tool.py --list
```

## Vetting checklist

- [ ] Length is 30 to 60 seconds (`ffprobe -v error -show_entries format=duration -of csv=p=0 data/videos/CAM01.mp4`).
- [ ] Working filename includes the camera id and a condition word.
- [ ] Final copy is `data/videos/CAM0N.mp4` only. No extra video is committed.
- [ ] The YouTube page is public. URL, channel, start, and duration are in `labels.json`.
- [ ] Traffic is moving. At least some plates are large enough to read.
- [ ] The clip matches the camera role: junction, arterial, or approach. Note the condition (day, dusk, night, rain, blur, angle, dirty).
- [ ] Audio can stay. No need for a silent export.
- [ ] Full-length downloads are deleted. Only the cut remains.
- [ ] Five files exist, one per camera, before the OCR demo.
