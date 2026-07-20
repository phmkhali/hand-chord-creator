export type Chord = {
  id: string;
  label: string;
  name: string;
  notes: string[];
  hue: number;
};

const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const qualities = [
  { id: "major", name: "major", suffix: "", intervals: [0, 4, 7] },
  { id: "minor", name: "minor", suffix: "m", intervals: [0, 3, 7] },
  { id: "diminished", name: "diminished", suffix: "dim", intervals: [0, 3, 6] },
] as const;

const noteName = (midiNumber: number) =>
  `${pitchNames[midiNumber % 12]}${Math.floor(midiNumber / 12) - 1}`;

export const chordCatalog: Chord[] = pitchNames.flatMap((root, rootIndex) =>
  qualities.map((quality, qualityIndex) => ({
    id: `${root.toLowerCase().replace("#", "s")}-${quality.id}`,
    label: `${root}${quality.suffix}`,
    name: `${root} ${quality.name}`,
    notes: quality.intervals.map((interval) => noteName(60 + rootIndex + interval)),
    hue: (rootIndex * 30 + qualityIndex * 7) % 360,
  })),
);

const catalogById = new Map(chordCatalog.map((chord) => [chord.id, chord]));

export const highCChord: Chord = {
  id: "c-major-high",
  label: "C↑",
  name: "C major high",
  notes: ["C5", "E5", "G5"],
  hue: 278,
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
  let result = value.trim().toLowerCase().replaceAll("♯", "#").replace(/\s+/g, " ");
  for (const [flat, sharp] of Object.entries(flatRoots)) {
    if (result === flat || result.startsWith(`${flat} `) || result.startsWith(`${flat}m`) || result.startsWith(`${flat}dim`)) {
      result = sharp + result.slice(flat.length);
      break;
    }
  }
  return result;
};

const aliases = (chord: Chord) => {
  const [root, quality] = chord.name.toLowerCase().split(" ");
  const suffixes = quality === "major"
    ? ["", "maj", "major"]
    : quality === "minor"
      ? ["m", "min", "minor"]
      : ["dim", "diminished"];
  return new Set([
    normalize(chord.name),
    normalize(chord.label),
    ...suffixes.flatMap((suffix) => [normalize(`${root}${suffix}`), normalize(`${root} ${suffix}`)]),
  ]);
};

export const findChord = (query: string) => {
  const normalized = normalize(query);
  return chordCatalog.find((chord) => aliases(chord).has(normalized));
};

export const searchChords = (query: string, limit = 5) => {
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

export const restoreChords = (ids: string[]) => {
  const allChords = new Map([...chordCatalog, highCChord].map((chord) => [chord.id, chord]));
  return ids.map((id) => allChords.get(id)).filter((chord): chord is Chord => Boolean(chord));
};
