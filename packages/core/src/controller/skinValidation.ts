import { invalidArgument } from '../errors.js';
import { D20_NET_V1 } from '../geometry/d20NetV1.js';
import type { PreparedSkin, SkinSourceKind } from '../renderer/renderer.js';
import type { D20Value, FaceUV, UV } from '../types.js';

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

/**
 * Validates one face triangle. Coordinates are normalized with (0, 0) at the
 * top-left. A/B/C must appear counter-clockwise on screen (A top, B
 * bottom-left, C bottom-right); clockwise triangles would mirror the artwork
 * and are rejected.
 */
export function validateFaceUV(value: unknown, label: string, width: number, height: number): FaceUV {
  if (!Array.isArray(value) || value.length !== 3) throw invalidArgument(`${label} must list three UV points (A, B, C)`);
  const [a, b, c] = (value as unknown[]).map((point, index) => validateUV(point, `${label}[${index}]`)) as [UV, UV, UV];
  // Twice the signed area in pixel space with y pointing down: negative means counter-clockwise on screen.
  const signedArea2 =
    ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * width * height;
  if (Math.abs(signedArea2) / 2 < MIN_TRIANGLE_AREA_PX) throw invalidArgument(`${label} is a degenerate triangle`);
  if (signedArea2 > 0) {
    throw invalidArgument(`${label} is mirrored: list A (top), B (bottom-left), C (bottom-right) counter-clockwise`);
  }
  return Object.freeze([a, b, c]) as unknown as FaceUV;
}

export interface PrepareSkinOptions {
  readonly maxTextureSize: number;
  readonly values: readonly D20Value[];
  readonly inspect?: SourceInspector;
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

  let faces: FaceUV[];
  if (layout === D20_NET_V1.id) {
    const ratio = info.width / info.height;
    if (Math.abs(ratio / D20_NET_V1.aspectRatio - 1) > D20_NET_V1.aspectTolerance) {
      throw invalidArgument(
        `The d20-net-v1 layout requires a ${D20_NET_V1.aspectRatio}:1 image, received ${info.width}×${info.height}px`,
      );
    }
    faces = options.values.map((value) => D20_NET_V1.faces[value]);
  } else if (isRecord(layout)) {
    const allowed = new Set(options.values.map(String));
    for (const key of Object.keys(layout)) {
      if (!allowed.has(key)) throw invalidArgument(`skin.layout has an unexpected key "${key}"`);
    }
    faces = options.values.map((value) => {
      if (!(String(value) in layout)) throw invalidArgument(`skin.layout is missing face ${value}`);
      return validateFaceUV(layout[String(value)], `skin.layout[${value}]`, info.width, info.height);
    });
  } else {
    throw invalidArgument('skin.layout must be "d20-net-v1" or a record of UV triangles for values 1–20');
  }

  return {
    source: source as TexImageSource,
    width: info.width,
    height: info.height,
    faces: Object.freeze(faces),
    numbers,
  };
}
