import { invalidArgument } from '../errors.js';
import { isD20Value } from '../geometry/d20.js';
import { MOTION_MODES } from '../animation/motion.js';
import { isHexColor } from '../renderer/color.js';
import type { ResolvedTheme } from '../renderer/renderer.js';
import type { AnimationOptions, D20Options, D20Theme, D20Value, MotionMode } from '../types.js';

/** Default appearance: ivory body, dark edges and numbers, transparent background. */
export const D20_DEFAULT_THEME: Readonly<D20Theme> = Object.freeze({
  bodyColor: '#f2ede4',
  edgeColor: '#4a443c',
  numberColor: '#1d1b18',
  background: 'transparent',
});

export const DEFAULT_THEME: ResolvedTheme = D20_DEFAULT_THEME;

export const DEFAULT_MAX_PIXEL_RATIO = 2;

const THEME_KEYS = ['bodyColor', 'edgeColor', 'numberColor', 'background'] as const;

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertD20Value(value: unknown, name = 'value'): asserts value is D20Value {
  if (!isD20Value(value)) {
    throw invalidArgument(`${name} must be an integer from 1 to 20, received ${describe(value)}`);
  }
}

export function assertMotionMode(mode: unknown): asserts mode is MotionMode {
  if (!MOTION_MODES.includes(mode as MotionMode)) {
    throw invalidArgument(`motion must be one of ${MOTION_MODES.join(', ')}, received ${describe(mode)}`);
  }
}

function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) return true;
  return (
    isPlainObject(value) &&
    typeof value.aborted === 'boolean' &&
    typeof value.addEventListener === 'function' &&
    typeof value.removeEventListener === 'function'
  );
}

export interface ValidatedAnimationOptions {
  readonly durationMs: number | undefined;
  readonly signal: AbortSignal | undefined;
}

export function validateAnimationOptions(options: unknown): ValidatedAnimationOptions {
  if (options === undefined) return { durationMs: undefined, signal: undefined };
  if (!isPlainObject(options)) throw invalidArgument('Animation options must be an object');
  const { durationMs, signal } = options as AnimationOptions;
  if (durationMs !== undefined && (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0)) {
    throw invalidArgument(`durationMs must be a finite number >= 0, received ${describe(durationMs)}`);
  }
  if (signal !== undefined && !isAbortSignal(signal)) throw invalidArgument('signal must be an AbortSignal');
  return { durationMs, signal };
}

/** Validates a partial theme and merges it onto `base`. Unknown keys are ignored. */
export function mergeTheme(base: ResolvedTheme, theme: unknown): ResolvedTheme {
  if (!isPlainObject(theme)) throw invalidArgument('theme must be an object');
  const next: Record<string, string> = { ...base };
  for (const key of THEME_KEYS) {
    const color = (theme as Partial<D20Theme>)[key];
    if (color === undefined) continue;
    const valid = isHexColor(color) || (key === 'background' && color === 'transparent');
    if (!valid) {
      const expected = key === 'background' ? '"#RRGGBB" or "transparent"' : '"#RRGGBB"';
      throw invalidArgument(`theme.${key} must be ${expected}, received ${describe(color)}`);
    }
    next[key] = color;
  }
  return Object.freeze(next) as unknown as ResolvedTheme;
}

export interface ValidatedOptions {
  readonly value: D20Value;
  readonly theme: ResolvedTheme;
  readonly motion: MotionMode;
  readonly maxPixelRatio: number;
  readonly skin: unknown;
}

/** Validates everything except the skin (which needs a live context for its size limit). */
export function validateD20Options(options: unknown): ValidatedOptions {
  if (options === undefined) options = {};
  if (!isPlainObject(options)) throw invalidArgument('options must be an object');
  const { value = 20, theme, motion = 'system', maxPixelRatio = DEFAULT_MAX_PIXEL_RATIO, skin } = options as D20Options;
  assertD20Value(value, 'options.value');
  assertMotionMode(motion);
  if (typeof maxPixelRatio !== 'number' || !Number.isFinite(maxPixelRatio) || maxPixelRatio < 1) {
    throw invalidArgument(`maxPixelRatio must be a finite number >= 1, received ${describe(maxPixelRatio)}`);
  }
  return {
    value,
    theme: theme === undefined ? DEFAULT_THEME : mergeTheme(DEFAULT_THEME, theme),
    motion,
    maxPixelRatio,
    skin,
  };
}
