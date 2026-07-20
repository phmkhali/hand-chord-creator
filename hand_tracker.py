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
    cursor: tuple[float, float] | None
    fingertips: tuple[tuple[float, float], ...]


class HandTracker:
    FINGERTIP_LANDMARKS = (4, 8, 12, 16, 20)

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
        self._smoothed_fingertips: tuple[tuple[float, float], ...] | None = None
        self._capture = cv2.VideoCapture(camera_index)
        if not self._capture.isOpened():
            self._capture.release()
            raise HandTrackerError(
                f"camera {camera_index} could not be opened; check webcam permissions"
            )
        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
        self._capture.set(cv2.CAP_PROP_FPS, 60)
        self._capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

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
            return TrackingFrame(None, None, ())

        frame_bgr = cv2.flip(frame_bgr, 1)
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        try:
            result = self._hands.process(frame_rgb)
        except Exception as error:
            raise HandTrackerError(f"hand tracking failed: {error}") from error

        cursor = None
        fingertips: tuple[tuple[float, float], ...] = ()
        if result.multi_hand_landmarks:
            landmarks = result.multi_hand_landmarks[0].landmark
            raw_fingertips = tuple(
                (
                    min(1.0, max(0.0, landmarks[index].x)),
                    min(1.0, max(0.0, landmarks[index].y)),
                )
                for index in self.FINGERTIP_LANDMARKS
            )
            if self._smoothed_fingertips is None:
                self._smoothed_fingertips = raw_fingertips
            else:
                self._smoothed_fingertips = tuple(
                    (
                        previous[0] + self.smoothing * (current[0] - previous[0]),
                        previous[1] + self.smoothing * (current[1] - previous[1]),
                    )
                    for previous, current in zip(
                        self._smoothed_fingertips,
                        raw_fingertips,
                        strict=True,
                    )
                )
            fingertips = self._smoothed_fingertips
            cursor = (
                sum(point[0] for point in fingertips) / len(fingertips),
                sum(point[1] for point in fingertips) / len(fingertips),
            )

        return TrackingFrame(frame_rgb, cursor, fingertips)

    def close(self) -> None:
        self._capture.release()
        self._hands.close()
