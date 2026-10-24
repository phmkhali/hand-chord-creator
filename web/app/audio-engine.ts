import type { Chord } from "./chords";
import { guitarVoicing, type StringHit } from "./guitar";

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
  private guitarSources = new Set<AudioBufferSourceNode>();
  private guitarBuffers = new Map<number, AudioBuffer>();

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

  strum(chord: Chord, hits: StringHit[]) {
    if (!this.context || !this.output || !hits.length) return;
    const context = this.context;
    const frequencies = guitarVoicing(chord);
    hits.forEach((hit, order) => {
      const frequency = frequencies[hit.index];
      let buffer = this.guitarBuffers.get(frequency);
      if (!buffer) {
        const duration = 3;
        buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
        const samples = buffer.getChannelData(0);
        const period = Math.round(context.sampleRate / frequency);
        const delay = new Float32Array(period);
        for (let index = 0; index < period; index++) delay[index] = Math.random() * 2 - 1;
        // a damped delay loop models a softly plucked acoustic string.
        for (let index = 0; index < samples.length; index++) {
          const slot = index % period;
          const value = delay[slot];
          delay[slot] = (value + delay[(slot + 1) % period]) * 0.497;
          samples[index] = value * Math.min(1, index / (context.sampleRate * 0.003));
        }
        this.guitarBuffers.set(frequency, buffer);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2400 + hit.velocity * 1400;
      filter.Q.value = 0.5;
      const gain = context.createGain();
      const start = context.currentTime + order * 0.008;
      gain.gain.setValueAtTime(0.32 * (0.45 + hit.velocity * 0.55), start);
      gain.gain.setTargetAtTime(0.0001, start + 0.15, 0.55);
      source.connect(filter).connect(gain).connect(this.output!);
      this.guitarSources.add(source);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        this.guitarSources.delete(source);
      };
      source.start(start);
    });
  }

  stop() {
    for (const source of this.guitarSources) source.stop();
    this.guitarSources.clear();
    if (!this.chordId) return;
    this.chordId = null;
    this.releaseVoices(0.11);
  }

  async close() {
    this.stop();
    if (this.context) await this.context.close();
    this.context = null;
    this.output = null;
    this.guitarBuffers.clear();
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
