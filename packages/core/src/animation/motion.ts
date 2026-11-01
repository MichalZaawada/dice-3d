import type { MotionMode } from '../types.js';

export type EffectiveMotion = 'full' | 'reduced' | 'none';

export const MOTION_MODES: readonly MotionMode[] = ['system', 'full', 'reduced', 'none'];

/** Maximum transition length in `reduced` mode. */
export const REDUCED_MOTION_MAX_MS = 150;

export const DEFAULT_ORIENT_DURATION_MS = 450;
export const DEFAULT_ROLL_DURATION_MS = 1200;

export function resolveMotion(mode: MotionMode, prefersReducedMotion: boolean): EffectiveMotion {
  if (mode === 'system') return prefersReducedMotion ? 'reduced' : 'full';
  return mode;
}
