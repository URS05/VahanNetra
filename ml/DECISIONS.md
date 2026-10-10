# ML decisions: stills demo

fast-plate-ocr is tried first. If that import fails, PaddleOCR is tried.
If the PaddleOCR package is not installed, RapidOCR ONNX runs the PaddleOCR PP-OCR weights.
No plate characters are copied from labels.csv.

# Stills OCR vs labels

OCR backend: rapidocr_onnx. Plate text is the OCR vote. labels.csv was not fed into the pipeline.
label_verified is false until the integrator confirms the human read.

| camera | predicted | label | exact |
| --- | --- | --- | --- |
| CAM01 | TS09EG6531 | TS09EG6531 | yes |
| CAM02 | 3792774031 | AP28AS0018 | no |
| CAM03 | AP10AR0658 | AP10AR0658 | yes |
| CAM04 | HR3870965 | HR38V6965 | no |
| CAM05 | AP21AX369 | AP21AX369 | yes |

Confusable pairs to recheck: 0/O, 1/I, 8/B, 5/S, 2/Z.
