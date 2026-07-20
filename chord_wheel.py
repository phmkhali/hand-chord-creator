from __future__ import annotations

import math
from collections.abc import Sequence

import pygame

from config import TEXT_COLOR, Chord
from wheel_logic import section_at_point


class ChordWheel:
    def __init__(self, chords: Sequence[Chord]) -> None:
        self.chords = chords

    def layout(self, surface_size: tuple[int, int]) -> tuple[tuple[int, int], int]:
        width, height = surface_size
        radius = max(115, min(int(width * 0.23), int(height * 0.36)))
        center = (width - radius - max(25, int(width * 0.035)), height // 2)
        return center, radius

    def section_at(self, point: tuple[float, float], surface_size: tuple[int, int]) -> int | None:
        center, radius = self.layout(surface_size)
        return section_at_point(point, center, radius, len(self.chords))

    def draw(self, surface: pygame.Surface, active: int | None) -> None:
        center, radius = self.layout(surface.get_size())
        overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        pygame.draw.circle(overlay, (10, 14, 20, 80), center, radius + 12)
        if not self.chords:
            pygame.draw.circle(overlay, (255, 255, 255, 90), center, radius, width=2)
            font = pygame.font.Font(None, 28)
            label = font.render("Add a chord", True, TEXT_COLOR)
            overlay.blit(label, label.get_rect(center=center))
            surface.blit(overlay, (0, 0))
            return
        section_angle = 2.0 * math.pi / len(self.chords)
        label_font = pygame.font.Font(None, max(16, min(24, radius // 12)))
        note_font = pygame.font.Font(None, max(13, min(18, radius // 16)))

        for index, chord in enumerate(self.chords):
            start_angle = index * section_angle - math.pi / 2.0
            points = [center]
            for step in range(13):
                angle = start_angle + section_angle * step / 12
                points.append(
                    (
                        center[0] + math.cos(angle) * radius,
                        center[1] + math.sin(angle) * radius,
                    )
                )
            alpha = 105
            color = (*chord.color, alpha)
            if index == active:
                color = (*tuple(min(255, channel + 45) for channel in chord.color), 205)
            pygame.draw.polygon(overlay, color, points)
            pygame.draw.polygon(overlay, (255, 255, 255, 100), points, width=2)

            middle_angle = start_angle + section_angle / 2.0
            label_radius = radius * 0.68
            label_center = (
                center[0] + math.cos(middle_angle) * label_radius,
                center[1] + math.sin(middle_angle) * label_radius,
            )
            name = label_font.render(chord.name, True, TEXT_COLOR)
            notes = note_font.render(" ".join(chord.notes), True, (225, 228, 234))
            overlay.blit(name, name.get_rect(center=(label_center[0], label_center[1] - 8)))
            if len(self.chords) <= 10:
                overlay.blit(notes, notes.get_rect(center=(label_center[0], label_center[1] + 11)))

        pygame.draw.circle(overlay, (255, 255, 255, 150), center, radius, width=2)
        pygame.draw.circle(overlay, (10, 14, 20, 175), center, max(28, radius // 9))
        surface.blit(overlay, (0, 0))
