import { fromBasisRows, type Quat } from '../animation/quaternion.js';
import { add, cross, dot, normalize, scale, subtract, type Vec3 } from '../animation/vector.js';

/**
 * A triangular face of a die. Vertex indices are listed in the canonical
 * A/B/C order: viewed from outside in the result orientation, A is the top
 * vertex, B the bottom-left and C the bottom-right one (counter-clockwise).
 */
export interface DieFace<V extends number> {
  readonly value: V;
  readonly vertices: readonly [a: number, b: number, c: number];
}

/** Die-specific data: geometry, values and numbering. Shared code consumes only this shape. */
export interface DieDefinition<V extends number> {
  readonly id: string;
  readonly values: readonly V[];
  readonly vertices: readonly Vec3[];
  /** Faces ordered by value. */
  readonly faces: readonly DieFace<V>[];
}

/** Derived geometric frame of a face. */
export interface FaceFrame<V extends number> {
  readonly value: V;
  readonly corners: readonly [Vec3, Vec3, Vec3];
  readonly centroid: Vec3;
  /** Outward unit normal. */
  readonly normal: Vec3;
  /** Unit vector in the face plane pointing from the centroid towards vertex A (label up). */
  readonly up: Vec3;
  /** Unit vector in the face plane pointing to the label's right. */
  readonly right: Vec3;
  /** Rotation that turns this face towards the camera (+Z) with its label upright (+Y). */
  readonly orientation: Quat;
}

export function computeFaceFrames<V extends number>(definition: DieDefinition<V>): readonly FaceFrame<V>[] {
  return definition.faces.map((face) => {
    const corners = face.vertices.map((index) => {
      const vertex = definition.vertices[index];
      if (!vertex) throw new Error(`Die "${definition.id}" references missing vertex ${index}`);
      return vertex;
    }) as unknown as readonly [Vec3, Vec3, Vec3];
    const [a, b, c] = corners;
    const centroid = scale(add(add(a, b), c), 1 / 3);
    const normal = normalize(cross(subtract(b, a), subtract(c, a)));
    const toA = subtract(a, centroid);
    const up = normalize(subtract(toA, scale(normal, dot(toA, normal))));
    const right = normalize(cross(up, normal));
    return {
      value: face.value,
      corners,
      centroid,
      normal,
      up,
      right,
      orientation: fromBasisRows(right, up, normal),
    };
  });
}
