import { angleBetween, fromBasisRows, type Quat } from '../animation/quaternion.js';
import { add, cross, dot, length, lerp, normalize, scale, subtract, type Vec3 } from '../animation/vector.js';
import { GLYPH_STROKE_WIDTH, labelExtent, needsOrientationMarker, type SymbolStrokes } from '../renderer/glyphs.js';
import { fittingScale, type AtlasLabel } from '../renderer/numberAtlas.js';
import { centroidOf, polygonNormal, type Shape } from './shapes.js';

/** Content of a label: text from the built-in glyph set, a user symbol, or nothing. */
export type LabelContent = { readonly text: string } | { readonly key: string; readonly symbol: SymbolStrokes } | null;

export interface LabelPlacement {
  /** Atlas key of the label content. */
  readonly key: string;
  readonly content: Exclude<LabelContent, null>;
  readonly center: Vec3;
  /** Unit vectors in the face plane: label up and right. */
  readonly up: Vec3;
  readonly right: Vec3;
  /** Side of the square label cell in model units. */
  readonly size: number;
}

export interface MeshPoint {
  readonly position: Vec3;
  readonly normal: Vec3;
  /** Weights of the face corners (for skin UVs), or null on trim surfaces. */
  readonly weights: readonly number[] | null;
}

/** A convex polygon of the mesh with at most one label. */
export interface MeshRegion {
  /** Global face index, or -1 for trim surfaces. */
  readonly face: number;
  readonly points: readonly MeshPoint[];
  /** Whether each edge (point i to i + 1) is a real edge of the die. */
  readonly boundary: readonly boolean[];
  readonly label: LabelPlacement | null;
}

export interface ModelFace {
  /** Global index (template and skin layout order). */
  readonly index: number;
  /** Body-level value, or null for faces without a single result (tetrahedron). */
  readonly value: unknown;
  /** Human-readable label text (symbols read as their key, corner labels joined with spaces). */
  readonly text: string;
  readonly corners: readonly Vec3[];
  readonly centroid: Vec3;
  readonly normal: Vec3;
  readonly up: Vec3;
  readonly right: Vec3;
  readonly labels: readonly LabelPlacement[];
}

export interface BodyPose {
  readonly value: unknown;
  readonly orientation: Quat;
}

/** One physical die; a die model has one body, except the percentile pair. */
export interface Body {
  readonly faces: readonly ModelFace[];
  readonly regions: readonly MeshRegion[];
  readonly poses: readonly BodyPose[];
  /** Placement inside the shared scene (model units) and uniform scale. */
  readonly offset: Vec3;
  readonly scale: number;
}

/** Upper bound of the label cell (coins and cubes would otherwise get oversized numbers). */
const MAX_LABEL_SIZE = 0.85;
/** Fraction of the largest fitting label box that is used, leaving a margin to the edges. */
const LABEL_FILL = 0.86;
/** Corner labels (tetrahedron) sit in a kite around each corner and are slightly smaller. */
const CORNER_LABEL_FILL = 0.8;

/** Half extents of the ink box of the widest label, as fractions of the label cell. */
export interface GlyphBox {
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
}

function frame(normal: Vec3, toward: Vec3): { up: Vec3; right: Vec3; orientation: Quat } {
  const up = normalize(subtract(toward, scale(normal, dot(toward, normal))));
  const right = normalize(cross(up, normal));
  return { up, right, orientation: fromBasisRows(right, up, normal) };
}

/**
 * Incircle of a tangential polygon (triangles, kites, rhombi, regular polygons)
 * or the centroid and the distance to the nearest edge for other polygons.
 */
export function labelCircle(points: readonly Vec3[], normal: Vec3): { center: Vec3; radius: number } {
  const origin = centroidOf(points);
  const helper = normalize(subtract(points[0] as Vec3, origin));
  const ex = helper;
  const ey = cross(normal, ex);
  const flat = points.map((p) => [dot(subtract(p, origin), ex), dot(subtract(p, origin), ey)] as const);
  // Inward edge lines n·p - r = n·a (counter-clockwise polygon: the inside is on the left).
  const rows = flat.map((a, i) => {
    const b = flat[(i + 1) % flat.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as const;
    return { n, d: n[0] * a[0] + n[1] * a[1] };
  });
  const distanceAt = (x: number, y: number) => Math.min(...rows.map(({ n, d }) => n[0] * x + n[1] * y - d));
  // Least squares for (x, y, r): [n0 n1 -1]·[x y r] = d.
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const v = [0, 0, 0];
  for (const { n, d } of rows) {
    const row = [n[0], n[1], -1];
    for (let i = 0; i < 3; i++) {
      v[i]! += row[i]! * d;
      for (let j = 0; j < 3; j++) m[i]![j]! += row[i]! * row[j]!;
    }
  }
  const solution = solve3(m, v);
  if (solution) {
    const [x, y, r] = solution;
    const residual = Math.max(...rows.map(({ n, d }) => Math.abs(n[0] * x + n[1] * y - r - d)));
    if (residual < 1e-7 && r > 0) {
      return { center: add(origin, add(scale(ex, x), scale(ey, y))), radius: r };
    }
  }
  return { center: origin, radius: distanceAt(0, 0) };
}

function solve3(m: number[][], v: number[]): [number, number, number] | null {
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;
  const column = (index: number) => m.map((row, r) => row.map((value, c) => (c === index ? v[r]! : value)));
  return [det(column(0)) / d, det(column(1)) / d, det(column(2)) / d];
}

export function labelKey(content: Exclude<LabelContent, null>): string {
  return 'text' in content ? content.text : content.key;
}

/**
 * Largest label cell that keeps the ink box inside the polygon, and where to
 * put it. The center is searched in the face plane (the objective is concave:
 * nested ternary searches converge); a tiny pull towards `preferred` makes
 * the result unique on faces such as rectangles.
 */
export function fitLabel(points: readonly Vec3[], up: Vec3, right: Vec3, box: GlyphBox, preferred: Vec3): { center: Vec3; size: number } {
  const flat = points.map((p) => [dot(subtract(p, preferred), right), dot(subtract(p, preferred), up)] as const);
  const edges = flat.map((a, i) => {
    const b = flat[(i + 1) % flat.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as const;
    return { n, d: n[0] * a[0] + n[1] * a[1] };
  });
  const corners = [
    [-box.halfWidth, box.top],
    [box.halfWidth, box.top],
    [-box.halfWidth, -box.bottom],
    [box.halfWidth, -box.bottom],
  ] as const;
  // Largest scale s with every corner c + s·k inside: n·c + s·(n·k) ≥ d.
  const sizeAt = (x: number, y: number) => {
    const slacks = edges.map(({ n, d }) => n[0] * x + n[1] * y - d);
    const outside = Math.min(...slacks);
    if (outside < 0) return outside;
    let size = Number.POSITIVE_INFINITY;
    for (const [index, { n }] of edges.entries()) {
      const slack = slacks[index]!;
      for (const [kx, ky] of corners) {
        const toward = -(n[0] * kx + n[1] * ky);
        if (toward > 0) size = Math.min(size, slack / toward);
      }
    }
    return size;
  };
  const radius = Math.max(...flat.map(([x, y]) => Math.hypot(x, y)));
  const objective = (x: number, y: number) => sizeAt(x, y) - 1e-4 * Math.hypot(x, y);
  const ternary = (f: (t: number) => number, lo: number, hi: number) => {
    for (let i = 0; i < 48; i++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (f(m1) < f(m2)) lo = m1;
      else hi = m2;
    }
    return (lo + hi) / 2;
  };
  const bestY = (x: number) => ternary((y) => objective(x, y), -radius, radius);
  const x = ternary((t) => objective(t, bestY(t)), -radius, radius);
  const y = bestY(x);
  return { center: add(preferred, add(scale(right, x), scale(up, y))), size: Math.max(0, sizeAt(x, y)) };
}

function placement(
  content: LabelContent,
  points: readonly Vec3[],
  normal: Vec3,
  up: Vec3,
  right: Vec3,
  box: GlyphBox,
  fill: number,
  fixedSize?: number,
): LabelPlacement | null {
  if (!content) return null;
  const circle = labelCircle(points, normal);
  const fitted = fixedSize === undefined ? fitLabel(points, up, right, box, circle.center) : undefined;
  return {
    key: labelKey(content),
    content,
    center: fitted?.center ?? circle.center,
    up,
    right,
    size: fixedSize ?? Math.min(MAX_LABEL_SIZE, fill * fitted!.size),
  };
}

/** Ink box of the widest label of a body, matching the atlas glyph scale. */
export function glyphBox(contents: readonly LabelContent[]): GlyphBox {
  const labels = atlasLabelsOf(contents);
  const scaleFactor = fittingScale(labels);
  let halfWidth = 0;
  let top = 0;
  let bottom = 0;
  for (const label of labels) {
    const extent = labelExtent(label.source, label.marker);
    halfWidth = Math.max(halfWidth, (extent.width + GLYPH_STROKE_WIDTH) / 2);
    top = Math.max(top, -extent.top + GLYPH_STROKE_WIDTH / 2);
    bottom = Math.max(bottom, extent.bottom + GLYPH_STROKE_WIDTH / 2);
  }
  return { halfWidth: halfWidth * scaleFactor, top: top * scaleFactor, bottom: bottom * scaleFactor };
}

export interface BodySpec {
  readonly shape: Shape;
  /** One entry per face (face reading) or per vertex (vertex reading), in canonical order. */
  readonly results: readonly { readonly value: unknown; readonly label: LabelContent }[];
  readonly offset?: Vec3;
  readonly scale?: number;
  /** Fixed label size (the D20 keeps its original 0.5). */
  readonly labelSize?: number;
}

const unitWeights = (count: number, index: number) => Array.from({ length: count }, (_, i) => (i === index ? 1 : 0));

/** Builds faces, mesh regions and result poses of one body. `firstFace` offsets the global face indices. */
export function buildBody(spec: BodySpec, firstFace = 0): Body {
  const { shape, results } = spec;
  const faces: ModelFace[] = [];
  const regions: MeshRegion[] = [];
  const poses: BodyPose[] = [];
  const box = glyphBox(results.map((result) => result.label));

  shape.faces.forEach((shapeFace, faceIndex) => {
    const index = firstFace + faceIndex;
    const corners = shapeFace.vertices.map((vertex) => shape.vertices[vertex] as Vec3);
    const normal = normalize(polygonNormal(corners));
    const centroid = centroidOf(corners);
    const count = corners.length;

    if (shape.reading === 'vertex') {
      // Corner labels: each corner shows its vertex value, pointing at the corner.
      const labels: LabelPlacement[] = [];
      const texts: string[] = [];
      shapeFace.vertices.forEach((vertex, j) => {
        const result = results[vertex];
        const corner = corners[j] as Vec3;
        const next = corners[(j + 1) % count] as Vec3;
        const previous = corners[(j + count - 1) % count] as Vec3;
        const { up, right, orientation } = frame(normal, subtract(corner, centroid));
        poses.push({ value: result?.value, orientation });
        const kite = [corner, lerp(corner, next, 0.5), centroid, lerp(previous, corner, 0.5)];
        const weights = [
          unitWeights(count, j),
          unitWeights(count, j).map((w, i) => (w + (i === (j + 1) % count ? 1 : 0)) / 2),
          Array.from({ length: count }, () => 1 / count),
          unitWeights(count, j).map((w, i) => (w + (i === (j + count - 1) % count ? 1 : 0)) / 2),
        ];
        const label = placement(result?.label ?? null, kite, normal, up, right, box, CORNER_LABEL_FILL, spec.labelSize);
        if (label) {
          labels.push(label);
          texts.push(label.key);
        }
        regions.push({
          face: index,
          points: kite.map((position, k) => ({ position, normal, weights: weights[k]! })),
          boundary: [true, false, false, true],
          label,
        });
      });
      const top = frame(normal, subtract(corners[0] as Vec3, centroid));
      faces.push({ index, value: null, text: texts.join(' '), corners, centroid, normal, up: top.up, right: top.right, labels });
      return;
    }

    const result = results[faceIndex];
    const { up, right, orientation } = frame(normal, subtract(shapeFace.up, centroid));
    poses.push({ value: result?.value, orientation });
    const label = placement(result?.label ?? null, corners, normal, up, right, box, LABEL_FILL, spec.labelSize);
    regions.push({
      face: index,
      points: corners.map((position, j) => ({ position, normal, weights: unitWeights(count, j) })),
      boundary: corners.map(() => true),
      label,
    });
    faces.push({
      index,
      value: result?.value,
      text: label?.key ?? '',
      corners,
      centroid,
      normal,
      up,
      right,
      labels: label ? [label] : [],
    });
  });

  for (const surface of shape.trim) {
    const points = surface.vertices.map((vertex) => shape.vertices[vertex] as Vec3);
    const flatNormal = normalize(polygonNormal(points));
    regions.push({
      face: -1,
      points: points.map((position, j) => ({
        position,
        normal: surface.normals ? normalize(surface.normals[j] as Vec3) : flatNormal,
        weights: null,
      })),
      boundary: surface.boundary,
      label: null,
    });
  }

  return { faces, regions, poses, offset: spec.offset ?? [0, 0, 0], scale: spec.scale ?? 1 };
}

/** The pose for `value` closest to `current` (ties: the first one), or the first pose without a current rotation. */
export function nearestPose(body: Body, value: unknown, current: Quat | undefined): Quat {
  let best: Quat | undefined;
  let bestAngle = Number.POSITIVE_INFINITY;
  for (const pose of body.poses) {
    if (!Object.is(pose.value, value) && pose.value !== value) continue;
    if (!current) return pose.orientation;
    const angle = angleBetween(pose.orientation, current);
    if (angle < bestAngle - 1e-9) {
      best = pose.orientation;
      bestAngle = angle;
    }
  }
  if (!best) throw new Error(`No pose for value ${String(value)}`);
  return best;
}

/** Atlas entries for all labels of the given bodies (6/9-style markers computed across the whole die). */
export function atlasLabels(bodies: readonly Body[]): AtlasLabel[] {
  return atlasLabelsOf(bodies.flatMap((body) => body.regions.map((region) => region.label?.content ?? null)));
}

function atlasLabelsOf(list: readonly LabelContent[]): AtlasLabel[] {
  const contents = new Map<string, Exclude<LabelContent, null>>();
  for (const content of list) {
    if (content && !contents.has(labelKey(content))) contents.set(labelKey(content), content);
  }
  const texts = [...contents.values()].flatMap((content) => ('text' in content ? [content.text] : []));
  return [...contents.entries()].map(([key, content]) =>
    'text' in content
      ? { key, source: content.text, marker: needsOrientationMarker(content.text, texts) }
      : { key, source: content.symbol, marker: false },
  );
}

/** Largest distance of a body vertex from its center after placement (used by tests and the camera budget). */
export function bodyExtent(body: Body): number {
  let extent = 0;
  for (const face of body.faces) for (const corner of face.corners) extent = Math.max(extent, length(add(scale(corner, body.scale), body.offset)));
  return extent;
}
