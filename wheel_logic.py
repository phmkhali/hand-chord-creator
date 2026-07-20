from __future__ import annotations

import math

from config import HOVER_DELAY_MS


def section_at_point(
    point: tuple[float, float],
    center: tuple[float, float],
    radius: float,
    section_count: int,
) -> int | None:
    if section_count <= 0:
        return None
    delta_x = point[0] - center[0]
    delta_y = point[1] - center[1]
    if delta_x * delta_x + delta_y * delta_y > radius * radius:
        return None
    angle = (math.atan2(delta_y, delta_x) + math.pi / 2.0) % (2.0 * math.pi)
    return min(int(angle / (2.0 * math.pi / section_count)), section_count - 1)


class HoverSelection:
    def __init__(self, delay_ms: int = HOVER_DELAY_MS) -> None:
        self.delay_ms = delay_ms
        self.active: int | None = None
        self._candidate: int | None = None
        self._candidate_since = 0

    def update(self, section: int | None, now_ms: int) -> tuple[int | None, bool]:
        if section is None:
            changed = self.active is not None
            self.active = None
            self._candidate = None
            return self.active, changed
        if section == self.active:
            self._candidate = section
            return self.active, False
        if section != self._candidate:
            self._candidate = section
            self._candidate_since = now_ms
            if self.delay_ms <= 0:
                self.active = section
                return self.active, True
            return self.active, False
        if now_ms - self._candidate_since >= self.delay_ms:
            self.active = section
            return self.active, True
        return self.active, False
