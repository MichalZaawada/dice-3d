import { invalidArgument } from '../errors.js';
import { D20_NET_V1 } from '../geometry/d20NetV1.js';
import type { DieModel } from '../geometry/dice.js';
import { buildTemplate } from '../geometry/template.js';
import type { PreparedSkin, SkinSourceKind } from '../renderer/renderer.js';
import type { DieTemplate, FaceUV, FaceUVPolygon, UV } from '../types.js';

export interface SourceInfo {
  readonly kind: SkinSourceKind;
  readonly width: number;
  readonly height: number;
  readonly decoded: boolean;
}

/** Recognizes supported image sources; injectable for tests outside a browser. */
export type SourceInspector = (source: unknown) => SourceInfo | null;

export const inspectBrowserSource: SourceInspector = (source) => {
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    const width = source.naturalWidth;
    const height = source.naturalHeight;
    return { kind: 'image', width, height, decoded: source.complete && width > 0 && height > 0 };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    // A closed bitmap reports zero dimensions.
    return { kind: 'bitmap', width: source.width, height: source.height, decoded: source.width > 0 && source.height > 0 };
  }
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return { kind: 'canvas', width: source.width, height: source.height, decoded: source.width > 0 && source.height > 0 };
  }
  return null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Smallest accepted triangle area in source pixels. */
const MIN_TRIANGLE_AREA_PX = 1;

function validateUV(value: unknown, label: string): UV {
  if (!Array.isArray(value) || value.length !== 2) throw invalidArgument(`${label} must be a [u, v] pair`);
  const [u, v] = value as unknown[];
  for (const component of [u, v]) {
    if (typeof component !== 'number' || !Number.isFinite(component) || component < 0 || component > 1) {
      throw invalidArgument(`${label} must contain finite numbers from 0 to 1`);
    }
  }
  return Object.freeze([u, v]) as unknown as UV;
}

/** Twice the signed area in pixel space with y pointing down: negative means counter-clockwise on screen. */
function signedArea2(points: readonly UV[], width: number, height: number): number {
  let sum = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    sum += (a[0] * b[1] - b[0] * a[1]) * width * height;
  });
  return sum;
}

/**
 * Validates one face triangle. Coordinates are normalized with (0, 0) at the
 * top-left. A/B/C must appear counter-clockwise on screen (A top, B
 * bottom-left, C bottom-right); clockwise triangles would mirror the artwork
 * and are rejected.
 */
export function validateFaceUV(value: unknown, label: string, width: number, height: number): FaceUV {
  if (!Array.isArray(value) || value.length !== 3) throw invalidArgument(`${label} must list three UV points (A, B, C)`);
  const [a, b, c] = (value as unknown[]).map((point, index) => validateUV(point, `${label}[${index}]`)) as [UV, UV, UV];
  const area2 = signedArea2([a, b, c], width, height);
  if (Math.abs(area2) / 2 < MIN_TRIANGLE_AREA_PX) throw invalidArgument(`${label} is a degenerate triangle`);
  if (area2 > 0) {
    throw invalidArgument(`${label} is mirrored: list A (top), B (bottom-left), C (bottom-right) counter-clockwise`);
  }
  return Object.freeze([a, b, c]) as unknown as FaceUV;
}

/**
 * Validates the UV polygon of a face with `corners` vertices, listed in the
 * face's canonical order and counter-clockwise on screen. Every fan triangle
 * must keep that orientation, so the artwork is neither mirrored nor folded.
 */
export function validateFacePolygon(value: unknown, label: string, corners: number, width: number, height: number): FaceUVPolygon {
  if (corners === 3) return validateFaceUV(value, label, width, height);
  if (!Array.isArray(value) || value.length !== corners) throw invalidArgument(`${label} must list ${corners} UV points`);
  const points = (value as unknown[]).map((point, index) => validateUV(point, `${label}[${index}]`));
  for (let i = 1; i + 1 < points.length; i++) {
    const area2 = signedArea2([points[0]!, points[i]!, points[i + 1]!], width, height);
    if (Math.abs(area2) / 2 < MIN_TRIANGLE_AREA_PX) throw invalidArgument(`${label} is degenerate or not convex`);
    if (area2 > 0) throw invalidArgument(`${label} is mirrored or not convex: list the points counter-clockwise on screen`);
  }
  return Object.freeze(points);
}

export interface PrepareSkinOptions {
  readonly maxTextureSize: number;
  readonly model: DieModel;
  readonly inspect?: SourceInspector;
}

const templates = new WeakMap<DieModel, DieTemplate>();

/** The skin template of a die model (built once). */
export function templateOf(model: DieModel): DieTemplate {
  let template = templates.get(model);
  if (!template) {
    template = buildTemplate(model);
    templates.set(model, template);
  }
  return template;
}

/** Validates a skin without touching the GPU. Throws `INVALID_ARGUMENT`. */
export function prepareSkin(skin: unknown, options: PrepareSkinOptions): PreparedSkin {
  if (!isRecord(skin)) throw invalidArgument('skin must be an object or null');
  const { source, layout, numbers = 'overlay' } = skin;
  if (numbers !== 'overlay' && numbers !== 'in-texture') {
    throw invalidArgument('skin.numbers must be "overlay" or "in-texture"');
  }
  const info = (options.inspect ?? inspectBrowserSource)(source);
  if (!info) throw invalidArgument('skin.source must be an HTMLImageElement, ImageBitmap or HTMLCanvasElement');
  if (!info.decoded || !(info.width > 0) || !(info.height > 0)) {
    throw invalidArgument('skin.source is not decoded or has zero size; await image.decode() before passing it');
  }
  if (info.width > options.maxTextureSize || info.height > options.maxTextureSize) {
    throw invalidArgument(
      `skin.source is ${info.width}×${info.height}px, which exceeds this device's MAX_TEXTURE_SIZE of ${options.maxTextureSize}px`,
    );
  }

  const { model } = options;
  const isD20 = model.templateId === D20_NET_V1.id;
  const expectation = isD20
    ? 'skin.layout must be "d20-net-v1" or a record of UV triangles for values 1–20'
    : `skin.layout must be "${model.templateId}" or an array of ${model.faces.length} UV polygons for ${model.name}`;
  let faces: FaceUVPolygon[];
  if (typeof layout === 'string') {
    if (layout !== model.templateId) {
      throw invalidArgument(`skin.layout "${layout}" does not fit ${model.name}; ${expectation}`);
    }
    const template = templateOf(model);
    const ratio = info.width / info.height;
    if (Math.abs(ratio / template.aspectRatio - 1) > template.aspectTolerance) {
      throw invalidArgument(
        `The ${template.id} layout requires a ${template.aspectRatio}:1 image, received ${info.width}×${info.height}px`,
      );
    }
    faces = template.faces.map((face) => face.uv);
  } else if (Array.isArray(layout)) {
    if (layout.length !== model.faces.length) {
      throw invalidArgument(`skin.layout must list ${model.faces.length} UV polygons for ${model.name}, received ${layout.length}`);
    }
    faces = model.faces.map((face, index) =>
      validateFacePolygon(layout[index], `skin.layout[${index}]`, face.corners.length, info.width, info.height),
    );
  } else if (isD20 && isRecord(layout)) {
    const values = model.values as readonly number[];
    const allowed = new Set(values.map(String));
    for (const key of Object.keys(layout)) {
      if (!allowed.has(key)) throw invalidArgument(`skin.layout has an unexpected key "${key}"`);
    }
    faces = values.map((value) => {
      if (!(String(value) in layout)) throw invalidArgument(`skin.layout is missing face ${value}`);
      return validateFaceUV(layout[String(value)], `skin.layout[${value}]`, info.width, info.height);
    });
  } else {
    throw invalidArgument(expectation);
  }

  return {
    source: source as TexImageSource,
    width: info.width,
    height: info.height,
    faces: Object.freeze(faces),
    numbers,
  };
}
