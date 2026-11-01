import type { D20Value, FaceUV, UV } from '../types.js';

/**
 * Net cells of the `d20-net-v1` template: A/B/C corners of every face as
 * `[x, row]`, where `x` is measured in triangle sides and `row` in triangle
 * heights. The net has a cap row of five triangles, a band of ten and a
 * bottom cap of five (5.5 sides wide, 3 heights tall). Up-pointing triangles
 * have vertex A at the top; down-pointing ones have A at the bottom, so their
 * artwork is upside down in the flat image.
 */
const NET_CELLS: Readonly<Record<D20Value, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>> = {
  1: [[5, 3], [5.5, 2], [4.5, 2]],
  2: [[0.5, 0], [0, 1], [1, 1]],
  3: [[2, 1], [1.5, 2], [2.5, 2]],
  4: [[4.5, 0], [4, 1], [5, 1]],
  5: [[2.5, 2], [3, 1], [2, 1]],
  6: [[3.5, 2], [4, 1], [3, 1]],
  7: [[4, 3], [4.5, 2], [3.5, 2]],
  8: [[1, 3], [1.5, 2], [0.5, 2]],
  9: [[3, 1], [2.5, 2], [3.5, 2]],
  10: [[1.5, 2], [2, 1], [1, 1]],
  11: [[4, 1], [3.5, 2], [4.5, 2]],
  12: [[0.5, 2], [1, 1], [0, 1]],
  13: [[3.5, 0], [3, 1], [4, 1]],
  14: [[1.5, 0], [1, 1], [2, 1]],
  15: [[1, 1], [0.5, 2], [1.5, 2]],
  16: [[5, 1], [4.5, 2], [5.5, 2]],
  17: [[2, 3], [2.5, 2], [1.5, 2]],
  18: [[4.5, 2], [5, 1], [4, 1]],
  19: [[3, 3], [3.5, 2], [2.5, 2]],
  20: [[2.5, 0], [2, 1], [3, 1]],
};

const WIDTH = 2048;
const HEIGHT = 1024;
const MARGIN_X = 64;
const SIDE = (WIDTH - 2 * MARGIN_X) / 5.5;
const TRIANGLE_HEIGHT = (SIDE * Math.sqrt(3)) / 2;
const MARGIN_Y = (HEIGHT - 3 * TRIANGLE_HEIGHT) / 2;

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function cellToPixel([x, row]: readonly [number, number]): readonly [number, number] {
  return [MARGIN_X + x * SIDE, MARGIN_Y + row * TRIANGLE_HEIGHT];
}

const faces = {} as Record<D20Value, FaceUV>;
const pixelFaces = {} as Record<D20Value, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>;
for (const key of Object.keys(NET_CELLS)) {
  const value = Number(key) as D20Value;
  const pixels = NET_CELLS[value].map(cellToPixel) as unknown as readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  pixelFaces[value] = pixels;
  faces[value] = Object.freeze(
    pixels.map(([x, y]) => Object.freeze([round(x / WIDTH), round(y / HEIGHT)]) as UV),
  ) as unknown as FaceUV;
}
Object.freeze(faces);
Object.freeze(pixelFaces);

/** Description of the official `d20-net-v1` texture template. */
export const D20_NET_V1 = Object.freeze({
  id: 'd20-net-v1' as const,
  version: 1,
  /** Reference size in pixels. Any resolution with the same aspect ratio works. */
  width: WIDTH,
  height: HEIGHT,
  /** Required `width / height` of images that use this layout. */
  aspectRatio: WIDTH / HEIGHT,
  /** Allowed relative deviation from {@link aspectRatio}. */
  aspectTolerance: 0.01,
  /** Triangle side length in reference pixels. */
  triangleSide: round(SIDE),
  /** Normalized A/B/C texture coordinates of every face. */
  faces: faces as Readonly<Record<D20Value, FaceUV>>,
});

/** A/B/C positions in reference pixels; used to generate the template files. */
export function d20NetV1PixelFaces(): Readonly<Record<D20Value, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>> {
  return pixelFaces;
}
