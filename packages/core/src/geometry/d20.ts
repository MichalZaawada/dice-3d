import type { D20Value } from '../types.js';
import type { Vec3 } from '../animation/vector.js';
import { computeFaceFrames, type DieDefinition, type FaceFrame } from './dieDefinition.js';

export const D20_VALUES: readonly D20Value[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

export function isD20Value(value: unknown): value is D20Value {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
}

const RING_RADIUS = 2 / Math.sqrt(5);
const RING_HEIGHT = 1 / Math.sqrt(5);

function ringVertex(angle: number, height: number): Vec3 {
  return [RING_RADIUS * Math.cos(angle), RING_RADIUS * Math.sin(angle), height];
}

/**
 * Vertices of a regular icosahedron with circumradius 1:
 * index 0 is the top pole, 1–5 the upper ring (0°, 72°, …), 6–10 the lower
 * ring (36°, 108°, …) and 11 the bottom pole.
 */
export const D20_VERTICES: readonly Vec3[] = [
  [0, 0, 1],
  ...[0, 1, 2, 3, 4].map((i) => ringVertex((i * 2 * Math.PI) / 5, RING_HEIGHT)),
  ...[0, 1, 2, 3, 4].map((i) => ringVertex((i * 2 * Math.PI) / 5 + Math.PI / 5, -RING_HEIGHT)),
  [0, 0, -1],
];

/**
 * Durable numbering table: `[value, A, B, C]` vertex indices.
 *
 * Opposite faces sum to 21, and the five faces around every vertex sum to 52
 * or 53 (balanced layout). This table is the source of truth; never derive
 * numbering from the order produced by a geometry generator. Changing it is a
 * breaking change of the `d20-net-v1` template.
 */
const D20_FACE_TABLE: readonly (readonly [D20Value, number, number, number])[] = [
  [1, 11, 6, 10],
  [2, 0, 1, 2],
  [3, 3, 7, 8],
  [4, 0, 5, 1],
  [5, 8, 4, 3],
  [6, 9, 5, 4],
  [7, 11, 10, 9],
  [8, 11, 7, 6],
  [9, 4, 8, 9],
  [10, 7, 3, 2],
  [11, 5, 9, 10],
  [12, 6, 2, 1],
  [13, 0, 4, 5],
  [14, 0, 2, 3],
  [15, 2, 6, 7],
  [16, 1, 10, 6],
  [17, 11, 8, 7],
  [18, 10, 1, 5],
  [19, 11, 9, 8],
  [20, 0, 3, 4],
];

export const D20_DEFINITION: DieDefinition<D20Value> = {
  id: 'd20',
  values: D20_VALUES,
  vertices: D20_VERTICES,
  faces: D20_FACE_TABLE.map(([value, a, b, c]) => ({ value, vertices: [a, b, c] })),
};

let cachedFrames: readonly FaceFrame<D20Value>[] | undefined;

/** Face frames ordered by value (index = value - 1). Computed lazily and immutable. */
export function d20FaceFrames(): readonly FaceFrame<D20Value>[] {
  cachedFrames ??= Object.freeze(computeFaceFrames(D20_DEFINITION));
  return cachedFrames;
}

export function d20FaceFrame(value: D20Value): FaceFrame<D20Value> {
  const frame = d20FaceFrames()[value - 1];
  if (!frame) throw new Error(`Missing D20 face ${value}`);
  return frame;
}
