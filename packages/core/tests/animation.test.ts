import { describe, expect, it } from 'vitest';
import { AnimationClock } from '../src/animation/clock.js';
import { easeInOutCubic, easeOutCubic } from '../src/animation/easing.js';
import { resolveMotion } from '../src/animation/motion.js';
import {
  angleBetween,
  fromAxisAngle,
  fromBasisRows,
  IDENTITY_QUAT,
  multiply,
  rotateVector,
  slerp,
} from '../src/animation/quaternion.js';
import { createOrientTrack, createRollTrack, hopProfile, restPose, rollTurns } from '../src/animation/tracks.js';
import { d20FaceFrame } from '../src/geometry/d20.js';

describe('quaternions', () => {
  it('rotates vectors and composes rotations', () => {
    const quarter = fromAxisAngle([0, 0, 1], Math.PI / 2);
    const rotated = rotateVector(quarter, [1, 0, 0]);
    expect(rotated[0]).toBeCloseTo(0, 12);
    expect(rotated[1]).toBeCloseTo(1, 12);
    const half = multiply(quarter, quarter);
    expect(rotateVector(half, [1, 0, 0])[0]).toBeCloseTo(-1, 12);
  });

  it('slerps along the shortest path between endpoints', () => {
    const target = fromAxisAngle([0, 1, 0], 2);
    expect(angleBetween(slerp(IDENTITY_QUAT, target, 0), IDENTITY_QUAT)).toBeCloseTo(0, 6);
    expect(angleBetween(slerp(IDENTITY_QUAT, target, 1), target)).toBeCloseTo(0, 6);
    expect(angleBetween(slerp(IDENTITY_QUAT, target, 0.5), IDENTITY_QUAT)).toBeCloseTo(1, 6);
    const negated = [-target[0], -target[1], -target[2], -target[3]] as const;
    expect(angleBetween(slerp(IDENTITY_QUAT, negated, 0.5), IDENTITY_QUAT)).toBeCloseTo(1, 6);
  });

  it('builds a rotation from basis rows', () => {
    const q = fromBasisRows([0, 1, 0], [0, 0, 1], [1, 0, 0]);
    const x = rotateVector(q, [0, 1, 0]);
    expect(x[0]).toBeCloseTo(1, 12);
  });
});

describe('easing and motion', () => {
  it('easings start at 0 and end at 1', () => {
    for (const easing of [easeInOutCubic, easeOutCubic]) {
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
      expect(easing(-1)).toBe(0);
      expect(easing(2)).toBe(1);
    }
  });

  it('resolves the system mode from the reduced-motion preference', () => {
    expect(resolveMotion('system', false)).toBe('full');
    expect(resolveMotion('system', true)).toBe('reduced');
    expect(resolveMotion('full', true)).toBe('full');
    expect(resolveMotion('none', false)).toBe('none');
  });
});

describe('animation tracks', () => {
  const from = restPose(d20FaceFrame(20).orientation);
  const target = d20FaceFrame(7).orientation;

  it('orient track starts at the current pose and ends exactly on the target', () => {
    const track = createOrientTrack({ rotation: from.rotation, offset: [0, 0.2, 0] }, target, 450);
    expect(angleBetween(track.sample(0).rotation, from.rotation)).toBeCloseTo(0, 9);
    expect(track.sample(0).offset[1]).toBeCloseTo(0.2, 9);
    expect(track.sample(450)).toEqual(restPose(target));
    expect(track.sample(10_000)).toEqual(restPose(target));
  });

  it('roll track keeps full turns that shortest-path interpolation would drop', () => {
    const track = createRollTrack(from, target, 1200, { variant: 0 });
    expect(angleBetween(track.sample(0).rotation, from.rotation)).toBeCloseTo(0, 6);
    expect(track.sample(1200)).toEqual(restPose(target));

    let travelled = 0;
    let previous = track.sample(0).rotation;
    for (let t = 10; t <= 1200; t += 10) {
      const current = track.sample(t).rotation;
      travelled += angleBetween(previous, current);
      previous = current;
    }
    const direct = angleBetween(from.rotation, target);
    expect(travelled).toBeGreaterThan(direct + 2 * Math.PI);
  });

  it('roll track hops and lands', () => {
    const track = createRollTrack(from, target, 1200, { variant: 3 });
    expect(track.sample(0).offset[1]).toBeCloseTo(0, 9);
    expect(track.sample(360).offset[1]).toBeGreaterThan(0.2);
    expect(track.sample(1199).offset[1]).toBeCloseTo(0, 6);
    expect(hopProfile(0.3)).toBeCloseTo(1, 9);
    expect(hopProfile(0.95)).toBe(0);
    expect(rollTurns(1200)).toBe(2);
    expect(rollTurns(100)).toBe(1);
  });

  it('roll variants tumble around different axes', () => {
    const a = createRollTrack(from, target, 1200, { variant: 0 }).sample(300).rotation;
    const b = createRollTrack(from, target, 1200, { variant: 1 }).sample(300).rotation;
    expect(angleBetween(a, b)).toBeGreaterThan(0.1);
  });
});

describe('AnimationClock', () => {
  it('accumulates time only while running', () => {
    let now = 0;
    const clock = new AnimationClock(() => now);
    clock.start();
    now = 100;
    expect(clock.tick()).toBe(100);
    clock.pause();
    now = 5_000;
    expect(clock.tick()).toBe(100);
    clock.resume();
    now = 5_050;
    expect(clock.tick()).toBe(150);
  });
});
