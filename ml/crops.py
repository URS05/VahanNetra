"""Keep the best plate crops per track, then deskew them."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from config import (
    ANGLE_PENALTY,
    AREA_WEIGHT,
    CANNY_HIGH,
    CANNY_LOW,
    CROPS_PER_TRACK,
    DESKEW_MIN_DEG,
    MIN_PLATE_AREA,
    MIN_SHARPNESS,
    PLATE_WARP_H,
    PLATE_WARP_W,
    QUAD_MIN_AREA_FRAC,
    SHARPNESS_WEIGHT,
)

log = logging.getLogger("ml.crops")


@dataclass
class PlateCrop:
    frame_idx: int
    timestamp: datetime
    image: object
    score: float
    sharpness: float
    area: int
    angle: float


def _order_corners(pts):
    import numpy as np

    pts = np.array(pts, dtype="float32").reshape(-1, 2)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    ordered = [pts[np.argmin(s)], pts[np.argmin(diff)], pts[np.argmax(s)], pts[np.argmax(diff)]]
    return np.array(ordered, dtype="float32")


def _warp(cv2, image, quad):
    import numpy as np

    dst = np.array(
        [[0, 0], [PLATE_WARP_W - 1, 0], [PLATE_WARP_W - 1, PLATE_WARP_H - 1], [0, PLATE_WARP_H - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(_order_corners(quad), dst)
    return cv2.warpPerspective(image, matrix, (PLATE_WARP_W, PLATE_WARP_H))


def _quad_and_angle(cv2, gray):
    import numpy as np

    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, CANNY_LOW, CANNY_HIGH)
    contours, _hier = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, 0.0
    cont = max(contours, key=cv2.contourArea)
    crop_area = float(gray.shape[0] * gray.shape[1])
    if cv2.contourArea(cont) < QUAD_MIN_AREA_FRAC * crop_area:
        # Text strokes, not the plate outline. Caller will only resize.
        return None, 0.0
    peri = cv2.arcLength(cont, True)
    approx = cv2.approxPolyDP(cont, 0.04 * peri, True)
    rect = cv2.minAreaRect(cont)
    angle = float(rect[2])
    rw, rh = rect[1]
    if rw < rh:
        angle = angle + 90.0
    if len(approx) == 4:
        return approx.reshape(4, 2), angle
    box = cv2.boxPoints(rect)
    return np.array(box, dtype="float32"), angle


def _small_skew(angle: float) -> float:
    """Fold OpenCV's right-angle box pose down to a small deskew. 180 and 90 become 0."""
    while angle > 45.0:
        angle -= 90.0
    while angle < -45.0:
        angle += 90.0
    if abs(angle) < DESKEW_MIN_DEG:
        return 0.0
    return angle


def _resize(cv2, image):
    return cv2.resize(image, (PLATE_WARP_W, PLATE_WARP_H), interpolation=cv2.INTER_CUBIC)


def correct_plate(bgr):
    """Perspective warp when a quad is found, else a small deskew. No super resolution."""
    try:
        import cv2
    except Exception as exc:
        log.error("OpenCV missing, crop skipped: %s", exc)
        return None, {}
    if bgr is None or getattr(bgr, "size", 0) == 0:
        return None
    area = int(bgr.shape[0] * bgr.shape[1])
    if area < MIN_PLATE_AREA:
        return None
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    quad, angle = _quad_and_angle(cv2, gray)
    if quad is not None:
        try:
            warped = _warp(cv2, bgr, quad)
        except Exception as exc:
            log.warning("warp failed, resizing crop: %s", exc)
            warped = _resize(cv2, bgr)
            angle = 0.0
    else:
        warped = _resize(cv2, bgr)
        angle = 0.0
    angle = _small_skew(angle)
    if angle != 0.0:
        h, w = warped.shape[:2]
        matrix = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
        warped = cv2.warpAffine(warped, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    if warped.shape[1] != PLATE_WARP_W or warped.shape[0] != PLATE_WARP_H:
        warped = _resize(cv2, warped)
    sharp_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(sharp_gray, cv2.CV_64F).var())
    if sharpness < MIN_SHARPNESS:
        return None
    score = SHARPNESS_WEIGHT * sharpness + AREA_WEIGHT * area - ANGLE_PENALTY * abs(angle)
    return warped, {
        "score": score,
        "sharpness": sharpness,
        "area": area,
        "angle": float(angle),
    }


def consider(crops: list[PlateCrop], frame, plate_xyxy, frame_idx: int, timestamp: datetime) -> list[PlateCrop]:
    if plate_xyxy is None:
        return crops
    x1, y1, x2, y2 = plate_xyxy
    crop = frame[y1:y2, x1:x2]
    corrected = correct_plate(crop)
    if corrected is None:
        return crops
    image, metrics = corrected
    if image is None:
        return crops
    crops.append(
        PlateCrop(
            frame_idx=frame_idx,
            timestamp=timestamp,
            image=image,
            score=float(metrics["score"]),
            sharpness=float(metrics["sharpness"]),
            area=int(metrics["area"]),
            angle=float(metrics["angle"]),
        )
    )
    crops.sort(key=lambda item: item.score, reverse=True)
    del crops[CROPS_PER_TRACK:]
    return crops
