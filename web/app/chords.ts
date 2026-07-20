export type Chord = {
  id: string;
  label: string;
  name: string;
  notes: string[];
  hue: number;
  searchTerms: string[];
};

const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const qualities = [
  { id: "major", name: "major", suffix: "", aliases: ["", "maj", "major"], intervals: [0, 4, 7] },
  { id: "minor", name: "minor", suffix: "m", aliases: ["m", "min", "minor"], intervals: [0, 3, 7] },
  { id: "diminished", name: "diminished", suffix: "dim", aliases: ["dim", "diminished", "°"], intervals: [0, 3, 6] },
  { id: "augmented", name: "augmented", suffix: "aug", aliases: ["aug", "augmented", "+"], intervals: [0, 4, 8] },
  { id: "sus2", name: "suspended 2", suffix: "sus2", aliases: ["sus2", "suspended2"], intervals: [0, 2, 7] },
  { id: "sus4", name: "suspended 4", suffix: "sus4", aliases: ["sus", "sus4", "suspended4"], intervals: [0, 5, 7] },
  { id: "sixth", name: "sixth", suffix: "6", aliases: ["6", "major6", "sixth"], intervals: [0, 4, 7, 9] },
  { id: "minor-sixth", name: "minor sixth", suffix: "m6", aliases: ["m6", "minor6"], intervals: [0, 3, 7, 9] },
  { id: "dominant-seventh", name: "dominant seventh", suffix: "7", aliases: ["7", "dom7", "dominant7"], intervals: [0, 4, 7, 10] },
  { id: "major-seventh", name: "major seventh", suffix: "maj7", aliases: ["maj7", "major7", "Δ7"], intervals: [0, 4, 7, 11] },
  { id: "minor-seventh", name: "minor seventh", suffix: "m7", aliases: ["m7", "min7", "minor7"], intervals: [0, 3, 7, 10] },
  { id: "minor-major-seventh", name: "minor-major seventh", suffix: "mMaj7", aliases: ["mmaj7", "minmaj7", "minor major7"], intervals: [0, 3, 7, 11] },
  { id: "diminished-seventh", name: "diminished seventh", suffix: "dim7", aliases: ["dim7", "°7", "diminished7"], intervals: [0, 3, 6, 9] },
  { id: "half-diminished", name: "half-diminished seventh", suffix: "m7♭5", aliases: ["m7b5", "ø7", "halfdim7", "half diminished7"], intervals: [0, 3, 6, 10] },
  { id: "add-ninth", name: "add ninth", suffix: "add9", aliases: ["add9", "add ninth"], intervals: [0, 4, 7, 14] },
  { id: "minor-add-ninth", name: "minor add ninth", suffix: "madd9", aliases: ["madd9", "minor add9"], intervals: [0, 3, 7, 14] },
  { id: "dominant-ninth", name: "dominant ninth", suffix: "9", aliases: ["9", "dom9", "dominant9"], intervals: [0, 4, 7, 10, 14] },
  { id: "major-ninth", name: "major ninth", suffix: "maj9", aliases: ["maj9", "major9"], intervals: [0, 4, 7, 11, 14] },
  { id: "minor-ninth", name: "minor ninth", suffix: "m9", aliases: ["m9", "min9", "minor9"], intervals: [0, 3, 7, 10, 14] },
  { id: "dominant-eleventh", name: "dominant eleventh", suffix: "11", aliases: ["11", "dom11", "dominant11"], intervals: [0, 4, 7, 10, 14, 17] },
  { id: "dominant-thirteenth", name: "dominant thirteenth", suffix: "13", aliases: ["13", "dom13", "dominant13"], intervals: [0, 4, 7, 10, 14, 21] },
] as const;

const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

const noteName = (midiNumber: number) =>
  `${pitchNames[positiveModulo(midiNumber, 12)]}${Math.floor(midiNumber / 12) - 1}`;

export const chordCatalog: Chord[] = pitchNames.flatMap((root, rootIndex) =>
  qualities.map((quality, qualityIndex) => ({
    id: `${root.toLowerCase().replace("#", "s")}-${quality.id}`,
    label: `${root}${quality.suffix}`,
    name: `${root} ${quality.name}`,
    notes: quality.intervals.map((interval) => noteName(60 + rootIndex + interval)),
    hue: (rootIndex * 30 + qualityIndex * 2.5) % 360,
    searchTerms: quality.aliases.flatMap((alias) => [`${root}${alias}`, `${root} ${alias}`]),
  })),
);

const catalogById = new Map(chordCatalog.map((chord) => [chord.id, chord]));

export const highCChord: Chord = {
  id: "c-major-high",
  label: "C↑",
  name: "C major high",
  notes: ["C5", "E5", "G5"],
  hue: 278,
  searchTerms: ["C high", "C5", "C major high"],
};

export const defaultChords: Chord[] = [
  catalogById.get("c-major")!,
  catalogById.get("d-minor")!,
  catalogById.get("e-minor")!,
  catalogById.get("f-major")!,
  catalogById.get("g-major")!,
  catalogById.get("a-minor")!,
  catalogById.get("b-diminished")!,
  highCChord,
];

const flatRoots: Record<string, string> = {
  db: "c#",
  eb: "d#",
  gb: "f#",
  ab: "g#",
  bb: "a#",
};

const normalize = (value: string) => {
  let result = value
    .trim()
    .toLowerCase()
    .replaceAll("♯", "#")
    .replaceAll("♭", "b")
    .replace(/\s+/g, " ");
  for (const [flat, sharp] of Object.entries(flatRoots)) {
    if (result.startsWith(flat)) {
      result = sharp + result.slice(flat.length);
      break;
    }
  }
  return result;
};

const aliases = (chord: Chord) => new Set([
  normalize(chord.name),
  normalize(chord.label),
  ...chord.searchTerms.map(normalize),
]);

export const findChord = (query: string) => {
  const normalized = normalize(query);
  return chordCatalog.find((chord) => aliases(chord).has(normalized));
};

export const searchChords = (query: string, limit = 7) => {
  const normalized = normalize(query);
  if (!normalized) return chordCatalog.slice(0, limit);
  return chordCatalog
    .map((chord) => ({
      chord,
      exact: aliases(chord).has(normalized),
      starts: [...aliases(chord)].some((alias) => alias.startsWith(normalized)),
      contains: [...aliases(chord)].some((alias) => alias.includes(normalized)),
    }))
    .filter((entry) => entry.exact || entry.starts || entry.contains)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.starts) - Number(a.starts))
    .slice(0, limit)
    .map((entry) => entry.chord);
};

export const transposeChord = (chord: Chord, semitones: number): Chord => {
  if (!semitones) return chord;
  const firstPitch = chord.notes[0].slice(0, -1);
  const firstOctave = Number(chord.notes[0].slice(-1));
  const firstMidi = 12 * (firstOctave + 1) + pitchNames.indexOf(firstPitch);
  const transposedRoot = pitchNames[positiveModulo(firstMidi + semitones, 12)];
  return {
    ...chord,
    label: chord.label.replace(firstPitch, transposedRoot),
    name: chord.name.replace(firstPitch, transposedRoot),
    notes: chord.notes.map((note) => {
      const pitch = note.slice(0, -1);
      const octave = Number(note.slice(-1));
      const midiNumber = 12 * (octave + 1) + pitchNames.indexOf(pitch);
      return noteName(midiNumber + semitones);
    }),
    hue: positiveModulo(chord.hue + semitones * 30, 360),
  };
};

export const restoreChords = (ids: string[]) => {
  const allChords = new Map([...chordCatalog, highCChord].map((chord) => [chord.id, chord]));
  return ids.map((id) => allChords.get(id)).filter((chord): chord is Chord => Boolean(chord));
};
