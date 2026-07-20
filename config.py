import colorsys
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Chord:
    name: str
    notes: tuple[str, ...]
    color: tuple[int, int, int]


CHORDS = (
    Chord("C major", ("C4", "E4", "G4"), (71, 121, 183)),
    Chord("D minor", ("D4", "F4", "A4"), (81, 149, 165)),
    Chord("E minor", ("E4", "G4", "B4"), (91, 166, 137)),
    Chord("F major", ("F4", "A4", "C5"), (133, 176, 112)),
    Chord("G major", ("G4", "B4", "D5"), (204, 174, 89)),
    Chord("A minor", ("A4", "C5", "E5"), (210, 139, 92)),
    Chord("B diminished", ("B4", "D5", "F5"), (183, 104, 116)),
    Chord("C major high", ("C5", "E5", "G5"), (137, 104, 178)),
)

PITCH_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
ROOT_ALIASES = {
    "db": "c#",
    "eb": "d#",
    "gb": "f#",
    "ab": "g#",
    "bb": "a#",
}


def _note_name(midi_number: int) -> str:
    return f"{PITCH_NAMES[midi_number % 12]}{midi_number // 12 - 1}"


def _chord_color(index: int, count: int) -> tuple[int, int, int]:
    red, green, blue = colorsys.hls_to_rgb(index / count, 0.58, 0.48)
    return round(red * 255), round(green * 255), round(blue * 255)


def _build_chord_catalog() -> tuple[Chord, ...]:
    qualities = (
        ("major", (0, 4, 7)),
        ("minor", (0, 3, 7)),
        ("diminished", (0, 3, 6)),
    )
    catalog = []
    chord_count = len(PITCH_NAMES) * len(qualities)
    for root_index, root in enumerate(PITCH_NAMES):
        root_midi = 60 + root_index
        for quality_index, (quality, intervals) in enumerate(qualities):
            color_index = root_index * len(qualities) + quality_index
            notes = tuple(_note_name(root_midi + interval) for interval in intervals)
            catalog.append(
                Chord(
                    f"{root} {quality}",
                    notes,
                    _chord_color(color_index, chord_count),
                )
            )
    return tuple(catalog)


CHORD_CATALOG = _build_chord_catalog()


def normalize_chord_query(query: str) -> str:
    normalized = " ".join(query.strip().lower().replace("♯", "#").split())
    for flat, sharp in ROOT_ALIASES.items():
        if normalized == flat or normalized.startswith(f"{flat} "):
            normalized = sharp + normalized[len(flat) :]
            break
        if normalized.startswith(flat) and normalized[len(flat) :] in {"m", "min", "dim"}:
            normalized = sharp + normalized[len(flat) :]
            break
    return normalized


def chord_aliases(chord: Chord) -> tuple[str, ...]:
    root, quality = chord.name.lower().split(maxsplit=1)
    suffixes = {
        "major": ("", "maj", "major"),
        "minor": ("m", "min", "minor"),
        "diminished": ("dim", "diminished"),
    }[quality]
    aliases = {normalize_chord_query(chord.name)}
    for suffix in suffixes:
        aliases.add(normalize_chord_query(f"{root}{suffix}"))
        aliases.add(normalize_chord_query(f"{root} {suffix}"))
    return tuple(aliases)


def find_chord(query: str) -> Chord | None:
    normalized = normalize_chord_query(query)
    if not normalized:
        return None
    return next(
        (chord for chord in CHORD_CATALOG if normalized in chord_aliases(chord)),
        None,
    )


def suggest_chords(query: str, limit: int = 5) -> tuple[Chord, ...]:
    normalized = normalize_chord_query(query)
    if not normalized:
        return CHORD_CATALOG[:limit]
    starts_with = []
    contains = []
    for chord in CHORD_CATALOG:
        searchable = (normalize_chord_query(chord.name), *chord_aliases(chord))
        if any(value.startswith(normalized) for value in searchable):
            starts_with.append(chord)
        elif any(normalized in value for value in searchable):
            contains.append(chord)
    return tuple((starts_with + contains)[:limit])

WINDOW_SIZE = (1100, 760)
MINIMUM_WINDOW_SIZE = (720, 520)
BACKGROUND_COLOR = (19, 23, 31)
TEXT_COLOR = (236, 239, 244)
MUTED_TEXT_COLOR = (160, 169, 184)
HOVER_DELAY_MS = 0
CURSOR_SMOOTHING = 0.65
TARGET_FPS = 60

AUDIO_SAMPLE_RATE = 48_000
AUDIO_BLOCK_SIZE = 256
AUDIO_VOLUME = 0.16
ATTACK_SECONDS = 0.025
RELEASE_SECONDS = 0.12
CROSSFADE_SECONDS = 0.12
