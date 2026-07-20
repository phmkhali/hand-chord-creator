from __future__ import annotations

import math
import threading
from collections.abc import Iterable

import numpy as np

from config import (
    ATTACK_SECONDS,
    AUDIO_BLOCK_SIZE,
    AUDIO_SAMPLE_RATE,
    AUDIO_VOLUME,
    CROSSFADE_SECONDS,
    RELEASE_SECONDS,
)

try:
    import sounddevice as sd
except (ImportError, OSError) as error:
    sd = None
    SOUNDDEVICE_IMPORT_ERROR = error
else:
    SOUNDDEVICE_IMPORT_ERROR = None


class AudioUnavailableError(RuntimeError):
    pass


NOTE_OFFSETS = {
    "C": 0,
    "C#": 1,
    "DB": 1,
    "D": 2,
    "D#": 3,
    "EB": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "GB": 6,
    "G": 7,
    "G#": 8,
    "AB": 8,
    "A": 9,
    "A#": 10,
    "BB": 10,
    "B": 11,
}


def note_frequency(note: str) -> float:
    normalized = note.strip().upper()
    if len(normalized) < 2:
        raise ValueError(f"invalid note: {note!r}")

    pitch_name = normalized[:-1]
    try:
        octave = int(normalized[-1])
        semitone = NOTE_OFFSETS[pitch_name]
    except (ValueError, KeyError) as error:
        raise ValueError(f"invalid note: {note!r}") from error

    midi_number = 12 * (octave + 1) + semitone
    return 440.0 * 2.0 ** ((midi_number - 69) / 12.0)


class ChordSynthesizer:
    """A callback-driven polyphonic synthesizer with continuous voice phases."""

    def __init__(
        self,
        available_notes: Iterable[str],
        sample_rate: int = AUDIO_SAMPLE_RATE,
        block_size: int = AUDIO_BLOCK_SIZE,
        volume: float = AUDIO_VOLUME,
    ) -> None:
        self.sample_rate = sample_rate
        self.block_size = block_size
        self.volume = volume
        self._frequencies = {
            note: note_frequency(note) for note in dict.fromkeys(available_notes)
        }
        self._phases = {note: 0.0 for note in self._frequencies}
        self._gains = {note: 0.0 for note in self._frequencies}
        self._target_gains = dict(self._gains)
        self._ramp_frames_remaining = 0
        self._pending_command: tuple[tuple[str, ...], float] | None = None
        self._command_lock = threading.Lock()
        self._stream = None

    @property
    def is_running(self) -> bool:
        return self._stream is not None and self._stream.active

    def start(self) -> None:
        if sd is None:
            detail = f": {SOUNDDEVICE_IMPORT_ERROR}" if SOUNDDEVICE_IMPORT_ERROR else ""
            raise AudioUnavailableError(f"sounddevice could not be loaded{detail}")
        if self._stream is not None:
            return

        try:
            self._stream = sd.OutputStream(
                samplerate=self.sample_rate,
                blocksize=self.block_size,
                channels=2,
                dtype="float32",
                callback=self._audio_callback,
            )
            self._stream.start()
        except Exception as error:
            self._stream = None
            raise AudioUnavailableError(f"could not open an audio output device: {error}") from error

    def play(self, notes: Iterable[str]) -> None:
        selected_notes = tuple(notes)
        unknown_notes = set(selected_notes).difference(self._frequencies)
        if unknown_notes:
            raise ValueError(f"notes were not configured: {sorted(unknown_notes)}")
        duration = ATTACK_SECONDS if not any(self._gains.values()) else CROSSFADE_SECONDS
        self._queue_command(selected_notes, duration)

    def stop(self) -> None:
        self._queue_command((), RELEASE_SECONDS)

    def close(self) -> None:
        self.stop()
        stream = self._stream
        self._stream = None
        if stream is None:
            return
        try:
            stream.stop()
            stream.close()
        except Exception as error:
            raise AudioUnavailableError(f"could not close the audio stream cleanly: {error}") from error

    def _queue_command(self, notes: tuple[str, ...], duration: float) -> None:
        with self._command_lock:
            self._pending_command = (notes, duration)

    def _consume_command(self) -> None:
        with self._command_lock:
            command = self._pending_command
            self._pending_command = None
        if command is None:
            return

        notes, duration = command
        voice_gain = 1.0 / math.sqrt(len(notes)) if notes else 0.0
        self._target_gains = {
            note: voice_gain if note in notes else 0.0 for note in self._frequencies
        }
        self._ramp_frames_remaining = max(1, round(duration * self.sample_rate))

    def _audio_callback(self, output, frames: int, _time, status) -> None:
        if status:
            print(f"audio stream warning: {status}")

        self._consume_command()
        sample_indexes = np.arange(frames, dtype=np.float64)
        mono = np.zeros(frames, dtype=np.float64)

        for note, frequency in self._frequencies.items():
            gain = self._gains[note]
            target = self._target_gains[note]
            if self._ramp_frames_remaining > 0:
                ramp_length = min(frames, self._ramp_frames_remaining)
                ramp_end = gain + (target - gain) * ramp_length / self._ramp_frames_remaining
                envelope = np.empty(frames, dtype=np.float64)
                envelope[:ramp_length] = np.linspace(gain, ramp_end, ramp_length, endpoint=False)
                envelope[ramp_length:] = ramp_end
                self._gains[note] = ramp_end
            else:
                envelope = gain

            phase_step = 2.0 * math.pi * frequency / self.sample_rate
            phases = self._phases[note] + phase_step * sample_indexes
            waveform = np.sin(phases) + 0.16 * np.sin(2.0 * phases)
            mono += waveform * envelope
            self._phases[note] = (self._phases[note] + phase_step * frames) % (2.0 * math.pi)

        if self._ramp_frames_remaining > 0:
            self._ramp_frames_remaining = max(0, self._ramp_frames_remaining - frames)
            if self._ramp_frames_remaining == 0:
                self._gains = self._target_gains.copy()

        mono = np.tanh(mono * self.volume).astype(np.float32)
        output[:, 0] = mono
        output[:, 1] = mono
