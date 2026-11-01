import { dot, subtract, type Vec3 } from '../animation/vector.js';
import type { Body, MeshPoint, MeshRegion } from '../geometry/model.js';
import type { FaceUVPolygon } from '../types.js';
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
 * Side of the square (in model units) that a label cell covers on a D20 face
 * (inradius ≈ 0.30). Other dice scale their labels to their face inradius.
 */
export const DEFAULT_LABEL_SIZE = 0.5;

/** Label coordinates of regions without a label: outside the cell, so no ink is drawn. */
const NO_LABEL = -1;

export interface MeshBody {
  /** First vertex and vertex count of the body in the mesh buffer. */
  readonly first: number;
  readonly count: number;
  readonly offset: Vec3;
  readonly scale: number;
}

export interface DieMesh {
  readonly vertexCount: number;
  /** Static attributes, {@link MESH_STRIDE} floats per vertex, non-indexed triangles. */
  readonly data: Float32Array;
  readonly atlas: NumberAtlas;
  readonly bodies: readonly MeshBody[];
  /** Number of skinnable faces and their corner counts (UV polygon sizes). */
  readonly faceCorners: readonly number[];
  /** Per vertex: skinned face index (or -1) and the corner weights for its UV. */
  readonly skinFaces: Int32Array;
  readonly skinWeights: readonly (readonly number[] | null)[];
  /** Edge line width relative to the D20 (thinner on dice with many small faces). */
  readonly edgeScale: number;
}

/**
 * Builds flat-shaded triangles with label coordinates. Polygons are fanned;
 * the barycentric component of an internal diagonal is offset by 1 so the
 * shader never draws it as an edge.
 */
export function buildDieMesh(bodies: readonly Body[], atlas: NumberAtlas): DieMesh {
  let triangles = 0;
  for (const body of bodies) for (const region of body.regions) triangles += region.points.length - 2;
  const vertexCount = triangles * 3;
  const data = new Float32Array(vertexCount * MESH_STRIDE);
  const skinFaces = new Int32Array(vertexCount);
  const skinWeights: (readonly number[] | null)[] = [];
  const faceCorners: number[] = [];
  const meshBodies: MeshBody[] = [];
  let vertex = 0;

  const writeVertex = (region: MeshRegion, point: MeshPoint, barycentric: readonly number[]) => {
    const offset = vertex * MESH_STRIDE;
    data.set(point.position, offset);
    data.set(point.normal, offset + 3);
    data.set(barycentric, offset + 6);
    const label = region.label;
    if (label) {
      const local = subtract(point.position, label.center);
      const [column, row] = atlas.cellOf(label.key);
      // Label space: u to the right, v downwards, cell spans [0, 1].
      data[offset + 9] = 0.5 + dot(local, label.right) / label.size;
      data[offset + 10] = 0.5 - dot(local, label.up) / label.size;
      data[offset + 11] = column;
      data[offset + 12] = row;
    } else {
      data[offset + 9] = NO_LABEL;
      data[offset + 10] = NO_LABEL;
    }
    skinFaces[vertex] = point.weights === null ? -1 : region.face;
    skinWeights.push(point.weights);
    vertex++;
  };

  for (const body of bodies) {
    const first = vertex;
    for (const face of body.faces) faceCorners[face.index] = face.corners.length;
    for (const region of body.regions) {
      const { points, boundary } = region;
      const n = points.length;
      for (let i = 1; i + 1 < n; i++) {
        // Edges of triangle (0, i, i + 1): component k is zero on the edge opposite vertex k.
        const edge12 = boundary[i] === true;
        const edge20 = i + 1 === n - 1 && boundary[n - 1] === true;
        const edge01 = i === 1 && boundary[0] === true;
        const offsets = [edge12 ? 0 : 1, edge20 ? 0 : 1, edge01 ? 0 : 1];
        const corners = [points[0]!, points[i]!, points[i + 1]!];
        corners.forEach((point, k) => {
          writeVertex(region, point, offsets.map((extra, c) => (c === k ? 1 : 0) + extra));
        });
      }
    }
    meshBodies.push({ first, count: vertex - first, offset: body.offset, scale: body.scale });
  }

  const faceCount = bodies.reduce((count, body) => Math.max(count, body.faces.length), 0);
  const edgeScale = Math.min(1, Math.sqrt(20 / Math.max(20, faceCount)));
  return { vertexCount, data, atlas, bodies: meshBodies, faceCorners, skinFaces, skinWeights, edgeScale };
}

/** Per-vertex skin texture coordinates (two floats per vertex); trim surfaces get -1 (unskinned). */
export function buildSkinUVs(mesh: DieMesh, faces: readonly FaceUVPolygon[]): Float32Array {
  const data = new Float32Array(mesh.vertexCount * 2);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    const face = mesh.skinFaces[vertex] as number;
    const weights = mesh.skinWeights[vertex];
    const polygon = face >= 0 ? faces[face] : undefined;
    if (!polygon || !weights) {
      data[vertex * 2] = -1;
      data[vertex * 2 + 1] = -1;
      continue;
    }
    let u = 0;
    let v = 0;
    weights.forEach((weight, corner) => {
      const uv = polygon[corner];
      if (!uv || weight === 0) return;
      u += weight * uv[0];
      v += weight * uv[1];
    });
    data[vertex * 2] = u;
    data[vertex * 2 + 1] = v;
  }
  return data;
}
