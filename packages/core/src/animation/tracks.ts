import { easeInOutCubic, easeOutCubic } from './easing.js';
import { fromAxisAngle, multiply, normalizeQuat, slerp, type Quat } from './quaternion.js';
import { lerp, type Vec3 } from './vector.js';

/** Transform applied to the die model. */
export interface Pose {
  readonly rotation: Quat;
  /** Translation in model units (used for the hop). */
  readonly offset: Vec3;
}

export const REST_OFFSET: Vec3 = [0, 0, 0];

export function restPose(rotation: Quat): Pose {
  return { rotation, offset: REST_OFFSET };
}

/** A time-parameterized animation from a start pose to a target orientation. */
export interface Track {
  readonly kind: 'orient' | 'roll';
  readonly durationMs: number;
  readonly target: Quat;
  /** Pose at `elapsedMs` (clamped to the duration). The final pose is always the target at rest. */
  sample(elapsedMs: number): Pose;
}

/** Shortest-path rotation to the target; also settles any hop offset. */
export function createOrientTrack(from: Pose, target: Quat, durationMs: number): Track {
  return {
    kind: 'orient',
    durationMs,
    target,
    sample(elapsedMs) {
      if (durationMs <= 0 || elapsedMs >= durationMs) return restPose(target);
      const t = easeInOutCubic(elapsedMs / durationMs);
      return { rotation: slerp(from.rotation, target, t), offset: lerp(from.offset, REST_OFFSET, t) };
    },
  };
}

export interface RollTrackOptions {
  /** Deterministic variation index; different values tumble around different axes. */
  readonly variant: number;
  /** Peak hop height in model units. */
  readonly hopHeight?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Number of full spins for a roll of the given duration (1–3). */
export function rollTurns(durationMs: number): number {
  return Math.max(1, Math.min(3, Math.round(durationMs / 550)));
}

/** Two decaying arcs: the main hop and a small bounce, then rest. */
export function hopProfile(t: number): number {
  if (t <= 0 || t >= 0.86) return 0;
  if (t < 0.6) {
    const x = t / 0.6;
    return 4 * x * (1 - x);
  }
  const x = (t - 0.6) / 0.26;
  return 0.22 * 4 * x * (1 - x);
}

/**
 * Artistic roll: a separate spin segment (whole turns around a tilted axis,
 * decelerating) is composed with the shortest-path settle. Because the spin is
 * parameterized by angle instead of interpolated between orientations, full
 * turns are preserved and the track still ends exactly on the target.
 */
export function createRollTrack(from: Pose, target: Quat, durationMs: number, options: RollTrackOptions): Track {
  const turns = rollTurns(durationMs);
  const phi = options.variant * GOLDEN_ANGLE + 0.7;
  const axis: Vec3 = [Math.cos(phi), Math.sin(phi), 0.35];
  const hopHeight = options.hopHeight ?? 0.26;
  return {
    kind: 'roll',
    durationMs,
    target,
    sample(elapsedMs) {
      if (durationMs <= 0 || elapsedMs >= durationMs) return restPose(target);
      const t = elapsedMs / durationMs;
      const settle = slerp(from.rotation, target, easeInOutCubic(t));
      const spinAngle = turns * 2 * Math.PI * (1 - easeOutCubic(t));
      const rotation = normalizeQuat(multiply(fromAxisAngle(axis, spinAngle), settle));
      const base = lerp(from.offset, REST_OFFSET, easeOutCubic(t));
      return { rotation, offset: [base[0], base[1] + hopHeight * hopProfile(t), base[2]] };
    },
  };
}
