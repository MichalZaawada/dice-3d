import { dot, subtract } from '../animation/vector.js';
import type { FaceFrame } from '../geometry/dieDefinition.js';
import type { FaceUV } from '../types.js';
import type { NumberAtlas } from './numberAtlas.js';

/** Interleaved per-vertex layout of the static mesh buffer. */
export const MESH_LAYOUT = {
  position: { offset: 0, size: 3 },
  normal: { offset: 3, size: 3 },
  barycentric: { offset: 6, size: 3 },
  labelLocal: { offset: 9, size: 2 },
  labelCell: { offset: 11, size: 2 },
} as const;
export const MESH_STRIDE = 13;

/**
 * Side of the square (in model units) that a label cell covers on a face.
 * Tuned for faces of a unit-circumradius icosahedron (inradius ≈ 0.30).
 */
export const DEFAULT_LABEL_SIZE = 0.5;

export interface DieMesh<V extends number> {
  readonly values: readonly V[];
  readonly vertexCount: number;
  /** Static attributes, {@link MESH_STRIDE} floats per vertex, three vertices per face. */
  readonly data: Float32Array;
  readonly atlas: NumberAtlas;
}

/** Builds non-indexed flat-shaded triangles with label coordinates for every face. */
export function buildDieMesh<V extends number>(
  frames: readonly FaceFrame<V>[],
  atlas: NumberAtlas,
  labelSize = DEFAULT_LABEL_SIZE,
): DieMesh<V> {
  const data = new Float32Array(frames.length * 3 * MESH_STRIDE);
  const barycentric = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  let offset = 0;
  for (const frame of frames) {
    const [column, row] = atlas.cellOf(frame.value);
    frame.corners.forEach((corner, cornerIndex) => {
      const local = subtract(corner, frame.centroid);
      const x = dot(local, frame.right);
      const y = dot(local, frame.up);
      data.set(corner, offset);
      data.set(frame.normal, offset + 3);
      data.set(barycentric[cornerIndex] as readonly number[], offset + 6);
      // Label space: u to the right, v downwards, cell spans [0, 1].
      data[offset + 9] = 0.5 + x / labelSize;
      data[offset + 10] = 0.5 - y / labelSize;
      data[offset + 11] = column;
      data[offset + 12] = row;
      offset += MESH_STRIDE;
    });
  }
  return { values: frames.map((frame) => frame.value), vertexCount: frames.length * 3, data, atlas };
}

/** Per-vertex skin texture coordinates (two floats per vertex) for faces in mesh order. */
export function buildSkinUVs(faces: readonly FaceUV[]): Float32Array {
  const data = new Float32Array(faces.length * 6);
  faces.forEach((face, faceIndex) => {
    face.forEach(([u, v], corner) => {
      data[faceIndex * 6 + corner * 2] = u;
      data[faceIndex * 6 + corner * 2 + 1] = v;
    });
  });
  return data;
}
