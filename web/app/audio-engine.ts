import type { Chord } from "./chords";

type Voice = {
  gain: GainNode;
  oscillators: OscillatorNode[];
};

const noteOffsets: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const frequencyForNote = (note: string) => {
  const pitch = note.slice(0, -1);
  const octave = Number(note.slice(-1));
  const midiNumber = 12 * (octave + 1) + noteOffsets[pitch];
  return 440 * 2 ** ((midiNumber - 69) / 12);
};

export class ChordAudioEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private voices: Voice[] = [];
  private chordId: string | null = null;

  async start() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.output = this.context.createGain();
      this.output.gain.value = 0.72;
      this.output.connect(this.context.destination);
    }
    await this.context.resume();
  }

  play(chord: Chord) {
    if (!this.context || !this.output || this.chordId === chord.id) return;
    this.releaseVoices(0.09);
    this.chordId = chord.id;
    const now = this.context.currentTime;
    const chordGain = 0.15 / Math.sqrt(chord.notes.length);

    this.voices = chord.notes.map((note) => {
      const gain = this.context!.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(chordGain, now + 0.024);
      gain.connect(this.output!);

      const fundamental = this.context!.createOscillator();
      fundamental.type = "sine";
      fundamental.frequency.value = frequencyForNote(note);
      fundamental.connect(gain);

      const warmth = this.context!.createOscillator();
      const warmthGain = this.context!.createGain();
      warmth.type = "triangle";
      warmth.frequency.value = frequencyForNote(note);
      warmth.detune.value = 4;
      warmthGain.gain.value = 0.12;
      warmth.connect(warmthGain).connect(gain);

      fundamental.start(now);
      warmth.start(now);
      return { gain, oscillators: [fundamental, warmth] };
    });
  }

  stop() {
    if (!this.chordId) return;
    this.chordId = null;
    this.releaseVoices(0.11);
  }

  async close() {
    this.stop();
    if (this.context) await this.context.close();
    this.context = null;
    this.output = null;
  }

  private releaseVoices(duration: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, duration / 4);
      for (const oscillator of voice.oscillators) oscillator.stop(now + duration);
    }
    this.voices = [];
  }
}
