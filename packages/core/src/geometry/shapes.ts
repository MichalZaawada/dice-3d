import { add, cross, dot, length, normalize, scale, subtract, type Vec3 } from '../animation/vector.js';
import { D20_DEFINITION, D20_VERTICES } from './d20.js';

/**
 * A result face of a shape. Vertices are listed counter-clockwise seen from
 * outside; `up` is a point the face label points at (projected into the face plane).
 */
export interface ShapeFace {
  readonly vertices: readonly number[];
  readonly up: Vec3;
}

/** A surface without a result (coin rim, prism end caps). */
export interface TrimSurface {
  readonly vertices: readonly number[];
  /** Whether each edge (vertex i to i + 1) is drawn as an edge line. */
  readonly boundary: readonly boolean[];
  /** Per-vertex normals for smooth shading; omitted for flat surfaces. */
  readonly normals?: readonly Vec3[];
}

/**
 * Polyhedral geometry of a die with circumradius 1.
 *
 * `reading: 'face'`: every face is a result shown towards the camera.
 * `reading: 'vertex'`: every vertex is a result (tetrahedron); it is read at the
 * top corner of the face turned towards the camera.
 */
export interface Shape {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly ShapeFace[];
  readonly trim: readonly TrimSurface[];
  readonly reading: 'face' | 'vertex';
  /** How built-in numbering is assigned when the shape is used as a numeric die. */
  readonly numbering: 'opposite' | 'sequential';
  /** Explicit opposite face for shapes without central symmetry (even trapezohedra). */
  readonly opposite?: readonly number[];
}

const EPSILON = 1e-9;

/** Normal of a planar polygon (Newell's method), not normalized. */
export function polygonNormal(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length] as Vec3;
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return [x, y, z];
}

export function centroidOf(points: readonly Vec3[]): Vec3 {
  return scale(points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]), 1 / points.length);
}

/** Returns the indices counter-clockwise seen from outside (the shapes are convex and contain the origin). */
function outward(vertices: readonly Vec3[], indices: readonly number[]): number[] {
  const points = indices.map((index) => vertices[index] as Vec3);
  return dot(polygonNormal(points), centroidOf(points)) < 0 ? [...indices].reverse() : [...indices];
}

/** Sorts vertex indices by angle around `axis` (any order; fixed later by {@link outward}). */
function ringAround(vertices: readonly Vec3[], indices: readonly number[], axis: Vec3): number[] {
  const n = normalize(axis);
  const helper: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(n, helper));
  const v = cross(n, u);
  const angle = (index: number) => {
    const p = vertices[index] as Vec3;
    return Math.atan2(dot(p, v), dot(p, u));
  };
  return [...indices].sort((a, b) => angle(a) - angle(b));
}

/** Scales the shape to circumradius 1. */
function normalized(shape: Shape): Shape {
  const radius = Math.max(...shape.vertices.map(length));
  const factor = 1 / radius;
  return {
    ...shape,
    vertices: shape.vertices.map((vertex) => scale(vertex, factor)),
    faces: shape.faces.map((face) => ({ vertices: face.vertices, up: scale(face.up, factor) })),
  };
}

/** Deterministic "highest" vertex: largest z, then y, then x. */
function topmost(vertices: readonly Vec3[], indices: readonly number[]): number {
  const key = (index: number): Vec3 => {
    const [x, y, z] = vertices[index] as Vec3;
    return [Math.round(x / EPSILON), Math.round(y / EPSILON), Math.round(z / EPSILON)];
  };
  return [...indices].sort((a, b) => {
    const [ax, ay, az] = key(a);
    const [bx, by, bz] = key(b);
    return bz - az || by - ay || bx - ax || a - b;
  })[0] as number;
}

/** A coin: two round faces and a smooth rim. */
export function coinShape(segments = 32, halfThickness = 0.12): Shape {
  const vertices: Vec3[] = [];
  for (const z of [halfThickness, -halfThickness]) {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      vertices.push([Math.cos(angle), Math.sin(angle), z]);
    }
  }
  const top = Array.from({ length: segments }, (_, i) => i);
  const bottom = top.map((i) => segments + i).reverse();
  const trim: TrimSurface[] = top.map((i) => {
    const next = (i + 1) % segments;
    const indices = [segments + i, segments + next, next, i];
    return {
      vertices: indices,
      boundary: [true, false, true, false],
      normals: indices.map((index) => {
        const [x, y] = vertices[index] as Vec3;
        return [x, y, 0] as Vec3;
      }),
    };
  });
  return normalized({
    vertices,
    faces: [
      { vertices: top, up: [0, 1, halfThickness] },
      { vertices: bottom, up: [0, 1, -halfThickness] },
    ],
    trim,
    reading: 'face',
    numbering: 'opposite',
  });
}

/**
 * A "log" prism lying along the X axis: `sides` long rectangular faces carry
 * the results, the polygonal end caps are blank. Face 0 faces +Z.
 */
export function prismShape(sides: number): Shape {
  const radius = Math.min(0.85, 0.5 + 0.025 * sides);
  const halfLength = Math.sqrt(1 - radius * radius);
  const angle = (k: number) => (2 * Math.PI * k) / sides + Math.PI / 2 - Math.PI / sides;
  const ring = (k: number): readonly [number, number] => [radius * Math.cos(angle(k)), radius * Math.sin(angle(k))];
  const vertices: Vec3[] = [];
  for (const x of [-halfLength, halfLength]) {
    for (let k = 0; k < sides; k++) vertices.push([x, ...ring(k)]);
  }
  const faces: ShapeFace[] = Array.from({ length: sides }, (_, k) => {
    const next = (k + 1) % sides;
    const [y, z] = ring(k);
    return { vertices: outward(vertices, [k, next, sides + next, sides + k]), up: [0, y, z] };
  });
  const left = Array.from({ length: sides }, (_, k) => k);
  const right = left.map((k) => sides + k);
  const trim = [left, right].map((cap) => ({
    vertices: outward(vertices, cap),
    boundary: cap.map(() => true),
  }));
  return { vertices, faces, trim, reading: 'face', numbering: 'sequential' };
}

/** Tetrahedron; face i is opposite vertex i. Results are read at the top vertex. */
export function tetrahedronShape(): Shape {
  const vertices: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ].map((v) => normalize(v as unknown as Vec3));
  const faces = vertices.map((_, opposite) => ({
    vertices: outward(vertices, [0, 1, 2, 3].filter((index) => index !== opposite)),
    up: [0, 0, 0] as Vec3,
  }));
  return { vertices, faces, trim: [], reading: 'vertex', numbering: 'sequential' };
}

export function cubeShape(): Shape {
  const vertices: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z]);
  const faces: ShapeFace[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      const normal: Vec3 = [0, 0, 0].map((_, i) => (i === axis ? sign : 0)) as unknown as Vec3;
      const indices = vertices.flatMap((vertex, index) => (vertex[axis] === sign ? [index] : []));
      const up: Vec3 = axis === 2 ? [0, 1, sign] : add(normal, [0, 0, 1]);
      faces.push({ vertices: outward(vertices, ringAround(vertices, indices, normal)), up });
    }
  }
  return normalized({ vertices, faces, trim: [], reading: 'face', numbering: 'opposite' });
}

export function octahedronShape(): Shape {
  const vertices: Vec3[] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const faces: ShapeFace[] = [];
  for (const sz of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sx of [1, -1]) {
        const z = sz > 0 ? 4 : 5;
        faces.push({ vertices: outward(vertices, [sx > 0 ? 0 : 1, sy > 0 ? 2 : 3, z]), up: vertices[z] as Vec3 });
      }
    }
  }
  return { vertices, faces, trim: [], reading: 'face', numbering: 'opposite' };
}

/**
 * Trapezohedron with `2 × sides` kite faces (D10, D14, D16). Kites are planar
 * because the rings sit at ±h(1 − cos(π/n)) / (1 + cos(π/n)). Labels point at the apex.
 */
export function trapezohedronShape(sides: number): Shape {
  const apex = 0.9 + 0.06 * sides;
  const c = Math.cos(Math.PI / sides);
  const ringZ = (apex * (1 - c)) / (1 + c);
  const top: Vec3 = [0, 0, apex];
  const bottom: Vec3 = [0, 0, -apex];
  const upper = (k: number): number => 1 + (k % sides);
  const lower = (k: number): number => 1 + sides + (k % sides);
  const vertices: Vec3[] = [top];
  for (let k = 0; k < sides; k++) {
    const angle = (2 * Math.PI * k) / sides;
    vertices.push([Math.cos(angle), Math.sin(angle), ringZ]);
  }
  for (let k = 0; k < sides; k++) {
    const angle = (2 * Math.PI * k) / sides + Math.PI / sides;
    vertices.push([Math.cos(angle), Math.sin(angle), -ringZ]);
  }
  vertices.push(bottom);
  const bottomIndex = vertices.length - 1;
  const faces: ShapeFace[] = [];
  for (let k = 0; k < sides; k++) {
    faces.push({ vertices: outward(vertices, [0, upper(k), lower(k), upper(k + 1)]), up: top });
  }
  for (let k = 0; k < sides; k++) {
    faces.push({ vertices: outward(vertices, [bottomIndex, lower(k + 1), upper(k + 1), lower(k)]), up: bottom });
  }
  // Even trapezohedra have no exactly opposite face; pair each upper kite with the lower kite half a turn away.
  const opposite =
    sides % 2 === 0
      ? faces.map((_, index) => (index < sides ? sides + ((index + sides / 2) % sides) : (index - sides + sides / 2) % sides))
      : undefined;
  return normalized({ vertices, faces, trim: [], reading: 'face', numbering: 'opposite', ...(opposite ? { opposite } : {}) });
}

export function icosahedronShape(): Shape {
  return {
    vertices: D20_VERTICES,
    faces: D20_DEFINITION.faces.map((face) => ({ vertices: face.vertices, up: D20_VERTICES[face.vertices[0]] as Vec3 })),
    trim: [],
    reading: 'face',
    numbering: 'opposite',
  };
}

interface Mesh {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly (readonly number[])[];
}

const ICOSAHEDRON: Mesh = { vertices: D20_VERTICES, faces: D20_DEFINITION.faces.map((face) => face.vertices) };

/** Polar dual on the unit sphere: one vertex per face, one face per vertex. */
function dual(mesh: Mesh): Mesh {
  const vertices = mesh.faces.map((face) => normalize(centroidOf(face.map((index) => mesh.vertices[index] as Vec3))));
  const faces = mesh.vertices.map((vertex, index) => {
    const incident = mesh.faces.flatMap((face, faceIndex) => (face.includes(index) ? [faceIndex] : []));
    return outward(vertices, ringAround(vertices, incident, vertex));
  });
  return { vertices, faces };
}

const DODECAHEDRON = dual(ICOSAHEDRON);

export function dodecahedronShape(): Shape {
  const { vertices, faces } = DODECAHEDRON;
  return {
    vertices,
    faces: faces.map((face) => ({ vertices: face, up: vertices[topmost(vertices, face)] as Vec3 })),
    trim: [],
    reading: 'face',
    numbering: 'opposite',
  };
}

/** Pyramids on every face ("kis"); the apex sits at `apexRadius` along the face direction. */
function kis(mesh: Mesh, apexRadius: number): Shape {
  const vertices = [...mesh.vertices];
  const faces: ShapeFace[] = [];
  for (const face of mesh.faces) {
    const apex = scale(normalize(centroidOf(face.map((index) => mesh.vertices[index] as Vec3))), apexRadius);
    const apexIndex = vertices.push(apex) - 1;
    face.forEach((index, i) => {
      const next = face[(i + 1) % face.length] as number;
      faces.push({ vertices: outward(vertices, [apexIndex, index, next]), up: apex });
    });
  }
  return normalized({ vertices, faces, trim: [], reading: 'face', numbering: 'opposite' });
}

/**
 * Splits every triangle into six (corner, edge midpoint, center). Radii are the
 * canonical Catalan values relative to the corner radius.
 */
function disdyakis(mesh: Mesh, edgeRadius: number, centerRadius: number): Shape {
  const vertices = [...mesh.vertices];
  const midpoints = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    let index = midpoints.get(key);
    if (index === undefined) {
      index = vertices.push(scale(normalize(add(mesh.vertices[a] as Vec3, mesh.vertices[b] as Vec3)), edgeRadius)) - 1;
      midpoints.set(key, index);
    }
    return index;
  };
  const faces: ShapeFace[] = [];
  for (const face of mesh.faces) {
    const center = vertices.push(scale(normalize(centroidOf(face.map((index) => mesh.vertices[index] as Vec3))), centerRadius)) - 1;
    face.forEach((corner, i) => {
      const next = face[(i + 1) % face.length] as number;
      const previous = face[(i + face.length - 1) % face.length] as number;
      const after = midpoint(corner, next);
      const before = midpoint(previous, corner);
      // The label base runs along the longest side (corner to center); it points at the right-angle vertex.
      faces.push({ vertices: outward(vertices, [corner, after, center]), up: vertices[after] as Vec3 });
      faces.push({ vertices: outward(vertices, [corner, center, before]), up: vertices[before] as Vec3 });
    });
  }
  return normalized({ vertices, faces, trim: [], reading: 'face', numbering: 'opposite' });
}

const OCTAHEDRON: Mesh = (() => {
  const shape = octahedronShape();
  return { vertices: shape.vertices, faces: shape.faces.map((face) => face.vertices) };
})();

const CUBE: Mesh = (() => {
  const shape = cubeShape();
  return { vertices: shape.vertices, faces: shape.faces.map((face) => face.vertices) };
})();

/** D24: a pyramid on every cube face (canonical apex at 1.5 × the half edge). */
export function tetrakisHexahedronShape(): Shape {
  return kis(CUBE, 1.5 / Math.sqrt(3));
}

/** D60: a pyramid on every dodecahedron face (canonical apex radius 0.9742). */
export function pentakisDodecahedronShape(): Shape {
  return kis(DODECAHEDRON, 0.97418);
}

/** D48: six triangles per octahedron face. */
export function disdyakisDodecahedronShape(): Shape {
  return disdyakis(OCTAHEDRON, 0.86729, 0.91554);
}

/** D120: six triangles per icosahedron face. */
export function disdyakisTriacontahedronShape(): Shape {
  return disdyakis(ICOSAHEDRON, 0.92101, 0.93798);
}

/** D30: one rhombus per icosahedron edge, spanning the two edge vertices and the two adjacent face centers. */
export function rhombicTriacontahedronShape(): Shape {
  const centers = DODECAHEDRON.vertices;
  const edges = new Map<string, { a: number; b: number; faces: number[] }>();
  ICOSAHEDRON.faces.forEach((face, faceIndex) => {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length] as number;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const edge = edges.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), faces: [] };
      edge.faces.push(faceIndex);
      edges.set(key, edge);
    });
  });
  const first = [...edges.values()][0]!;
  const m = normalize(add(ICOSAHEDRON.vertices[first.a] as Vec3, ICOSAHEDRON.vertices[first.b] as Vec3));
  // Scale of the icosahedron vertices that makes every rhombus planar.
  const vertexScale = dot(centers[first.faces[0]!] as Vec3, m) / dot(ICOSAHEDRON.vertices[first.a] as Vec3, m);
  const vertices: Vec3[] = [...ICOSAHEDRON.vertices.map((vertex) => scale(vertex, vertexScale)), ...centers];
  const offset = ICOSAHEDRON.vertices.length;
  const faces: ShapeFace[] = [...edges.values()].map(({ a, b, faces: [f1, f2] }) => ({
    vertices: outward(vertices, [a, offset + f1!, b, offset + f2!]),
    up: vertices[topmost(vertices, [a, b])] as Vec3,
  }));
  return normalized({ vertices, faces, trim: [], reading: 'face', numbering: 'opposite' });
}

/** Distance from `point` to the face planes' far side: positive when `point` lies outside a face plane. */
export function maxPlaneExcess(shape: Shape, point: Vec3): number {
  let excess = Number.NEGATIVE_INFINITY;
  for (const face of shape.faces) {
    const points = face.vertices.map((index) => shape.vertices[index] as Vec3);
    const normal = normalize(polygonNormal(points));
    excess = Math.max(excess, dot(normal, subtract(point, points[0] as Vec3)));
  }
  return excess;
}
