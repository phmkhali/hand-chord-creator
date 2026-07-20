import math
import unittest

from config import CHORDS, find_chord, suggest_chords
from synthesizer import note_frequency
from wheel_logic import HoverSelection, section_at_point


class NoteFrequencyTests(unittest.TestCase):
    def test_a4_is_440_hz(self) -> None:
        self.assertAlmostEqual(note_frequency("A4"), 440.0)

    def test_octave_doubles_frequency(self) -> None:
        self.assertAlmostEqual(note_frequency("C5"), note_frequency("C4") * 2.0)

    def test_invalid_note_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            note_frequency("H4")


class ChordConfigurationTests(unittest.TestCase):
    def test_default_chords_match_specification(self) -> None:
        self.assertEqual(
            [(chord.name, chord.notes) for chord in CHORDS],
            [
                ("C major", ("C4", "E4", "G4")),
                ("D minor", ("D4", "F4", "A4")),
                ("E minor", ("E4", "G4", "B4")),
                ("F major", ("F4", "A4", "C5")),
                ("G major", ("G4", "B4", "D5")),
                ("A minor", ("A4", "C5", "E5")),
                ("B diminished", ("B4", "D5", "F5")),
                ("C major high", ("C5", "E5", "G5")),
            ],
        )

    def test_common_chord_symbols_resolve_to_notes(self) -> None:
        self.assertEqual(find_chord("C").notes, ("C4", "E4", "G4"))
        self.assertEqual(find_chord("F#m").notes, ("F#4", "A4", "C#5"))
        self.assertEqual(find_chord("Bb dim").notes, ("A#4", "C#5", "E5"))

    def test_chord_search_returns_matching_choices(self) -> None:
        names = [chord.name for chord in suggest_chords("Eb", limit=3)]
        self.assertEqual(names, ["D# major", "D# minor", "D# diminished"])


class WheelGeometryTests(unittest.TestCase):
    def test_top_is_first_section(self) -> None:
        self.assertEqual(section_at_point((100, 50), (100, 100), 75, 8), 0)

    def test_right_is_third_section(self) -> None:
        self.assertEqual(section_at_point((150, 100), (100, 100), 75, 8), 2)

    def test_outside_circle_has_no_section(self) -> None:
        self.assertIsNone(section_at_point((200, 200), (100, 100), 75, 8))

    def test_empty_wheel_has_no_section(self) -> None:
        self.assertIsNone(section_at_point((100, 100), (100, 100), 75, 0))

    def test_all_section_centers_are_selectable(self) -> None:
        for index in range(8):
            angle = index * math.tau / 8 - math.pi / 2 + math.tau / 16
            point = (100 + math.cos(angle) * 50, 100 + math.sin(angle) * 50)
            self.assertEqual(section_at_point(point, (100, 100), 75, 8), index)


class HoverSelectionTests(unittest.TestCase):
    def test_selection_waits_for_delay(self) -> None:
        hover = HoverSelection(delay_ms=150)
        self.assertEqual(hover.update(3, 1_000), (None, False))
        self.assertEqual(hover.update(3, 1_149), (None, False))
        self.assertEqual(hover.update(3, 1_150), (3, True))

    def test_leaving_wheel_clears_selection(self) -> None:
        hover = HoverSelection(delay_ms=0)
        hover.update(2, 10)
        hover.update(2, 10)
        self.assertEqual(hover.update(None, 11), (None, True))


if __name__ == "__main__":
    unittest.main()
