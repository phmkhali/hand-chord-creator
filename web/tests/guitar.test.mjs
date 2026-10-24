import assert from "node:assert/strict";
import test from "node:test";
import { GuitarStrumTracker, guitarGeometry, guitarVoicing } from "../app/guitar.ts";

const width = 1200;
const height = 800;
const { left, right, strings } = guitarGeometry(width, height);
const x = (left + right) / 2;
const sweep = (positions, times = positions.map((_, index) => index * 50)) => {
  const tracker = new GuitarStrumTracker();
  return positions.flatMap((y, index) => tracker.update({ x, y }, times[index], width, height));
};

test("downward strokes cross strings from top to bottom", () => {
  const hits = sweep([strings[0] - 20, strings[2] + 10, strings[5] + 20]);
  assert.deepEqual(hits.map(({ index }) => index), [0, 1, 2, 3, 4, 5]);
});

test("upward strokes cross strings from bottom to top", () => {
  const hits = sweep([strings[5] + 20, strings[3] - 10, strings[0] - 20]);
  assert.deepEqual(hits.map(({ index }) => index), [5, 4, 3, 2, 1, 0]);
});

test("partial strokes play only the crossed strings", () => {
  assert.deepEqual(sweep([strings[1] + 10, strings[3] + 10]).map(({ index }) => index), [2, 3]);
});

test("motion outside the string area makes no sound", () => {
  const tracker = new GuitarStrumTracker();
  tracker.update({ x: left - 20, y: strings[0] - 10 }, 0, width, height);
  assert.deepEqual(tracker.update({ x: left - 20, y: strings[2] + 10 }, 50, width, height), []);
});

test("diagonal strokes use the position at each string crossing", () => {
  const tracker = new GuitarStrumTracker();
  tracker.update({ x: left - 140, y: strings[0] - 10 }, 0, width, height);
  const hits = tracker.update({ x: left + 60, y: strings[2] + 10 }, 50, width, height);
  assert.deepEqual(hits.map(({ index }) => index), [2]);
});

test("jitter and immediate recrossings do not retrigger a string", () => {
  const tracker = new GuitarStrumTracker();
  tracker.update({ x, y: strings[2] - 10 }, 0, width, height);
  assert.equal(tracker.update({ x, y: strings[2] + 10 }, 50, width, height).length, 1);
  assert.equal(tracker.update({ x, y: strings[2] - 10 }, 100, width, height).length, 0);
  assert.equal(tracker.update({ x, y: strings[2] + 10 }, 150, width, height).length, 1);
  assert.deepEqual(sweep([strings[2] - 1, strings[2] + 1]), []);
});

test("hand loss, long gaps, and large jumps do not cause phantom strums", () => {
  const tracker = new GuitarStrumTracker();
  tracker.update({ x, y: strings[0] - 10 }, 0, width, height);
  tracker.update(null, 50, width, height);
  assert.deepEqual(tracker.update({ x, y: strings[3] }, 100, width, height), []);
  assert.deepEqual(tracker.update({ x, y: strings[0] }, 400, width, height), []);
  assert.deepEqual(tracker.update({ x, y: height }, 450, width, height), []);
});

test("each guitar voicing has six ascending chord tones and retains extensions", () => {
  const frequencyToMidi = (frequency) => Math.round(69 + 12 * Math.log2(frequency / 440));
  for (const notes of [["C4", "E4", "G4"], ["C4", "E4", "G4", "D5"], ["C4", "E4", "G4", "A#4", "D5", "F5", "A5"]]) {
    const midi = guitarVoicing({ notes }).map(frequencyToMidi);
    assert.equal(midi.length, 6);
    assert.ok(midi.every((note, index) => index === 0 || note > midi[index - 1]));
    assert.equal(midi[0] % 12, 0);
    const expectedPitches = notes.length === 7 ? [0, 4, 10, 2, 5, 9] : notes.length === 4 ? [0, 4, 7, 2] : [0, 4, 7];
    assert.deepEqual([...new Set(midi.map((note) => note % 12))].sort((a, b) => a - b), expectedPitches.sort((a, b) => a - b));
  }
});
