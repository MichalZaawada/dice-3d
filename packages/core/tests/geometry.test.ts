import { describe, expect, it } from 'vitest';
import { rotateVector } from '../src/animation/quaternion.js';
import { dot, length, subtract, type Vec3 } from '../src/animation/vector.js';
import { D20_DEFINITION, D20_VALUES, D20_VERTICES, d20FaceFrame, d20FaceFrames, isD20Value } from '../src/geometry/d20.js';
import fixture from './fixtures/d20-faces.json' with { type: 'json' };

const close = (a: readonly number[], b: readonly number[], epsilon = 1e-6) =>
  a.every((value, index) => Math.abs(value - (b[index] as number)) < epsilon);

describe('D20 geometry', () => {
  it('is a regular icosahedron with 12 vertices, 30 edges and 20 faces', () => {
    expect(D20_VERTICES).toHaveLength(12);
    expect(D20_DEFINITION.faces).toHaveLength(20);
    for (const vertex of D20_VERTICES) expect(length(vertex)).toBeCloseTo(1, 12);

    const edges = new Set<string>();
    for (const face of D20_DEFINITION.faces) {
      const [a, b, c] = face.vertices;
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) edges.add([Math.min(p, q), Math.max(p, q)].join('-'));
    }
    expect(edges.size).toBe(30);

    const edgeLength = 4 / Math.sqrt(10 + 2 * Math.sqrt(5));
    for (const edge of edges) {
      const [p, q] = edge.split('-').map(Number) as [number, number];
      expect(length(subtract(D20_VERTICES[p] as Vec3, D20_VERTICES[q] as Vec3))).toBeCloseTo(edgeLength, 12);
    }
  });

  it('assigns every value from 1 to 20 exactly once, ordered by value', () => {
    expect(D20_DEFINITION.faces.map((face) => face.value)).toEqual([...D20_VALUES]);
  });

  it('has outward normals and counter-clockwise A/B/C winding seen from outside', () => {
    for (const frame of d20FaceFrames()) {
      expect(dot(frame.normal, frame.centroid)).toBeGreaterThan(0);
      expect(length(frame.normal)).toBeCloseTo(1, 12);
    }
  });

  it('makes opposite faces sum to 21', () => {
    for (const frame of d20FaceFrames()) {
      const opposite = d20FaceFrames().find((other) => dot(other.normal, frame.normal) < -0.999);
      expect(opposite?.value).toBe(21 - frame.value);
    }
  });

  it('keeps a balanced layout: the five faces around each vertex sum to 52 or 53', () => {
    D20_VERTICES.forEach((_, vertex) => {
      const faces = D20_DEFINITION.faces.filter((face) => face.vertices.includes(vertex));
      expect(faces).toHaveLength(5);
      const sum = faces.reduce((total, face) => total + face.value, 0);
      expect([52, 53]).toContain(sum);
    });
  });

  it('matches the durable numbering fixture', () => {
    expect(fixture.faces).toHaveLength(20);
    fixture.faces.forEach((expected, index) => {
      const face = D20_DEFINITION.faces[index];
      const frame = d20FaceFrames()[index];
      expect(face?.value).toBe(expected.value);
      expect(face?.vertices).toEqual(expected.vertices);
      expect(close(frame?.normal ?? [], expected.normal)).toBe(true);
      expect(close(frame?.up ?? [], expected.up)).toBe(true);
    });
  });

  it.each(D20_VALUES.map((value) => [value]))('orients face %i towards the camera with an upright label', (value) => {
    const frame = d20FaceFrame(value);
    expect(close(rotateVector(frame.orientation, frame.normal), [0, 0, 1], 1e-9)).toBe(true);
    expect(close(rotateVector(frame.orientation, frame.up), [0, 1, 0], 1e-9)).toBe(true);

    const [a, b, c] = frame.corners.map((corner) => rotateVector(frame.orientation, subtract(corner, frame.centroid)));
    // A is the top vertex, B bottom-left, C bottom-right.
    expect(a![0]).toBeCloseTo(0, 9);
    expect(a![1]).toBeGreaterThan(0);
    expect(b![0]).toBeLessThan(0);
    expect(c![0]).toBeGreaterThan(0);
    expect(b![1]).toBeCloseTo(c![1], 9);
    expect(b![1]).toBeLessThan(0);
    // The whole die stays behind the facing plane: the target face is the closest one to the camera.
    for (const other of d20FaceFrames()) {
      if (other.value === value) continue;
      expect(rotateVector(frame.orientation, other.normal)[2]).toBeLessThan(0.75);
    }
  });

  it('validates D20 values at runtime', () => {
    expect(isD20Value(1)).toBe(true);
    expect(isD20Value(20)).toBe(true);
    for (const invalid of [0, 21, 1.5, -1, Number.NaN, '5', null, undefined]) expect(isD20Value(invalid)).toBe(false);
  });
});
