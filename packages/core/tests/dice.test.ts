import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { angleBetween, rotateVector, type Quat } from '../src/animation/quaternion.js';
import { dot, length, normalize, subtract, type Vec3 } from '../src/animation/vector.js';
import { createDieTemplateSvg, defineDie, getDieInfo, getDieTemplate } from '../src/controller/dieInfo.js';
import { prepareSkin, validateFacePolygon } from '../src/controller/skinValidation.js';
import { d20FaceFrame } from '../src/geometry/d20.js';
import { builtInDieModel, DIE_TYPES, resolveDieModel, type DieModel } from '../src/geometry/dice.js';
import { maxPlaneExcess, polygonNormal, type Shape } from '../src/geometry/shapes.js';
import { buildDieMesh, MESH_STRIDE } from '../src/renderer/dieMesh.js';
import { createLabelAtlas } from '../src/renderer/numberAtlas.js';
import type { DieSymbol, DieType } from '../src/types.js';
import { fakeInspector, fakeSource } from './helpers.js';

const templatesDir = fileURLToPath(new URL('../templates/', import.meta.url));
const near = (a: readonly number[], b: readonly number[], epsilon = 1e-6) => a.every((value, i) => Math.abs(value - b[i]!) < epsilon);

const SIDES: Partial<Record<DieType, number>> = {
  d2: 2, d3: 3, d4: 4, d5: 5, d6: 6, d7: 7, d8: 8, d10: 10, d12: 12, d14: 14, d16: 16, d20: 20, d24: 24, d30: 30, d48: 48, d60: 60, d120: 120,
};
const NUMERIC = Object.keys(SIDES) as DieType[];

/** The body as a shape, for convexity checks. */
function shapeOf(model: DieModel, body = 0): Shape {
  const vertices: Vec3[] = [];
  const faces = model.bodies[body]!.faces.map((face) => ({
    vertices: face.corners.map((corner) => vertices.push(corner) - 1),
    up: face.centroid,
  }));
  return { vertices, faces, trim: [], reading: 'face', numbering: 'sequential' };
}

/** Rotations of the front face for a value. */
function frontFace(model: DieModel, orientation: Quat, body = 0) {
  return [...model.bodies[body]!.faces].sort(
    (a, b) => rotateVector(orientation, b.normal)[2] - rotateVector(orientation, a.normal)[2],
  )[0]!;
}

describe('built-in dice', () => {
  it('registers every required type', () => {
    expect([...DIE_TYPES].sort()).toEqual(
      ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd12', 'd14', 'd16', 'd20', 'd24', 'd30', 'd48', 'd60', 'd120', 'd100', 'd10-tens', 'df'].sort(),
    );
  });

  it.each(NUMERIC)('%s has integer results 1 to N, labelled with their numbers', (type) => {
    const sides = SIDES[type]!;
    const info = getDieInfo(type);
    expect(info.values).toEqual(Array.from({ length: sides }, (_, i) => i + 1));
    expect(info.defaultValue).toBe(sides);
    for (const value of info.values) {
      expect(info.labelsFor(value)).toEqual([String(value)]);
      expect(info.format(value)).toBe(String(value));
    }
    if (type !== 'd4') {
      expect(info.faces).toHaveLength(sides);
      info.faces.forEach((face, index) => {
        expect(face).toEqual({ index, value: index + 1, label: String(index + 1) });
      });
    }
  });

  it.each(DIE_TYPES)('%s is convex, planar, outward-wound and fits the unit sphere', (type) => {
    const model = builtInDieModel(type);
    model.bodies.forEach((body, index) => {
      const shape = shapeOf(model, index);
      for (const face of body.faces) {
        expect(length(face.normal)).toBeCloseTo(1, 9);
        expect(dot(face.normal, face.centroid)).toBeGreaterThan(0);
        expect(dot(normalize(polygonNormal(face.corners)), face.normal)).toBeCloseTo(1, 9);
        for (const corner of face.corners) {
          expect(Math.abs(dot(subtract(corner, face.corners[0]!), face.normal))).toBeLessThan(1e-9);
          expect(length(corner)).toBeLessThanOrEqual(1 + 1e-9);
          expect(maxPlaneExcess(shape, corner)).toBeLessThan(1e-9);
        }
      }
      // The scene stays inside the camera frame (±1.42).
      for (const face of body.faces) {
        for (const corner of face.corners) expect(Math.abs(corner[0] * body.scale + body.offset[0])).toBeLessThan(1.42);
      }
    });
  });

  it.each(NUMERIC.filter((type) => !['d3', 'd4', 'd5', 'd7', 'd16'].includes(type)))('%s: opposite faces sum to N + 1', (type) => {
    const model = builtInDieModel(type);
    const faces = model.bodies[0]!.faces;
    for (const face of faces) {
      const opposite = faces.find((other) => dot(other.normal, face.normal) < -1 + 1e-6);
      expect((face.value as number) + (opposite?.value as number)).toBe(faces.length + 1);
    }
  });

  it('numbers log dice around their axis and pairs D16 kites half a turn apart', () => {
    for (const type of ['d3', 'd5', 'd7'] as const) {
      const faces = builtInDieModel(type).bodies[0]!.faces;
      // The long axis is X; consecutive values are neighbours around it.
      for (const face of faces) expect(face.normal[0]).toBeCloseTo(0, 9);
      faces.forEach((face, index) => {
        const next = faces[(index + 1) % faces.length]!;
        const shared = face.corners.filter((corner) => next.corners.some((other) => near(other, corner)));
        expect(shared).toHaveLength(2);
      });
    }
    const d16 = builtInDieModel('d16').bodies[0]!.faces;
    for (const face of d16) {
      const partner = d16.find((other) => other.value === 17 - (face.value as number))!;
      expect(dot(face.normal, partner.normal)).toBeLessThan(-0.9);
    }
  });

  it.each(DIE_TYPES)('%s orients every value towards the camera with an upright label', (type) => {
    const model = builtInDieModel(type);
    for (const value of model.values) {
      const targets = model.orientations(value, []);
      expect(targets).toHaveLength(model.bodies.length);
      model.labelsFor(value).forEach((expected, body) => {
        const orientation = targets[body]!;
        const face = frontFace(model, orientation, body);
        expect(near(rotateVector(orientation, face.normal), [0, 0, 1], 1e-9)).toBe(true);
        // The label read at the top of the front face (D4: corner label; others: the face label).
        const label = [...face.labels].sort(
          (a, b) => rotateVector(orientation, subtract(b.center, face.centroid))[1] - rotateVector(orientation, subtract(a.center, face.centroid))[1],
        )[0];
        expect(label?.key ?? '').toBe(expected);
        if (label) expect(near(rotateVector(orientation, label.up), [0, 1, 0], 1e-9)).toBe(true);
      });
    }
  });

  it('keeps the original D20 orientations exactly', () => {
    const model = builtInDieModel('d20');
    for (const value of model.values as number[]) {
      expect(model.orientations(value, [])[0]).toEqual(d20FaceFrame(value as never).orientation);
    }
  });

  it('reads the D4 at the top corner of the front face; each value has three equivalent poses', () => {
    const model = builtInDieModel('d4');
    expect(getDieInfo('d4').reading).toBe('vertex');
    const body = model.bodies[0]!;
    for (const value of [1, 2, 3, 4]) {
      const poses = body.poses.filter((pose) => pose.value === value);
      expect(poses).toHaveLength(3);
      for (const pose of poses) {
        const face = frontFace(model, pose.orientation);
        const corners = face.corners.map((corner) => rotateVector(pose.orientation, subtract(corner, face.centroid)));
        const top = corners.reduce((best, corner) => (corner[1] > best[1] ? corner : best));
        expect(top[0]).toBeCloseTo(0, 9);
        // The upright label sits at that top corner and shows the value.
        const upright = face.labels.find((label) => near(rotateVector(pose.orientation, label.up), [0, 1, 0], 1e-9));
        expect(upright?.key).toBe(String(value));
        expect(face.labels).toHaveLength(3);
      }
    }
  });

  it('DF has two faces each of −1, blank 0 and +1 and picks the nearest equivalent face deterministically', () => {
    const info = getDieInfo('df');
    expect(info.values).toEqual([-1, 0, 1]);
    expect(info.faces.map((face) => [face.value, face.label])).toEqual([
      [1, '+'], [1, '+'], [0, ''], [0, ''], [-1, '−'], [-1, '−'],
    ]);
    expect([-1, 0, 1].map((value) => info.format(value as never))).toEqual(['−1', '0', '+1']);
    const model = builtInDieModel('df');
    const body = model.bodies[0]!;
    // Opposite faces: + with −, blank with blank.
    for (const face of body.faces) {
      const opposite = body.faces.find((other) => dot(other.normal, face.normal) < -0.999)!;
      expect((face.value as number) + (opposite.value as number)).toBe(0);
    }
    for (const value of [-1, 0, 1]) {
      const poses = body.poses.filter((pose) => pose.value === value).map((pose) => pose.orientation);
      expect(poses).toHaveLength(2);
      expect(model.orientations(value, [])[0]).toEqual(poses[0]);
      for (const pose of poses) {
        expect(model.orientations(value, [pose])[0]).toEqual(pose);
        expect(model.orientations(value, [pose])[0]).toEqual(model.orientations(value, [pose])[0]);
      }
    }
    // A blank face shows no label at all.
    expect(body.faces.filter((face) => face.labels.length === 0)).toHaveLength(2);
  });

  it('D100 maps results to a tens die (00–90) and a units die (0–9); 00 + 0 is 100', () => {
    const info = getDieInfo('d100');
    expect(info.reading).toBe('pair');
    expect(info.values).toHaveLength(100);
    expect(info.values[0]).toBe(1);
    expect(info.values[99]).toBe(100);
    const cases: [number, string, string][] = [
      [1, '00', '1'], [9, '00', '9'], [10, '10', '0'], [11, '10', '1'], [37, '30', '7'], [90, '90', '0'], [99, '90', '9'], [100, '00', '0'],
    ];
    for (const [value, tens, units] of cases) {
      expect(info.labelsFor(value as never)).toEqual([tens, units]);
      expect(info.format(value as never)).toBe(String(value));
    }
    expect(() => info.labelsFor(0 as never)).toThrow(/integer from 1 to 100/);
    expect(info.faces).toHaveLength(20);
    const model = builtInDieModel('d100');
    expect(model.bodies.map((body) => body.offset[0])).toEqual([-0.7, 0.7]);
  });

  it('the tens die shows 00 for 0', () => {
    const info = getDieInfo('d10-tens');
    expect(info.values).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(info.format(0)).toBe('00');
    expect(info.labelsFor(50)).toEqual(['50']);
    expect(info.faces.map((face) => face.label)).toEqual(['10', '20', '30', '40', '50', '60', '70', '80', '90', '00']);
  });

  it('rejects values outside the type before anything changes', () => {
    expect(builtInDieModel('d6').isValue(7)).toBe(false);
    expect(builtInDieModel('d6').isValue('6')).toBe(false);
    expect(builtInDieModel('df').isValue(2)).toBe(false);
    expect(builtInDieModel('d10-tens').isValue(5)).toBe(false);
    expect(builtInDieModel('d10-tens').expected).toBe('one of 0, 10, 20, 30, 40, 50, 60, 70, 80, 90');
    expect(() => resolveDieModel('d13')).toThrow(/type must be one of/);
  });
});

describe('labels and mesh', () => {
  it.each(DIE_TYPES)('%s labels stay inside their face', (type) => {
    const model = builtInDieModel(type);
    for (const body of model.bodies) {
      for (const region of body.regions) {
        const label = region.label;
        if (!label) continue;
        expect(label.size).toBeGreaterThan(0.12);
        // The label center lies inside the region polygon.
        const points = region.points.map((point) => point.position);
        points.forEach((a, i) => {
          const b = points[(i + 1) % points.length]!;
          const normal = normalize(polygonNormal(points));
          const inward = normalize([
            normal[1] * (b[2] - a[2]) - normal[2] * (b[1] - a[1]),
            normal[2] * (b[0] - a[0]) - normal[0] * (b[2] - a[2]),
            normal[0] * (b[1] - a[1]) - normal[1] * (b[0] - a[0]),
          ]);
          expect(dot(subtract(label.center, a), inward)).toBeGreaterThan(0);
        });
      }
    }
  });

  it.each(DIE_TYPES)('%s mesh draws only real face edges (no polygon diagonals)', (type) => {
    const model = builtInDieModel(type);
    const mesh = buildDieMesh(model.bodies, createLabelAtlas(model.atlasLabels));
    let realEdges = 0;
    for (const body of model.bodies) for (const region of body.regions) realEdges += region.boundary.filter(Boolean).length;
    let drawnEdges = 0;
    for (let triangle = 0; triangle < mesh.vertexCount / 3; triangle++) {
      for (let component = 0; component < 3; component++) {
        // An edge is drawn when its barycentric component reaches 0 at the opposite edge.
        const values = [0, 1, 2].map((corner) => mesh.data[(triangle * 3 + corner) * MESH_STRIDE + 6 + component] as number);
        if (Math.min(...values) === 0) drawnEdges++;
      }
    }
    expect(drawnEdges).toBe(realEdges);
    expect(mesh.bodies.reduce((sum, body) => sum + body.count, 0)).toBe(mesh.vertexCount);
  });

  it('underlines labels that read as another label upside down', () => {
    const marked = (type: DieType) => builtInDieModel(type).atlasLabels.filter((label) => label.marker).map((label) => label.key).sort();
    expect(marked('d20')).toEqual(['6', '9']);
    expect(marked('d6')).toEqual([]);
    expect(marked('d120')).toEqual(expect.arrayContaining(['6', '9', '16', '91', '66', '99', '68', '89']));
    expect(marked('d120')).not.toContain('69');
    expect(marked('d100')).toEqual(['6', '9']);
  });
});

describe('skin templates', () => {
  it.each(DIE_TYPES)('%s template has one non-mirrored polygon per face and matches the shipped files', (type) => {
    const info = getDieInfo(type);
    const template = getDieTemplate(type);
    expect(template.id).toBe(info.templateId);
    expect(template.faces).toHaveLength(info.faces.length);
    template.faces.forEach((face, index) => {
      expect(face.index).toBe(index);
      expect(() => validateFacePolygon(face.uv, `face ${index}`, face.uv.length, template.width, template.height)).not.toThrow();
      for (const [u, v] of face.uv) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
    if (type === 'd20') return;
    const json = JSON.parse(readFileSync(`${templatesDir}${template.id}.json`, 'utf8'));
    expect(json.template).toBe(template.id);
    expect(json.width).toBe(template.width);
    expect(json.height).toBe(template.height);
    expect(json.faces.map((face: { uv: unknown }) => face.uv)).toEqual(template.faces.map((face) => face.uv));
    expect(readFileSync(`${templatesDir}${template.id}.svg`, 'utf8')).toBe(createDieTemplateSvg(type));
  });

  it('keeps grid faces upright: the label top points to image up', () => {
    for (const type of ['d6', 'd10', 'd30', 'df'] as const) {
      for (const face of getDieTemplate(type).faces) for (const label of face.labels) expect(label.rotation).toBeCloseTo(0, 6);
    }
  });

  const options = (type: DieType) => ({ maxTextureSize: 4096, model: builtInDieModel(type), inspect: fakeInspector });

  it('accepts the type template and rejects layouts made for another shape', () => {
    const d6 = getDieTemplate('d6');
    const source = fakeSource(d6.width, d6.height);
    expect(prepareSkin({ source, layout: 'd6-grid-v1' }, options('d6')).faces).toHaveLength(6);
    expect(() => prepareSkin({ source: fakeSource(2048, 1024), layout: 'd20-net-v1' }, options('d6'))).toThrow(
      /"d20-net-v1" does not fit D6/,
    );
    expect(() => prepareSkin({ source, layout: 'd8-grid-v1' }, options('d6'))).toThrow(/does not fit D6/);
    expect(() => prepareSkin({ source, layout: 'df-grid-v1' }, options('d6'))).toThrow(/does not fit/);
    expect(() => prepareSkin({ source, layout: 'd6-grid-v1' }, options('d20'))).toThrow(/d20-net-v1/);
    expect(() => prepareSkin({ source: fakeSource(100, 100), layout: 'd6-grid-v1' }, options('d6'))).toThrow(/requires a/);
    // The D20 record layout is D20-only.
    expect(() => prepareSkin({ source, layout: { 1: [[0.5, 0], [0, 1], [1, 1]] } }, options('d6'))).toThrow(/array of 6 UV polygons/);
  });

  it('accepts explicit polygons per face and rejects wrong counts, mirrored and folded polygons', () => {
    const square = [[0.1, 0.1], [0.1, 0.9], [0.9, 0.9], [0.9, 0.1]];
    const layout = Array.from({ length: 6 }, () => square);
    const source = fakeSource(512, 512);
    expect(prepareSkin({ source, layout, numbers: 'in-texture' }, options('d6')).faces[5]).toEqual(square);
    expect(() => prepareSkin({ source, layout: layout.slice(1) }, options('d6'))).toThrow(/6 UV polygons/);
    expect(() => prepareSkin({ source, layout: [...layout.slice(1), [...square].reverse()] }, options('d6'))).toThrow(
      /mirrored/,
    );
    expect(() => prepareSkin({ source, layout: [...layout.slice(1), square.slice(0, 3)] }, options('d6'))).toThrow(
      /must list 4 UV points/,
    );
    const bowtie = [[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]];
    expect(() => prepareSkin({ source, layout: [...layout.slice(1), bowtie] }, options('d6'))).toThrow(/mirrored|convex/);
  });
});

describe('custom dice', () => {
  it('supports repeated outcomes, string results, symbols and blank faces on built-in shapes', () => {
    const star: DieSymbol = { strokes: [[[0.5, 0], [0.8, 1], [0, 0.35], [1, 0.35], [0.2, 1], [0.5, 0]]] };
    const definition = defineDie({
      id: 'hit-dice',
      name: 'Hit die',
      shape: 'd6',
      faces: [
        { value: 'hit', label: star },
        { value: 'hit', label: star },
        { value: 'crit', label: '++' },
        { value: 'miss', label: null },
        { value: 'miss', label: '' },
        { value: 'miss', label: '-' },
      ],
    });
    expect(Object.isFrozen(definition.faces[0])).toBe(true);
    const info = getDieInfo(definition);
    expect(info.type).toBe('hit-dice');
    expect(info.values).toEqual(['hit', 'crit', 'miss']);
    expect(info.defaultValue).toBe('hit');
    expect(info.templateId).toBe('hit-dice-grid-v1');
    expect(info.labelsFor('crit')).toEqual(['++']);
    const model = resolveDieModel(definition);
    expect(model.atlasLabels.map((label) => label.key)).toEqual(['symbol:0', '++', '-']);
    const hits = model.bodies[0]!.poses.filter((pose) => pose.value === 'hit');
    expect(hits).toHaveLength(2);
    expect(model.orientations('hit', [hits[1]!.orientation])[0]).toEqual(hits[1]!.orientation);
    expect(getDieTemplate(definition).faces).toHaveLength(6);
    expect(createDieTemplateSvg(definition)).toContain('id="number-0-0"');
  });

  it('builds other side counts from prisms and trapezohedra', () => {
    const d9 = getDieInfo(defineDie({ id: 'd9', shape: { prism: 9 }, faces: Array.from({ length: 9 }, (_, i) => ({ value: i + 1 })) }));
    expect(d9.values).toHaveLength(9);
    expect(d9.shape).toBe('prism 9');
    const d18 = resolveDieModel(defineDie({ id: 'd18', shape: { trapezohedron: 9 }, faces: Array.from({ length: 18 }, (_, i) => ({ value: i + 1 })) }));
    expect(d18.faces).toHaveLength(18);
    for (const value of d18.values) {
      const orientation = d18.orientations(value, [])[0]!;
      expect(frontFace(d18, orientation).value).toBe(value);
    }
  });

  it('validates definitions with clear errors', () => {
    const faces = Array.from({ length: 6 }, (_, i) => ({ value: i + 1 }));
    expect(() => defineDie({ id: 'Bad Id', shape: 'd6', faces })).toThrow(/definition.id/);
    expect(() => defineDie({ id: 'd6', shape: 'd6', faces })).toThrow(/reserved/);
    expect(() => defineDie({ id: 'x', shape: 'd9' as never, faces })).toThrow(/shape must be one of/);
    expect(() => defineDie({ id: 'x', shape: { prism: 2 }, faces })).toThrow(/shape must be/);
    expect(() => defineDie({ id: 'x', shape: 'd8', faces })).toThrow(/8 entries/);
    expect(() => defineDie({ id: 'x', shape: 'd6', faces: [...faces.slice(1), { value: 6, label: 'abc' }] })).toThrow(/at most 4 characters/);
    expect(() => defineDie({ id: 'x', shape: 'd6', faces: [...faces.slice(1), { value: 6, label: { strokes: [[[0, 0], [2, 2]]] } }] })).toThrow(/0 to 1/);
    expect(() => defineDie({ id: 'x', shape: 'd6', faces: [...faces.slice(1), { value: Number.NaN }] })).toThrow(/finite number/);
    expect(() => getDieInfo('d9' as never)).toThrow(/type must be one of/);
  });

  it('accepts D4-shaped custom dice with corner results', () => {
    const info = getDieInfo(defineDie({ id: 'arrows', shape: 'd4', faces: [{ value: 1 }, { value: 1 }, { value: 2 }, { value: 3 }] }));
    expect(info.reading).toBe('vertex');
    expect(info.values).toEqual([1, 2, 3]);
    expect(info.faces).toHaveLength(4);
  });
});

describe('angles', () => {
  it('repeated outcomes resolve to the closest pose', () => {
    const model = builtInDieModel('d4');
    const poses = model.bodies[0]!.poses.filter((pose) => pose.value === 2);
    for (const pose of poses) {
      const chosen = model.orientations(2, [pose.orientation])[0]!;
      expect(angleBetween(chosen, pose.orientation)).toBeLessThan(1e-6);
    }
  });
});
