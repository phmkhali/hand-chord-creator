import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const fingerJoints = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
] as const;

const jointAngle = (a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) => {
  const first = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const second = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = first.x * second.x + first.y * second.y + first.z * second.z;
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);
  if (!firstLength || !secondLength) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / (firstLength * secondLength)))) * (180 / Math.PI);
};

export const isClosedFist = (landmarks: NormalizedLandmark[]) =>
  fingerJoints.filter(([mcp, pip, tip]) => jointAngle(landmarks[mcp], landmarks[pip], landmarks[tip]) < 125).length >= 3;
