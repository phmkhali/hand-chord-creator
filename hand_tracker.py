from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from config import CURSOR_SMOOTHING

try:
    import mediapipe as mp
except (ImportError, OSError) as error:
    mp = None
    MEDIAPIPE_IMPORT_ERROR = error
else:
    MEDIAPIPE_IMPORT_ERROR = None


class HandTrackerError(RuntimeError):
    pass


@dataclass(slots=True)
class TrackingFrame:
    image_rgb: np.ndarray | None
    fingertip: tuple[float, float] | None


class HandTracker:
    def __init__(self, camera_index: int = 0, smoothing: float = CURSOR_SMOOTHING) -> None:
        if mp is None:
            detail = f": {MEDIAPIPE_IMPORT_ERROR}" if MEDIAPIPE_IMPORT_ERROR else ""
            raise HandTrackerError(f"MediaPipe could not be loaded{detail}")
        if not hasattr(mp, "solutions"):
            version = getattr(mp, "__version__", "unknown")
            raise HandTrackerError(
                "this app requires MediaPipe 0.10.21 because newer releases removed "
                f"the legacy hand-tracking API; installed version: {version}"
            )

        self.smoothing = smoothing
        self._smoothed_point: tuple[float, float] | None = None
        self._capture = cv2.VideoCapture(camera_index)
        if not self._capture.isOpened():
            self._capture.release()
            raise HandTrackerError(
                f"camera {camera_index} could not be opened; check webcam permissions"
            )
        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)

        try:
            self._hands = mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=1,
                model_complexity=0,
                min_detection_confidence=0.55,
                min_tracking_confidence=0.55,
            )
        except Exception as error:
            self._capture.release()
            raise HandTrackerError(f"MediaPipe hand tracking could not start: {error}") from error

    def read(self) -> TrackingFrame:
        success, frame_bgr = self._capture.read()
        if not success or frame_bgr is None:
            return TrackingFrame(None, None)

        frame_bgr = cv2.flip(frame_bgr, 1)
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        try:
            result = self._hands.process(frame_rgb)
        except Exception as error:
            raise HandTrackerError(f"hand tracking failed: {error}") from error

        point = None
        if result.multi_hand_landmarks:
            fingertip = result.multi_hand_landmarks[0].landmark[8]
            raw_point = (
                min(1.0, max(0.0, fingertip.x)),
                min(1.0, max(0.0, fingertip.y)),
            )
            if self._smoothed_point is None:
                self._smoothed_point = raw_point
            else:
                previous_x, previous_y = self._smoothed_point
                self._smoothed_point = (
                    previous_x + self.smoothing * (raw_point[0] - previous_x),
                    previous_y + self.smoothing * (raw_point[1] - previous_y),
                )
            point = self._smoothed_point

        return TrackingFrame(frame_rgb, point)

    def close(self) -> None:
        self._capture.release()
        self._hands.close()
