# M1 decisions

No sample clips are in `data/videos`. Nothing below is a clip accuracy number.

## OCR backend

Default is `OCR_BACKEND=paddleocr` in `ml/config.py`.

PaddleOCR is not installed. fast-plate-ocr is not installed. There are no CAM clips to compare them, so neither library was scored. The default stays PaddleOCR because that was the offline fallback if fast-plate-ocr was hard to install, and it was not installed either.

Dry-run (`run_clip.py --dry-run`) uses a local OpenCV template matcher on glyphs painted with `FONT_HERSHEY_SIMPLEX`. It does not run on real clips unless `OCR_BACKEND` is set to `template`. Those events use `source=synthetic`. A real video file uses `source=real_clip`.

Install line, not run here:

```
py -3.11 -m pip install paddleocr paddlepaddle
```

## Plate detector

`ml/models/license_plate_detector.pt` is missing. `PLATE_WEIGHTS_URL` is empty, so nothing was downloaded. Vehicle detection still uses pretrained `yolov8n.pt` and Ultralytics ByteTrack. The plate box is searched inside the vehicle box (bright rectangle, else the bottom band). It is not a full-frame plate scan.

ByteTrack needs the `lap` package. It is installed in the Python 3.11 env (`lap==0.5.13`).

## Measured on 2026-10-09 (this machine)

Torch is `2.7.0+cpu`. `torch.cuda.is_available()` is false. The laptop GPU was not used. GPU FPS was not measured.

YOLO + ByteTrack on 39 synthetic frames, CPU, imgsz 640:

- 2.8301 s, 13.78 FPS, 0 vehicle detections
- 0 detections is expected: the frames are drawings, not photos

Full dry-run pipeline (geometric detector, template OCR, 16 frames): 0.2496 s, 64.104 FPS, 1 event. That number is not the YOLO rate.

`FRAME_STRIDE` is 2 for real clips. Stride was not re-benchmarked. 13.78 is below the 15 FPS GPU target.

Consensus vs best single raw read, one synthetic track, 5 kept crops (template OCR only):

| check | result |
| --- | --- |
| voted plate | TS09AB1234 |
| plate_confidence | 0.920 |
| format_valid | true |
| best single raw | TSO9ABI234 |
| single matches TS09AB1234 | no |
| consensus matches TS09AB1234 | yes |
| raw reads equal to the painted string | 0 / 5 |
| raw reads equal to TS09AB1234 | 1 / 5 |

The template reader often swaps 0 and O. Format-guided voting maps digit slots and letter slots (`0/O`, `1/I`, `8/B`, `5/S`, `2/Z`) and the five reads collapse to `TS09AB1234`. The highest-confidence single read does not.

## Other knobs

`PIXELS_PER_METER` is 0, so `speed_estimate` is null. Direction is image motion rotated by the camera heading in `contracts/cameras.json`. Up the frame follows that heading.
