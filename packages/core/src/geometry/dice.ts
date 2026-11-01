import type { Quat } from '../animation/quaternion.js';
import { dot, normalize, type Vec3 } from '../animation/vector.js';
import { invalidArgument } from '../errors.js';
import { isSupportedText, type SymbolStrokes } from '../renderer/glyphs.js';
import type { AtlasLabel } from '../renderer/numberAtlas.js';
import type { CustomDieDefinition, DieFaceLabel, DieShape, DieType, DieValue } from '../types.js';
import { d20FaceFrames } from './d20.js';
import { atlasLabels, buildBody, nearestPose, type Body, type BodySpec, type LabelContent, type ModelFace } from './model.js';
import {
  coinShape,
  cubeShape,
  disdyakisDodecahedronShape,
  disdyakisTriacontahedronShape,
  dodecahedronShape,
  icosahedronShape,
  octahedronShape,
  pentakisDodecahedronShape,
  polygonNormal,
  prismShape,
  rhombicTriacontahedronShape,
  tetrakisHexahedronShape,
  tetrahedronShape,
  trapezohedronShape,
  type Shape,
} from './shapes.js';

/** Internal description of a die type; everything the controller, renderer and skins need. */
export interface DieModel {
  readonly type: string;
  readonly name: string;
  readonly shape: string;
  readonly reading: 'face' | 'vertex' | 'pair';
  readonly values: readonly DieValue[];
  readonly defaultValue: DieValue;
  readonly bodies: readonly Body[];
  /** Faces of all bodies in global order. */
  readonly faces: readonly ModelFace[];
  readonly atlasLabels: readonly AtlasLabel[];
  readonly templateId: string;
  /** Wording for error messages, e.g. "an integer from 1 to 6". */
  readonly expected: string;
  isValue(value: unknown): boolean;
  /** Target rotation of every body; repeated outcomes pick the pose nearest to `current`. */
  orientations(value: DieValue, current: readonly Quat[]): readonly Quat[];
  /** The label(s) shown for a value, one per body. */
  labelsFor(value: DieValue): readonly string[];
  format(value: DieValue): string;
}

const MINUS = '−';

/** Built-in die types in display order. */
export const DIE_TYPES: readonly DieType[] = [
  'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd12', 'd14', 'd16', 'd20', 'd24', 'd30', 'd48', 'd60', 'd120',
  'd100', 'd10-tens', 'df',
];

interface ShapeInfo {
  readonly name: string;
  readonly build: () => Shape;
}

const SHAPES: Readonly<Record<string, ShapeInfo>> = {
  d2: { name: 'coin', build: () => coinShape() },
  d3: { name: 'triangular prism', build: () => prismShape(3) },
  d4: { name: 'tetrahedron', build: tetrahedronShape },
  d5: { name: 'pentagonal prism', build: () => prismShape(5) },
  d6: { name: 'cube', build: cubeShape },
  d7: { name: 'heptagonal prism', build: () => prismShape(7) },
  d8: { name: 'octahedron', build: octahedronShape },
  d10: { name: 'pentagonal trapezohedron', build: () => trapezohedronShape(5) },
  d12: { name: 'dodecahedron', build: dodecahedronShape },
  d14: { name: 'heptagonal trapezohedron', build: () => trapezohedronShape(7) },
  d16: { name: 'octagonal trapezohedron', build: () => trapezohedronShape(8) },
  d20: { name: 'icosahedron', build: icosahedronShape },
  d24: { name: 'tetrakis hexahedron', build: tetrakisHexahedronShape },
  d30: { name: 'rhombic triacontahedron', build: rhombicTriacontahedronShape },
  d48: { name: 'disdyakis dodecahedron', build: disdyakisDodecahedronShape },
  d60: { name: 'pentakis dodecahedron', build: pentakisDodecahedronShape },
  d120: { name: 'disdyakis triacontahedron', build: disdyakisTriacontahedronShape },
};

/** Names accepted by `CustomDieDefinition.shape` as strings. */
export const DIE_SHAPES = Object.freeze(Object.keys(SHAPES)) as readonly Extract<DieShape, string>[];

const round = (n: number) => Math.round(n * 1e6);

/**
 * Orders the faces so that face i shows value i + 1 under the built-in numbering:
 * opposite faces sum to N + 1, alternating low and high values from the top down.
 * Shapes without opposite faces keep their (sequential) order.
 */
export function numberedShape(shape: Shape): Shape {
  if (shape.reading === 'vertex' || shape.numbering === 'sequential') return shape;
  const normals = shape.faces.map((face) => normalize(polygonNormal(face.vertices.map((index) => shape.vertices[index] as Vec3))));
  const opposite =
    shape.opposite ?? normals.map((n, i) => normals.findIndex((m, j) => j !== i && dot(n, m) < -1 + 1e-6));
  if (opposite.some((index) => index < 0)) return shape;
  const azimuth = ([x, y]: Vec3) => {
    const angle = Math.atan2(y, x);
    return round(angle < -1e-9 ? angle + 2 * Math.PI : Math.max(0, angle));
  };
  const order = normals
    .map((normal, index) => ({ index, z: round(normal[2]), azimuth: azimuth(normal) }))
    .sort((a, b) => b.z - a.z || a.azimuth - b.azimuth || a.index - b.index)
    .map((entry) => entry.index);
  const values: number[] = [];
  let low = 1;
  let high = shape.faces.length;
  let pair = 0;
  for (const index of order) {
    if (values[index] !== undefined) continue;
    const other = opposite[index] as number;
    if (pair % 2 === 0) {
      values[index] = low++;
      values[other] = high--;
    } else {
      values[index] = high--;
      values[other] = low++;
    }
    pair++;
  }
  const faces = shape.faces.map((face, index) => ({ face, value: values[index] as number })).sort((a, b) => a.value - b.value);
  return { ...shape, faces: faces.map(({ face }) => face), opposite: undefined };
}

const shapeCache = new Map<string, Shape>();

function canonicalShape(key: string): Shape {
  let shape = shapeCache.get(key);
  if (!shape) {
    const prism = /^prism-(\d+)$/.exec(key);
    const trapezohedron = /^trapezohedron-(\d+)$/.exec(key);
    const built = prism
      ? prismShape(Number(prism[1]))
      : trapezohedron
        ? trapezohedronShape(Number(trapezohedron[1]))
        : SHAPES[key]!.build();
    shape = key === 'd20' ? built : numberedShape(built);
    shapeCache.set(key, shape);
  }
  return shape;
}

function resultCount(shape: Shape): number {
  return shape.reading === 'vertex' ? shape.vertices.length : shape.faces.length;
}

const text = (value: string): LabelContent => (value === '' ? null : { text: value });

function describeChoices(values: readonly DieValue[]): string {
  const numeric = values.every((value) => typeof value === 'number');
  if (numeric) {
    const sorted = [...(values as number[])].sort((a, b) => a - b);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (sorted.every((value, index) => value === first + index) && Number.isInteger(first)) {
      return `an integer from ${first} to ${last}`;
    }
  }
  const shown = values.slice(0, 12).map((value) => (typeof value === 'string' ? JSON.stringify(value) : String(value)));
  return `one of ${shown.join(', ')}${values.length > 12 ? ', …' : ''}`;
}

function uniqueValues(values: readonly DieValue[]): DieValue[] {
  const unique: DieValue[] = [];
  for (const value of values) if (!unique.includes(value)) unique.push(value);
  return unique;
}

interface ModelConfig {
  readonly type: string;
  readonly name: string;
  readonly shape: string;
  readonly bodies: readonly BodySpec[];
  readonly templateId: string;
  readonly values?: readonly DieValue[];
  readonly split?: (value: DieValue) => readonly DieValue[];
  readonly format?: (value: DieValue) => string;
  readonly defaultValue?: DieValue;
}

function createModel(config: ModelConfig): DieModel {
  let firstFace = 0;
  const bodies = config.bodies.map((spec) => {
    const body = buildBody(spec, firstFace);
    firstFace += body.faces.length;
    return body;
  });
  const single = bodies.length === 1;
  const values = config.values ?? uniqueValues(config.bodies[0]!.results.map((result) => result.value as DieValue));
  const isValue = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && values.includes(value);
  const split = config.split ?? ((value: DieValue) => [value]);
  const labelOf = (body: BodySpec, value: DieValue) => {
    const label = body.results.find((result) => result.value === value)?.label;
    return label ? ('text' in label ? label.text : label.key) : '';
  };
  const reading = single ? (config.bodies[0]!.shape.reading) : 'pair';
  const sortedValues = values.every((value) => typeof value === 'number')
    ? [...(values as number[])].sort((a, b) => a - b)
    : values;
  return {
    type: config.type,
    name: config.name,
    shape: config.shape,
    reading,
    values: Object.freeze(sortedValues),
    defaultValue: config.defaultValue ?? sortedValues[sortedValues.length - 1]!,
    bodies,
    faces: bodies.flatMap((body) => body.faces),
    atlasLabels: atlasLabels(bodies),
    templateId: config.templateId,
    expected: describeChoices(sortedValues),
    isValue,
    orientations(value, current) {
      const parts = split(value);
      return bodies.map((body, index) => nearestPose(body, parts[index], current[index]));
    },
    labelsFor(value) {
      const parts = split(value);
      return config.bodies.map((body, index) => labelOf(body, parts[index] as DieValue));
    },
    format: config.format ?? ((value) => (single ? labelOf(config.bodies[0]!, value) || String(value) : String(value))),
  };
}

function numericResults(count: number, label: (value: number) => string = String) {
  return Array.from({ length: count }, (_, index) => ({ value: index + 1, label: text(label(index + 1)) }));
}

const formatSigned = (value: DieValue) => (value === 0 ? '0' : (value as number) > 0 ? `+${value}` : `${MINUS}${-(value as number)}`);

function builtInModel(type: DieType): DieModel {
  const templateId = type === 'd20' ? 'd20-net-v1' : `${type}-grid-v1`;
  switch (type) {
    case 'df': {
      // Opposite faces of the cube: (+, −), (+, −), (blank, blank).
      const labels: [number, string][] = [[1, '+'], [1, '+'], [0, ''], [0, ''], [-1, MINUS], [-1, MINUS]];
      return createModel({
        type,
        name: 'Fudge/Fate DF',
        shape: SHAPES.d6!.name,
        templateId,
        bodies: [{ shape: canonicalShape('d6'), results: labels.map(([value, label]) => ({ value, label: text(label) })) }],
        format: formatSigned,
        defaultValue: 1,
      });
    }
    case 'd10-tens':
      return createModel({
        type,
        name: 'Percentile tens D10',
        shape: SHAPES.d10!.name,
        templateId,
        bodies: [{ shape: canonicalShape('d10'), results: tensResults() }],
        format: (value) => tensLabel(value as number),
        defaultValue: 0,
      });
    case 'd100':
      return createModel({
        type,
        name: 'Percentile D100',
        shape: 'two pentagonal trapezohedra',
        templateId,
        bodies: [
          { shape: canonicalShape('d10'), results: tensResults(), offset: [-0.7, 0, 0], scale: 0.64 },
          {
            shape: canonicalShape('d10'),
            results: Array.from({ length: 10 }, (_, index) => ({ value: (index + 1) % 10, label: text(String((index + 1) % 10)) })),
            offset: [0.7, 0, 0],
            scale: 0.64,
          },
        ],
        values: Array.from({ length: 100 }, (_, index) => index + 1),
        split: (value) => [Math.floor(((value as number) % 100) / 10) * 10, (value as number) % 10],
      });
    default: {
      const shape = canonicalShape(type);
      const model = createModel({
        type,
        name: type.toUpperCase(),
        shape: SHAPES[type]!.name,
        templateId,
        bodies: [{ shape, results: numericResults(resultCount(shape)), ...(type === 'd20' ? { labelSize: 0.5 } : {}) }],
      });
      if (type === 'd20') {
        // Keep the exact orientations of the original D20 frames.
        const frames = d20FaceFrames();
        const body = model.bodies[0]!;
        (body as { poses: Body['poses'] }).poses = frames.map((frame) => ({ value: frame.value, orientation: frame.orientation }));
      }
      return model;
    }
  }
}

function tensLabel(value: number): string {
  return value === 0 ? '00' : String(value);
}

function tensResults() {
  return Array.from({ length: 10 }, (_, index) => {
    const value = ((index + 1) % 10) * 10;
    return { value, label: text(tensLabel(value)) };
  });
}

const builtInCache = new Map<string, DieModel>();

export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && (DIE_TYPES as readonly string[]).includes(value);
}

export function builtInDieModel(type: DieType): DieModel {
  let model = builtInCache.get(type);
  if (!model) {
    model = builtInModel(type);
    builtInCache.set(type, model);
  }
  return model;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function shapeKey(shape: unknown): string {
  if (typeof shape === 'string' && shape in SHAPES) return shape;
  if (isRecord(shape)) {
    const { prism, trapezohedron } = shape;
    if (prism !== undefined && trapezohedron === undefined && Number.isInteger(prism) && (prism as number) >= 3 && (prism as number) <= 24) {
      return `prism-${prism as number}`;
    }
    if (trapezohedron !== undefined && prism === undefined && Number.isInteger(trapezohedron) && (trapezohedron as number) >= 3 && (trapezohedron as number) <= 24) {
      return `trapezohedron-${trapezohedron as number}`;
    }
  }
  throw invalidArgument(
    `shape must be one of ${DIE_SHAPES.join(', ')}, { prism: 3–24 } or { trapezohedron: 3–24 }`,
  );
}

function validateSymbol(value: Record<string, unknown>, label: string): SymbolStrokes {
  const { strokes } = value;
  if (!Array.isArray(strokes) || strokes.length === 0 || strokes.length > 64) {
    throw invalidArgument(`${label}.strokes must be a non-empty array of polylines`);
  }
  return Object.freeze({
    strokes: Object.freeze(
      strokes.map((line, i) => {
        if (!Array.isArray(line) || line.length < 2 || line.length > 256) {
          throw invalidArgument(`${label}.strokes[${i}] must list 2 to 256 points`);
        }
        return Object.freeze(
          line.map((point: unknown) => {
            if (
              !Array.isArray(point) ||
              point.length !== 2 ||
              !point.every((c) => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1)
            ) {
              throw invalidArgument(`${label}.strokes[${i}] must contain [x, y] points from 0 to 1`);
            }
            return Object.freeze([point[0], point[1]]) as readonly [number, number];
          }),
        );
      }),
    ),
  });
}

function validateLabel(label: unknown, value: DieValue, name: string, symbolKey: (strokes: unknown) => string): LabelContent {
  if (label === undefined) label = String(value);
  if (label === null || label === '') return null;
  if (typeof label === 'string') {
    if ([...label].length > 4 || !isSupportedText(label)) {
      throw invalidArgument(
        `${name} must use at most 4 characters from 0–9, + and − (draw other symbols with { strokes }), received ${JSON.stringify(label)}`,
      );
    }
    return { text: label };
  }
  if (isRecord(label)) {
    const symbol = validateSymbol(label, name);
    return { key: symbolKey(symbol.strokes), symbol };
  }
  throw invalidArgument(`${name} must be a string, null or { strokes }`);
}

const customCache = new WeakMap<object, DieModel>();

/** Validates a custom definition and builds (and caches) its model. */
export function customDieModel(definition: unknown): DieModel {
  if (isRecord(definition)) {
    const cached = customCache.get(definition);
    if (cached) return cached;
  }
  if (!isRecord(definition)) throw invalidArgument('type must be a built-in die type or a custom die definition');
  const { id, name, shape, faces } = definition as Partial<CustomDieDefinition> & Record<string, unknown>;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw invalidArgument('definition.id must be 1–64 lowercase letters, digits or dashes');
  }
  if (isDieType(id)) throw invalidArgument(`definition.id "${id}" is reserved for a built-in die`);
  if (name !== undefined && (typeof name !== 'string' || name.length > 80)) throw invalidArgument('definition.name must be a string');
  const key = shapeKey(shape);
  const geometry = canonicalShape(key);
  const count = resultCount(geometry);
  if (!Array.isArray(faces) || faces.length !== count) {
    throw invalidArgument(
      `definition.faces must list ${count} entries for shape ${typeof shape === 'string' ? shape : JSON.stringify(shape)}`,
    );
  }
  // Identical symbols share one atlas cell.
  const symbolKeys = new Map<string, string>();
  const symbolKey = (strokes: unknown) => {
    const json = JSON.stringify(strokes);
    if (!symbolKeys.has(json)) symbolKeys.set(json, `symbol:${symbolKeys.size}`);
    return symbolKeys.get(json)!;
  };
  const results = (faces as unknown[]).map((face, index) => {
    const label = `definition.faces[${index}]`;
    if (!isRecord(face)) throw invalidArgument(`${label} must be an object`);
    const value = face.value as DieValue;
    if (!((typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length > 0 && value.length <= 64))) {
      throw invalidArgument(`${label}.value must be a finite number or a non-empty string`);
    }
    const normalizedValue = Object.is(value, -0) ? 0 : value;
    return {
      value: normalizedValue,
      label: validateLabel(face.label as DieFaceLabel | undefined, normalizedValue, `${label}.label`, symbolKey),
    };
  });
  const model = createModel({
    type: id,
    name: name ?? id,
    shape: key.startsWith('prism-') || key.startsWith('trapezohedron-') ? key.replace('-', ' ') : SHAPES[key]!.name,
    templateId: `${id}-grid-v1`,
    bodies: [{ shape: geometry, results }],
    defaultValue: results[0]!.value,
  });
  customCache.set(definition, model);
  return model;
}

/** Resolves `options.type`: a built-in type name or a custom definition. */
export function resolveDieModel(type: unknown): DieModel {
  if (typeof type === 'string') {
    if (isDieType(type)) return builtInDieModel(type);
    throw invalidArgument(`type must be one of ${DIE_TYPES.join(', ')} or a custom die definition, received ${JSON.stringify(type)}`);
  }
  return customDieModel(type);
}
