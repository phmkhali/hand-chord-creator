from __future__ import annotations

from dataclasses import dataclass

import pygame

from config import MUTED_TEXT_COLOR, TEXT_COLOR, Chord, find_chord, suggest_chords


@dataclass(frozen=True, slots=True)
class EditorAction:
    kind: str
    chord: Chord | None = None
    index: int | None = None


class ChordEditor:
    MAX_CHORDS = 12

    def __init__(self) -> None:
        self.text = ""
        self.focused = False
        self.message = "Type a chord such as C, F#m, or Bb dim"
        self._input_rect = pygame.Rect(0, 0, 0, 0)
        self._add_rect = pygame.Rect(0, 0, 0, 0)
        self._suggestion_rects: list[tuple[pygame.Rect, Chord]] = []
        self._remove_rects: list[tuple[pygame.Rect, int]] = []

    def is_editing(self) -> bool:
        return self.focused

    def handle_event(
        self,
        event: pygame.event.Event,
        chords: list[Chord],
    ) -> EditorAction | None:
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            position = event.pos
            if self._input_rect.collidepoint(position):
                self._set_focus(True)
                return None
            if self._add_rect.collidepoint(position):
                return self._add_from_text(chords)
            for rect, chord in self._suggestion_rects:
                if rect.collidepoint(position):
                    self.text = chord.name
                    return self._add_chord(chord, chords)
            for rect, index in self._remove_rects:
                if rect.collidepoint(position):
                    self.message = f"Removed {chords[index].name}"
                    return EditorAction("remove", index=index)
            self._set_focus(False)

        if event.type != pygame.KEYDOWN or not self.focused:
            return None
        if event.key == pygame.K_ESCAPE:
            self._set_focus(False)
        elif event.key == pygame.K_BACKSPACE:
            self.text = self.text[:-1]
        elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            return self._add_from_text(chords)
        elif event.unicode and event.unicode.isprintable() and len(self.text) < 32:
            self.text += event.unicode
        return None

    def draw(self, surface: pygame.Surface, chords: list[Chord]) -> None:
        width, height = surface.get_size()
        panel_width = min(500, max(330, int(width * 0.45)))
        panel_height = min(270, max(210, int(height * 0.34)))
        panel_rect = pygame.Rect(18, height - panel_height - 18, panel_width, panel_height)
        panel = pygame.Surface(panel_rect.size, pygame.SRCALPHA)
        pygame.draw.rect(panel, (12, 16, 23, 205), panel.get_rect(), border_radius=14)
        pygame.draw.rect(panel, (255, 255, 255, 50), panel.get_rect(), width=1, border_radius=14)
        surface.blit(panel, panel_rect)

        title_font = pygame.font.Font(None, 27)
        body_font = pygame.font.Font(None, 20)
        small_font = pygame.font.Font(None, 17)
        surface.blit(title_font.render("Edit chord wheel", True, TEXT_COLOR), (panel_rect.x + 14, panel_rect.y + 12))
        message = small_font.render(self.message, True, MUTED_TEXT_COLOR)
        surface.blit(message, (panel_rect.x + 15, panel_rect.y + 42))

        self._input_rect = pygame.Rect(panel_rect.x + 14, panel_rect.bottom - 48, panel_width - 92, 34)
        self._add_rect = pygame.Rect(self._input_rect.right + 8, self._input_rect.y, 56, 34)
        input_color = (38, 47, 61) if self.focused else (29, 36, 47)
        pygame.draw.rect(surface, input_color, self._input_rect, border_radius=7)
        pygame.draw.rect(
            surface,
            (132, 190, 255) if self.focused else (255, 255, 255, 65),
            self._input_rect,
            width=2,
            border_radius=7,
        )
        shown_text = self.text or "Search chords..."
        shown_color = TEXT_COLOR if self.text else MUTED_TEXT_COLOR
        surface.blit(
            body_font.render(shown_text, True, shown_color),
            (self._input_rect.x + 10, self._input_rect.y + 8),
        )
        pygame.draw.rect(surface, (75, 132, 194), self._add_rect, border_radius=7)
        add_label = body_font.render("Add", True, TEXT_COLOR)
        surface.blit(add_label, add_label.get_rect(center=self._add_rect.center))

        self._draw_chips(surface, chords, panel_rect, body_font)
        self._draw_suggestions(surface, body_font, small_font)

    def _draw_chips(
        self,
        surface: pygame.Surface,
        chords: list[Chord],
        panel_rect: pygame.Rect,
        font: pygame.font.Font,
    ) -> None:
        self._remove_rects = []
        x = panel_rect.x + 14
        y = panel_rect.y + 68
        maximum_x = panel_rect.right - 14
        maximum_y = self._input_rect.y - 8
        for index, chord in enumerate(chords):
            label = font.render(chord.name, True, TEXT_COLOR)
            chip_width = label.get_width() + 34
            if x + chip_width > maximum_x:
                x = panel_rect.x + 14
                y += 30
            if y + 26 > maximum_y:
                break
            chip = pygame.Rect(x, y, chip_width, 25)
            pygame.draw.rect(surface, (*chord.color, 210), chip, border_radius=12)
            surface.blit(label, (chip.x + 9, chip.y + 4))
            remove_rect = pygame.Rect(chip.right - 23, chip.y + 2, 21, 21)
            remove_label = font.render("×", True, TEXT_COLOR)
            surface.blit(remove_label, remove_label.get_rect(center=remove_rect.center))
            self._remove_rects.append((remove_rect, index))
            x = chip.right + 6

    def _draw_suggestions(
        self,
        surface: pygame.Surface,
        font: pygame.font.Font,
        small_font: pygame.font.Font,
    ) -> None:
        self._suggestion_rects = []
        if not self.focused or not self.text.strip():
            return
        suggestions = suggest_chords(self.text, limit=4)
        for row, chord in enumerate(reversed(suggestions)):
            rect = pygame.Rect(
                self._input_rect.x,
                self._input_rect.y - (row + 1) * 32,
                self._input_rect.width,
                31,
            )
            pygame.draw.rect(surface, (25, 32, 43, 245), rect, border_radius=5)
            pygame.draw.rect(surface, (255, 255, 255, 40), rect, width=1, border_radius=5)
            surface.blit(font.render(chord.name, True, TEXT_COLOR), (rect.x + 9, rect.y + 6))
            notes = small_font.render(" ".join(chord.notes), True, MUTED_TEXT_COLOR)
            surface.blit(notes, (rect.right - notes.get_width() - 9, rect.y + 8))
            self._suggestion_rects.append((rect, chord))

    def _add_from_text(self, chords: list[Chord]) -> EditorAction | None:
        chord = find_chord(self.text)
        if chord is None:
            suggestions = suggest_chords(self.text, limit=2)
            if len(suggestions) == 1:
                chord = suggestions[0]
        if chord is None:
            self.message = "Choose a suggestion or enter a valid chord"
            return None
        return self._add_chord(chord, chords)

    def _add_chord(self, chord: Chord, chords: list[Chord]) -> EditorAction | None:
        if len(chords) >= self.MAX_CHORDS:
            self.message = f"The wheel supports up to {self.MAX_CHORDS} chords"
            return None
        if any(existing.name == chord.name for existing in chords):
            self.message = f"{chord.name} is already on the wheel"
            return None
        self.message = f"Added {chord.name}"
        self.text = ""
        return EditorAction("add", chord=chord)

    def _set_focus(self, focused: bool) -> None:
        self.focused = focused
        if focused:
            pygame.key.start_text_input()
        else:
            pygame.key.stop_text_input()
