import type { Chord } from "./chords";

export type Point = { x: number; y: number };
export type StringHit = { index: number; fraction: number; velocity: number };
export const STRING_COUNT = 6;
const MAX_TRACKING_GAP_MS = 180;
const STRING_RETRIGGER_MS = 85;
const MOVEMENT_THRESHOLD_PX = 5;

export const guitarGeometry = (width: number, height: number) => {
  const top = height * 0.26;
  const spacing = Math.min(76, height * 0.092);
  return {
    left: width * 0.59,
    right: width * 0.93,
    strings: Array.from({ length: STRING_COUNT }, (_, index) => top + spacing * index),
  };
};

export class GuitarStrumTracker {
  private previous: (Point & { timestamp: number }) | null = null;
  private lastPlucked = Array<number>(STRING_COUNT).fill(-Infinity);

  reset() {
    this.previous = null;
    this.lastPlucked.fill(-Infinity);
  }

  update(point: Point | null, timestamp: number, width: number, height: number): StringHit[] {
    if (!point) {
      this.reset();
      return [];
    }
    const previous = this.previous;
    if (!previous || timestamp - previous.timestamp > MAX_TRACKING_GAP_MS) {
      this.previous = { ...point, timestamp };
      return [];
    }
    const deltaY = point.y - previous.y;
    // retain the anchor until movement exceeds tracking jitter.
    if (Math.abs(deltaY) < MOVEMENT_THRESHOLD_PX) return [];
    this.previous = { ...point, timestamp };
    const elapsed = timestamp - previous.timestamp;
    if (elapsed <= 0 || Math.abs(deltaY) > height * 0.45) return [];
    const geometry = guitarGeometry(width, height);
    const hits: StringHit[] = [];
    geometry.strings.forEach((y, index) => {
      const fraction = (y - previous.y) / deltaY;
      const x = previous.x + (point.x - previous.x) * fraction;
      if (fraction <= 0 || fraction > 1 || x < geometry.left || x > geometry.right) return;
      if (timestamp - this.lastPlucked[index] < STRING_RETRIGGER_MS) return;
      this.lastPlucked[index] = timestamp;
      hits.push({ index, fraction, velocity: Math.min(1, Math.max(0.2, Math.abs(deltaY) / elapsed / 2)) });
    });
    return hits.sort((first, second) => first.fraction - second.fraction);
  }
}

const pitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const guitarVoicing = (chord: Chord): number[] => {
  // omit the fifth when a seven-note extension needs to fit six strings.
  const chordNotes = chord.notes.length > STRING_COUNT
    ? chord.notes.filter((_, index) => index !== 2)
    : chord.notes;
  const notes = chordNotes.map((note) =>
    12 * (Number(note.slice(-1)) + 1) + pitches.indexOf(note.slice(0, -1)) - 12,
  );
  // spread the chord across six strings, retaining extensions in larger chords.
  return Array.from({ length: STRING_COUNT }, (_, index) => {
    const noteIndex = index % notes.length;
    const octave = Math.floor(index / notes.length);
    return notes[noteIndex] + octave * 12;
  }).sort((first, second) => first - second).map((midi) => 440 * 2 ** ((midi - 69) / 12));
};
