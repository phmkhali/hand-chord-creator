from __future__ import annotations

import argparse
import sys

import pygame

from chord_editor import ChordEditor, EditorAction
from chord_wheel import ChordWheel
from config import (
    BACKGROUND_COLOR,
    CHORDS,
    CHORD_CATALOG,
    MINIMUM_WINDOW_SIZE,
    MUTED_TEXT_COLOR,
    TARGET_FPS,
    TEXT_COLOR,
    WINDOW_SIZE,
    Chord,
)
from hand_tracker import HandTracker, HandTrackerError, TrackingFrame
from synthesizer import AudioUnavailableError, ChordSynthesizer
from wheel_logic import HoverSelection


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Play a chord wheel with your hand or mouse.")
    parser.add_argument("--mouse", action="store_true", help="start in mouse-control mode")
    parser.add_argument("--camera-index", type=int, default=0, help="webcam device index")
    return parser.parse_args()


def draw_status(
    surface: pygame.Surface,
    mode: str,
    camera_status: str,
    hand_detected: bool,
    chord_name: str,
    audio_status: str,
) -> None:
    panel = pygame.Surface((310, 151), pygame.SRCALPHA)
    pygame.draw.rect(panel, (10, 14, 20, 185), panel.get_rect(), border_radius=12)
    pygame.draw.rect(panel, (255, 255, 255, 42), panel.get_rect(), width=1, border_radius=12)
    surface.blit(panel, (18, 16))
    title_font = pygame.font.Font(None, 34)
    status_font = pygame.font.Font(None, 22)
    surface.blit(title_font.render("Hand Chord Wheel", True, TEXT_COLOR), (32, 27))
    lines = (
        f"Control: {mode} (press M to switch)",
        f"Camera: {camera_status}",
        f"Hand: {'detected' if hand_detected else 'not detected'}",
        f"Chord: {chord_name}",
        f"Audio: {audio_status}",
    )
    for index, line in enumerate(lines):
        color = TEXT_COLOR if index in (0, 3) else MUTED_TEXT_COLOR
        surface.blit(status_font.render(line, True, color), (33, 62 + index * 19))


def camera_cover_layout(
    image_size: tuple[int, int],
    surface_size: tuple[int, int],
) -> tuple[tuple[int, int], tuple[int, int]]:
    image_width, image_height = image_size
    surface_width, surface_height = surface_size
    scale = max(surface_width / image_width, surface_height / image_height)
    scaled_size = round(image_width * scale), round(image_height * scale)
    offset = (
        (surface_width - scaled_size[0]) // 2,
        (surface_height - scaled_size[1]) // 2,
    )
    return scaled_size, offset


def draw_camera_background(surface: pygame.Surface, frame: TrackingFrame | None) -> None:
    surface.fill(BACKGROUND_COLOR)
    if frame is None or frame.image_rgb is None:
        font = pygame.font.Font(None, 28)
        label = font.render("Camera unavailable — mouse mode is active", True, MUTED_TEXT_COLOR)
        surface.blit(label, label.get_rect(center=surface.get_rect().center))
        return
    image_height, image_width = frame.image_rgb.shape[:2]
    scaled_size, offset = camera_cover_layout((image_width, image_height), surface.get_size())
    camera_surface = pygame.surfarray.make_surface(frame.image_rgb.swapaxes(0, 1))
    camera_surface = pygame.transform.smoothscale(camera_surface, scaled_size)
    surface.blit(camera_surface, offset)


def map_fingertip_to_screen(
    fingertip: tuple[float, float],
    frame: TrackingFrame,
    surface_size: tuple[int, int],
) -> tuple[int, int]:
    if frame.image_rgb is None:
        return 0, 0
    image_height, image_width = frame.image_rgb.shape[:2]
    scaled_size, offset = camera_cover_layout((image_width, image_height), surface_size)
    x = round(offset[0] + fingertip[0] * scaled_size[0])
    y = round(offset[1] + fingertip[1] * scaled_size[1])
    return (
        min(surface_size[0] - 1, max(0, x)),
        min(surface_size[1] - 1, max(0, y)),
    )


def draw_cursor(
    surface: pygame.Surface,
    position: tuple[int, int] | None,
    active: bool,
) -> None:
    if position is None:
        return
    color = (247, 247, 250) if active else (115, 123, 138)
    pygame.draw.circle(surface, (16, 19, 25), position, 14)
    pygame.draw.circle(surface, color, position, 10, width=3)
    if not active:
        pygame.draw.line(surface, color, (position[0] - 6, position[1] - 6), (position[0] + 6, position[1] + 6), 2)
        pygame.draw.line(surface, color, (position[0] + 6, position[1] - 6), (position[0] - 6, position[1] + 6), 2)


def create_tracker(camera_index: int) -> tuple[HandTracker | None, str]:
    try:
        return HandTracker(camera_index), "connected"
    except HandTrackerError as error:
        print(f"camera warning: {error}", file=sys.stderr)
        return None, str(error)


def run() -> int:
    arguments = parse_arguments()
    pygame.init()
    pygame.display.set_caption("Hand Chord Wheel")
    window = pygame.display.set_mode(WINDOW_SIZE, pygame.RESIZABLE)
    clock = pygame.time.Clock()

    chords = list(CHORDS)
    wheel = ChordWheel(chords)
    editor = ChordEditor()
    hover = HoverSelection()
    all_notes = (
        note
        for chord in (*CHORD_CATALOG, *CHORDS)
        for note in chord.notes
    )
    synthesizer = ChordSynthesizer(all_notes)
    try:
        synthesizer.start()
        audio_status = "ready"
        audio_available = True
    except AudioUnavailableError as error:
        print(f"audio warning: {error}", file=sys.stderr)
        audio_status = str(error)
        audio_available = False

    tracker = None
    camera_status = "disabled in mouse mode"
    mode = "mouse" if arguments.mouse else "hand"
    if mode == "hand":
        tracker, camera_status = create_tracker(arguments.camera_index)
        if tracker is None:
            mode = "mouse"

    tracking_frame: TrackingFrame | None = None
    last_hand_position: tuple[int, int] | None = None
    hand_detected = False
    running = True

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
                continue

            editor_was_active = editor.is_editing()
            action = editor.handle_event(event, chords)
            if action is not None:
                apply_editor_action(action, chords)
                hover = HoverSelection()
                if audio_available:
                    synthesizer.stop()
                continue

            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                if not editor_was_active:
                    running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_m and not editor.is_editing():
                if mode == "hand":
                    mode = "mouse"
                else:
                    if tracker is None:
                        tracker, camera_status = create_tracker(arguments.camera_index)
                    if tracker is not None:
                        mode = "hand"

        width = max(window.get_width(), MINIMUM_WINDOW_SIZE[0])
        height = max(window.get_height(), MINIMUM_WINDOW_SIZE[1])
        if (width, height) != window.get_size():
            window = pygame.display.set_mode((width, height), pygame.RESIZABLE)

        if tracker is not None:
            try:
                tracking_frame = tracker.read()
                camera_status = "connected" if tracking_frame.image_rgb is not None else "frame unavailable"
            except HandTrackerError as error:
                camera_status = str(error)
                print(f"camera warning: {error}", file=sys.stderr)
                tracker.close()
                tracker = None
                mode = "mouse"

        hand_detected = bool(tracking_frame and tracking_frame.fingertip)
        if hand_detected and tracking_frame is not None and tracking_frame.fingertip is not None:
            last_hand_position = map_fingertip_to_screen(
                tracking_frame.fingertip,
                tracking_frame,
                window.get_size(),
            )

        cursor_active = mode == "mouse" or hand_detected
        cursor_position = pygame.mouse.get_pos() if mode == "mouse" else last_hand_position
        hovered_section = (
            wheel.section_at(cursor_position, window.get_size())
            if cursor_active and cursor_position is not None
            else None
        )
        active_section, selection_changed = hover.update(hovered_section, pygame.time.get_ticks())
        if selection_changed and audio_available:
            if active_section is None:
                synthesizer.stop()
            else:
                synthesizer.play(chords[active_section].notes)

        draw_camera_background(window, tracking_frame)
        wheel.draw(window, active_section)
        current_chord = chords[active_section].name if active_section is not None else "none"
        draw_status(window, mode, camera_status, hand_detected, current_chord, audio_status)
        editor.draw(window, chords)
        draw_cursor(window, cursor_position, cursor_active)
        pygame.display.flip()
        clock.tick(TARGET_FPS)

    if tracker is not None:
        tracker.close()
    try:
        synthesizer.close()
    except AudioUnavailableError as error:
        print(f"audio shutdown warning: {error}", file=sys.stderr)
    pygame.quit()
    return 0


def apply_editor_action(action: EditorAction, chords: list[Chord]) -> None:
    if action.kind == "add" and action.chord is not None:
        chords.append(action.chord)
    elif action.kind == "remove" and action.index is not None:
        if 0 <= action.index < len(chords):
            chords.pop(action.index)


if __name__ == "__main__":
    raise SystemExit(run())
