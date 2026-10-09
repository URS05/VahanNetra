"""OCR on kept plate crops. PaddleOCR, then fast-plate-ocr, then a dry-run template reader."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from config import (
    GLYPH_H,
    GLYPH_W,
    OCR_BACKEND,
    OCR_LANG,
    OCR_USE_GPU,
    SYNTH_FONT_SCALE,
    SYNTH_FONT_THICK,
    TEMPLATE_MIN_SCORE,
)

log = logging.getLogger("ml.ocr")

_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


@dataclass
class Read:
    frame_idx: int
    text: str
    conf: float


class Reader:
    def __init__(self, name: str):
        self.name = name

    def read(self, image, frame_idx: int) -> Read | None:
        return None


class NullReader(Reader):
    def __init__(self):
        super().__init__("none")


def _paddle_engine():
    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        log.info("PaddleOCR is not installed: %s", exc)
        return None
    try:
        engine = PaddleOCR(use_angle_cls=True, lang=OCR_LANG, use_gpu=OCR_USE_GPU, show_log=False)
        return "paddle2", engine
    except TypeError:
        pass
    except Exception as exc:
        log.error("PaddleOCR 2.x init failed: %s", exc)
    try:
        engine = PaddleOCR(lang=OCR_LANG)
        return "paddle3", engine
    except Exception as exc:
        log.error("PaddleOCR init failed: %s", exc)
        return None


def _lines_from_paddle(kind: str, engine, image) -> list[tuple[str, float]]:
    lines: list[tuple[str, float]] = []
    if kind == "paddle2":
        result = engine.ocr(image, cls=True)
        rows = result[0] if result else None
        for row in rows or []:
            text, conf = row[1]
            lines.append((str(text), float(conf)))
        return lines
    result = engine.predict(image) if hasattr(engine, "predict") else engine.ocr(image)
    if not result:
        return lines
    for block in result:
        if isinstance(block, dict):
            texts = block.get("rec_texts") or block.get("texts") or []
            confs = block.get("rec_scores") or block.get("scores") or []
            for text, conf in zip(texts, confs or [0.0] * len(texts)):
                lines.append((str(text), float(conf)))
            continue
        if isinstance(block, list):
            for row in block:
                if isinstance(row, (list, tuple)) and len(row) >= 2 and isinstance(row[1], (list, tuple)):
                    lines.append((str(row[1][0]), float(row[1][1])))
    return lines


class PaddleReader(Reader):
    def __init__(self, kind: str, engine):
        super().__init__("paddleocr")
        self.kind = kind
        self.engine = engine

    def read(self, image, frame_idx: int) -> Read | None:
        try:
            lines = _lines_from_paddle(self.kind, self.engine, image)
        except Exception as exc:
            log.error("PaddleOCR read failed: %s", exc)
            return None
        if not lines:
            return None
        lines.sort(key=lambda item: item[1], reverse=True)
        text = "".join(ch for ch in lines[0][0].upper() if ch.isalnum())
        if not text:
            return None
        return Read(frame_idx=frame_idx, text=text, conf=max(0.0, min(1.0, lines[0][1])))


def _fast_engine():
    try:
        import fast_plate_ocr
    except Exception as exc:
        log.info("fast-plate-ocr is not installed: %s", exc)
        return None
    try:
        cls = getattr(fast_plate_ocr, "LicensePlateRecognizer", None) or getattr(
            fast_plate_ocr, "ONNXPlateRecognizer", None
        )
        if cls is None:
            log.error("fast-plate-ocr has no recognizer class")
            return None
        try:
            return cls("cct-xs-v2-global-model")
        except Exception:
            return cls()
    except Exception as exc:
        log.error("fast-plate-ocr init failed: %s", exc)
        return None


class FastPlateReader(Reader):
    def __init__(self, engine):
        super().__init__("fast_plate_ocr")
        self.engine = engine

    def read(self, image, frame_idx: int) -> Read | None:
        try:
            pred = self.engine.run(image)
        except Exception as exc:
            log.error("fast-plate-ocr read failed: %s", exc)
            return None
        text = ""
        conf = 0.5
        if isinstance(pred, (list, tuple)) and pred:
            first = pred[0]
            if isinstance(first, (list, tuple)):
                text = str(first[0])
                if len(first) > 1:
                    conf = float(first[1])
            else:
                text = str(first)
        elif isinstance(pred, str):
            text = pred
        text = "".join(ch for ch in text.upper() if ch.isalnum())
        if not text:
            return None
        return Read(frame_idx=frame_idx, text=text, conf=max(0.0, min(1.0, conf)))


def _ink_mask(cv2, gray):
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _thr, mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return mask


def _norm_glyph(cv2, np, mask):
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return None
    glyph = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    glyph = cv2.resize(glyph, (GLYPH_W, GLYPH_H), interpolation=cv2.INTER_NEAREST)
    vec = (glyph > 127).astype("float32").reshape(-1)
    norm = float(np.linalg.norm(vec))
    if norm < 1e-6:
        return None
    return vec / norm


class TemplateReader(Reader):
    """Pixel template match for dry-run plates painted with the same OpenCV font.

    This is not PaddleOCR and is not used on real clips unless OCR_BACKEND=template.
    """

    def __init__(self):
        super().__init__("template")
        self._templates: dict[str, object] | None = None

    def _build(self, cv2, np):
        if self._templates is not None:
            return
        built = {}
        for ch in _GLYPHS:
            canvas = np.full((64, 48), 255, dtype=np.uint8)
            cv2.putText(
                canvas,
                ch,
                (4, 48),
                cv2.FONT_HERSHEY_SIMPLEX,
                SYNTH_FONT_SCALE,
                0,
                SYNTH_FONT_THICK,
                cv2.LINE_AA,
            )
            vec = _norm_glyph(cv2, np, _ink_mask(cv2, canvas))
            if vec is not None:
                built[ch] = vec
        self._templates = built
        log.info("template OCR glyphs=%s", len(built))

    def read(self, image, frame_idx: int) -> Read | None:
        try:
            import cv2
            import numpy as np
        except Exception as exc:
            log.error("template OCR needs OpenCV: %s", exc)
            return None
        self._build(cv2, np)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        mask = _ink_mask(cv2, gray)
        cols = (mask > 0).sum(axis=0)
        spans = []
        start = None
        for i, val in enumerate(cols):
            if val > 0 and start is None:
                start = i
            elif val == 0 and start is not None:
                if i - start >= 2:
                    spans.append((start, i))
                start = None
        if start is not None and mask.shape[1] - start >= 2:
            spans.append((start, mask.shape[1]))
        chars = []
        scores = []
        templates = self._templates or {}
        for x0, x1 in spans:
            vec = _norm_glyph(cv2, np, mask[:, x0:x1])
            if vec is None or not templates:
                continue
            best_ch = ""
            best_s = -1.0
            for ch, ref in templates.items():
                score = float(np.dot(vec, ref))
                if score > best_s:
                    best_s = score
                    best_ch = ch
            if best_s < TEMPLATE_MIN_SCORE:
                continue
            chars.append(best_ch)
            scores.append(max(0.0, min(1.0, best_s)))
        if not chars:
            return None
        conf = float(sum(scores) / len(scores))
        return Read(frame_idx=frame_idx, text="".join(chars), conf=max(0.0, min(1.0, conf)))


def build_reader(allow_template: bool = False) -> Reader:
    """Prefer PaddleOCR. fast-plate-ocr is the alternate. Template is the dry-run fallback."""
    order = []
    if OCR_BACKEND in ("paddleocr", "auto"):
        order.append("paddleocr")
    if OCR_BACKEND in ("fast_plate_ocr", "auto"):
        order.append("fast_plate_ocr")
    if OCR_BACKEND == "paddleocr":
        order.append("fast_plate_ocr")
    if OCR_BACKEND == "template" or allow_template:
        order.append("template")
    for name in order:
        if name == "paddleocr":
            loaded = _paddle_engine()
            if loaded is not None:
                kind, engine = loaded
                log.info("OCR backend paddleocr (%s)", kind)
                return PaddleReader(kind, engine)
        elif name == "fast_plate_ocr":
            engine = _fast_engine()
            if engine is not None:
                log.info("OCR backend fast_plate_ocr")
                return FastPlateReader(engine)
        elif name == "template":
            log.info("OCR backend template (dry-run glyph match, not a clip measurement)")
            return TemplateReader()
    log.error("no OCR backend available, events will be skipped")
    return NullReader()
