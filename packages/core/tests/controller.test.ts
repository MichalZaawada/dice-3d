import { describe, expect, it, vi } from 'vitest';
import { angleBetween } from '../src/animation/quaternion.js';
import { D20Error } from '../src/errors.js';
import { d20FaceFrame } from '../src/geometry/d20.js';
import type { D20Value } from '../src/types.js';
import { createTestDie, FakeEnvironment, fakeSource, type TestDie } from './helpers.js';

function expectAtValue(test: TestDie, value: D20Value): void {
  const pose = test.renderer.lastPose;
  expect(pose).toBeDefined();
  expect(angleBetween(pose!.rotation, d20FaceFrame(value).orientation)).toBeCloseTo(0, 6);
  expect(pose!.offset).toEqual([0, 0, 0]);
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof D20Error ? error.code : 'not-a-D20Error';
  }
  return undefined;
}

describe('die controller: basic operations', () => {
  it('starts idle at the initial value without notifying anyone', () => {
    const test = createTestDie({ value: 7 });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 7, target: null });
    expect(Object.isFrozen(test.die.getSnapshot())).toBe(true);
  });

  it('orientTo animates and completes on the target value', async () => {
    const test = createTestDie();
    const listener = vi.fn();
    test.die.subscribe(listener);
    const promise = test.die.orientTo(5);
    expect(test.die.getSnapshot()).toEqual({ state: 'animating', value: 20, target: 5 });
    test.scheduler.advance(200);
    expect(test.die.getSnapshot().value).toBe(20);
    test.scheduler.advance(300);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 5 });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 5, target: null });
    expectAtValue(test, 5);
    expect(listener.mock.calls.map(([snapshot]) => snapshot.state)).toEqual(['animating', 'idle']);
    expect(test.scheduler.pendingFrames).toBe(0);
  });

  it('orientTo to the current value while idle completes immediately', async () => {
    const test = createTestDie({ value: 9 });
    await expect(test.die.orientTo(9)).resolves.toEqual({ status: 'completed', value: 9 });
    expect(test.scheduler.pendingFrames).toBe(0);
  });

  it('rollTo animates even when rolling the current value again', async () => {
    const test = createTestDie({ value: 9 });
    const promise = test.die.rollTo(9);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(600);
    const midRoll = test.renderer.lastPose!;
    expect(angleBetween(midRoll.rotation, d20FaceFrame(9).orientation)).toBeGreaterThan(0.1);
    test.scheduler.advance(600);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 9 });
    expectAtValue(test, 9);
  });

  it('uses default durations of 450 ms (orientTo) and 1200 ms (rollTo)', async () => {
    const test = createTestDie();
    const orient = test.die.orientTo(3);
    test.scheduler.advance(449);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(1);
    await expect(orient).resolves.toMatchObject({ status: 'completed' });

    const roll = test.die.rollTo(4);
    test.scheduler.advance(1199);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(1);
    await expect(roll).resolves.toMatchObject({ status: 'completed', value: 4 });
  });

  it('durationMs 0 completes immediately without entering the animating state', async () => {
    const test = createTestDie();
    const listener = vi.fn();
    test.die.subscribe(listener);
    const promise = test.die.rollTo(11, { durationMs: 0 });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 11, target: null });
    await expect(promise).resolves.toEqual({ status: 'completed', value: 11 });
    expect(listener).toHaveBeenCalledTimes(1);
    expectAtValue(test, 11);
    expect(test.scheduler.pendingFrames).toBe(0);
  });

  it('setValue applies a value instantly and replaces an active animation', async () => {
    const test = createTestDie();
    const promise = test.die.rollTo(2);
    test.scheduler.advance(100);
    test.die.setValue(13);
    await expect(promise).resolves.toEqual({ status: 'cancelled', reason: 'replaced' });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 13, target: null });
    expectAtValue(test, 13);
    expect(test.scheduler.pendingFrames).toBe(0);
  });
});

describe('die controller: concurrency and cancellation', () => {
  it('the last valid request wins and starts from the current pose', async () => {
    const test = createTestDie();
    const first = test.die.rollTo(2);
    test.scheduler.advance(300);
    const poseBefore = test.renderer.lastPose!;
    const second = test.die.orientTo(17);
    await expect(first).resolves.toEqual({ status: 'cancelled', reason: 'replaced' });
    expect(test.die.getSnapshot()).toEqual({ state: 'animating', value: 20, target: 17 });
    test.scheduler.advance(1);
    // The replacement continues from where the die was, without jumping.
    expect(angleBetween(test.renderer.lastPose!.rotation, poseBefore.rotation)).toBeLessThan(0.05);
    test.scheduler.advance(450);
    await expect(second).resolves.toEqual({ status: 'completed', value: 17 });
  });

  it('an invalid request throws synchronously and leaves the running animation untouched', async () => {
    const test = createTestDie();
    const running = test.die.orientTo(4);
    expect(errorCode(() => test.die.orientTo(0 as D20Value))).toBe('INVALID_ARGUMENT');
    expect(errorCode(() => test.die.rollTo(5, { durationMs: -1 }))).toBe('INVALID_ARGUMENT');
    expect(errorCode(() => test.die.rollTo(5, { durationMs: Number.POSITIVE_INFINITY }))).toBe('INVALID_ARGUMENT');
    expect(test.die.getSnapshot()).toEqual({ state: 'animating', value: 20, target: 4 });
    test.scheduler.advance(450);
    await expect(running).resolves.toEqual({ status: 'completed', value: 4 });
  });

  it('an already aborted signal returns "aborted" without interrupting the current operation', async () => {
    const test = createTestDie();
    const running = test.die.orientTo(4);
    const controller = new AbortController();
    controller.abort();
    await expect(test.die.rollTo(6, { signal: controller.signal })).resolves.toEqual({
      status: 'cancelled',
      reason: 'aborted',
    });
    expect(test.die.getSnapshot().target).toBe(4);
    test.scheduler.advance(450);
    await expect(running).resolves.toEqual({ status: 'completed', value: 4 });
  });

  it('aborting during an animation restores the last completed value', async () => {
    const test = createTestDie({ value: 8 });
    const controller = new AbortController();
    const promise = test.die.rollTo(6, { signal: controller.signal });
    test.scheduler.advance(400);
    controller.abort();
    await expect(promise).resolves.toEqual({ status: 'cancelled', reason: 'aborted' });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 8, target: null });
    expectAtValue(test, 8);
    expect(test.scheduler.pendingFrames).toBe(0);
  });

  it('aborting a signal of a replaced operation does not affect the new one', async () => {
    const test = createTestDie();
    const controller = new AbortController();
    const first = test.die.orientTo(3, { signal: controller.signal });
    const second = test.die.orientTo(4);
    controller.abort();
    await expect(first).resolves.toEqual({ status: 'cancelled', reason: 'replaced' });
    expect(test.die.getSnapshot().target).toBe(4);
    test.scheduler.advance(450);
    await expect(second).resolves.toEqual({ status: 'completed', value: 4 });
  });

  it('removes abort listeners once the operation settles', async () => {
    const test = createTestDie();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = test.die.orientTo(3, { signal: controller.signal });
    test.scheduler.advance(450);
    await promise;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('settles every promise exactly once across replacement, abort, duration 0 and dispose', async () => {
    const test = createTestDie();
    const controller = new AbortController();
    const outcomes: unknown[] = [];
    const track = (promise: Promise<unknown>) => promise.then((result) => outcomes.push(result), (error) => outcomes.push(error));
    const a = track(test.die.rollTo(1));
    const b = track(test.die.orientTo(2, { signal: controller.signal }));
    controller.abort();
    const c = track(test.die.rollTo(3, { durationMs: 0 }));
    const d = track(test.die.rollTo(4));
    test.scheduler.advance(10);
    test.die.dispose();
    test.die.dispose();
    await Promise.all([a, b, c, d]);
    expect(outcomes).toEqual([
      { status: 'cancelled', reason: 'replaced' },
      { status: 'cancelled', reason: 'aborted' },
      { status: 'completed', value: 3 },
      { status: 'cancelled', reason: 'disposed' },
    ]);
  });
});

describe('die controller: time', () => {
  it('finishes after the same time regardless of the number of frames', async () => {
    for (const frames of [1, 3, 60, 500]) {
      const test = createTestDie();
      const promise = test.die.rollTo(12);
      test.scheduler.advance(1199, frames);
      expect(test.die.getSnapshot().state).toBe('animating');
      test.scheduler.advance(1);
      await expect(promise).resolves.toEqual({ status: 'completed', value: 12 });
    }
  });

  it('pauses while the document is hidden and resumes where it stopped', async () => {
    const test = createTestDie();
    const promise = test.die.orientTo(3);
    test.scheduler.advance(200);
    test.environment.setHidden(true);
    expect(test.scheduler.pendingFrames).toBe(0);
    test.scheduler.skip(60_000);
    test.environment.setHidden(false);
    test.scheduler.advance(200);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(50);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 3 });
  });

  it('does not count time when an animation starts in a hidden document', async () => {
    const environment = new FakeEnvironment();
    environment.hidden = true;
    const test = createTestDie({ environment });
    const promise = test.die.orientTo(3);
    expect(test.scheduler.pendingFrames).toBe(0);
    test.scheduler.skip(10_000);
    environment.setHidden(false);
    test.scheduler.advance(449);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(1);
    await expect(promise).resolves.toMatchObject({ status: 'completed' });
  });

  it('keeps no animation frame scheduled while idle', async () => {
    const test = createTestDie();
    expect(test.scheduler.pendingFrames).toBe(0);
    test.die.setTheme({ bodyColor: '#123456' });
    test.die.setValue(4);
    expect(test.scheduler.pendingFrames).toBe(0);
  });
});

describe('die controller: motion preferences', () => {
  it('"none" applies results instantly', async () => {
    const test = createTestDie({ motion: 'none' });
    await expect(test.die.rollTo(6)).resolves.toEqual({ status: 'completed', value: 6 });
    expect(test.scheduler.pendingFrames).toBe(0);
    expectAtValue(test, 6);
  });

  it('"reduced" limits transitions to 150 ms without hop or spins', async () => {
    const test = createTestDie({ motion: 'reduced' });
    const promise = test.die.rollTo(6);
    test.scheduler.advance(75);
    expect(test.renderer.lastPose!.offset).toEqual([0, 0, 0]);
    const direct = angleBetween(d20FaceFrame(20).orientation, d20FaceFrame(6).orientation);
    expect(angleBetween(test.renderer.lastPose!.rotation, d20FaceFrame(20).orientation)).toBeLessThanOrEqual(direct);
    test.scheduler.advance(75);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 6 });
  });

  it('"reduced" keeps shorter requested durations', async () => {
    const test = createTestDie({ motion: 'reduced' });
    const promise = test.die.orientTo(6, { durationMs: 80 });
    test.scheduler.advance(80);
    await expect(promise).resolves.toMatchObject({ status: 'completed' });
  });

  it('switching to "none" during an animation completes it on the target', async () => {
    const test = createTestDie();
    const promise = test.die.rollTo(15);
    test.scheduler.advance(300);
    test.die.setMotion('none');
    await expect(promise).resolves.toEqual({ status: 'completed', value: 15 });
    expect(test.die.getSnapshot()).toEqual({ state: 'idle', value: 15, target: null });
    expectAtValue(test, 15);
    expect(test.scheduler.pendingFrames).toBe(0);
  });

  it('switching to "reduced" during a roll finishes within 150 ms from the current pose', async () => {
    const test = createTestDie();
    const promise = test.die.rollTo(15);
    test.scheduler.advance(300);
    const before = test.renderer.lastPose!;
    test.die.setMotion('reduced');
    test.scheduler.advance(1);
    expect(angleBetween(test.renderer.lastPose!.rotation, before.rotation)).toBeLessThan(0.1);
    test.scheduler.advance(149);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 15 });
  });

  it('"system" follows prefers-reduced-motion, including changes during an animation', async () => {
    const environment = new FakeEnvironment();
    environment.reducedMotion = true;
    const test = createTestDie({ motion: 'system', environment });
    const reduced = test.die.rollTo(2);
    test.scheduler.advance(150);
    await expect(reduced).resolves.toMatchObject({ status: 'completed' });

    environment.setReducedMotion(false);
    const full = test.die.rollTo(3);
    test.scheduler.advance(500);
    expect(test.die.getSnapshot().state).toBe('animating');
    environment.setReducedMotion(true);
    test.scheduler.advance(150);
    await expect(full).resolves.toEqual({ status: 'completed', value: 3 });
  });

  it('ignores system preference changes when the mode is explicit', async () => {
    const test = createTestDie({ motion: 'full' });
    const promise = test.die.rollTo(3);
    test.scheduler.advance(100);
    test.environment.setReducedMotion(true);
    test.scheduler.advance(200);
    expect(test.die.getSnapshot().state).toBe('animating');
    test.scheduler.advance(900);
    await expect(promise).resolves.toMatchObject({ status: 'completed' });
  });

  it('rejects unknown motion modes', () => {
    const test = createTestDie();
    expect(errorCode(() => test.die.setMotion('fast' as never))).toBe('INVALID_ARGUMENT');
  });
});

describe('die controller: appearance', () => {
  it('setTheme validates, merges and renders a single frame when idle', () => {
    const test = createTestDie();
    const frames = test.renderer.poses.length;
    test.die.setTheme({ bodyColor: '#102030' });
    test.die.setTheme({ edgeColor: '#405060' });
    expect(test.renderer.themes.at(-1)).toMatchObject({ bodyColor: '#102030', edgeColor: '#405060' });
    expect(test.renderer.poses.length).toBe(frames + 2);
    expect(errorCode(() => test.die.setTheme({ numberColor: 'black' }))).toBe('INVALID_ARGUMENT');
    expect(test.renderer.themes.at(-1)?.numberColor).not.toBe('black');
  });

  it('setSkin uploads a validated skin and null restores the default', () => {
    const test = createTestDie();
    test.die.setSkin({ source: fakeSource() as never, layout: 'd20-net-v1' });
    expect(test.renderer.skin?.numbers).toBe('overlay');
    test.die.setSkin(null);
    expect(test.renderer.skin).toBeNull();
  });

  it('a failed skin swap keeps the previous skin, value and running animation', async () => {
    const test = createTestDie();
    test.die.setSkin({ source: fakeSource() as never, layout: 'd20-net-v1', numbers: 'in-texture' });
    const previous = test.renderer.skin;
    const promise = test.die.rollTo(5);
    test.scheduler.advance(100);
    expect(errorCode(() => test.die.setSkin({ source: fakeSource(10, 10) as never, layout: 'd20-net-v1' }))).toBe(
      'INVALID_ARGUMENT',
    );
    test.renderer.failNextUpload = true;
    expect(errorCode(() => test.die.setSkin({ source: fakeSource() as never, layout: 'd20-net-v1' }))).toBe(
      'TEXTURE_UPLOAD_FAILED',
    );
    expect(test.renderer.skin).toBe(previous);
    expect(test.die.getSnapshot()).toEqual({ state: 'animating', value: 20, target: 5 });
    test.scheduler.advance(1100);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 5 });
  });

  it('swapping the skin during an animation does not restart it', async () => {
    const test = createTestDie();
    const promise = test.die.rollTo(5);
    test.scheduler.advance(600);
    test.die.setSkin({ source: fakeSource() as never, layout: 'd20-net-v1' });
    test.scheduler.advance(600);
    await expect(promise).resolves.toEqual({ status: 'completed', value: 5 });
  });
});

describe('die controller: subscriptions', () => {
  it('notifies on state, value and target changes only, and unsubscribes idempotently', async () => {
    const test = createTestDie();
    const listener = vi.fn();
    const unsubscribe = test.die.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    const promise = test.die.orientTo(2);
    test.scheduler.advance(450, 30);
    await promise;
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    unsubscribe();
    test.die.setValue(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a throwing listener does not block other listeners or promise settlement', async () => {
    const test = createTestDie();
    const failing = vi.fn(() => {
      throw new Error('listener failure');
    });
    const healthy = vi.fn();
    test.die.subscribe(failing);
    test.die.subscribe(healthy);
    const promise = test.die.orientTo(2, { durationMs: 0 });
    await expect(promise).resolves.toEqual({ status: 'completed', value: 2 });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(test.environment.reportedErrors).toHaveLength(1);
  });

  it('snapshots are immutable copies', () => {
    const test = createTestDie();
    const before = test.die.getSnapshot();
    test.die.setValue(4);
    expect(before.value).toBe(20);
    expect(() => {
      (test.die.getSnapshot() as { value: number }).value = 1;
    }).toThrow();
  });
});

describe('die controller: lifecycle', () => {
  it('dispose cancels the animation, notifies once and releases everything', async () => {
    const test = createTestDie();
    const listener = vi.fn();
    test.die.subscribe(listener);
    const promise = test.die.rollTo(3);
    test.scheduler.advance(100);
    test.die.dispose();
    await expect(promise).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
    expect(test.die.getSnapshot()).toEqual({ state: 'disposed', value: 20, target: null });
    expect(listener.mock.calls.at(-1)?.[0]).toEqual({ state: 'disposed', value: 20, target: null });
    expect(test.scheduler.pendingFrames).toBe(0);
    expect(test.environment.visibilityListeners.size).toBe(0);
    expect(test.environment.motionListeners.size).toBe(0);
    expect(test.renderer.disposed).toBe(true);
    expect(test.teardowns.count).toBe(1);
    test.die.dispose();
    expect(test.teardowns.count).toBe(1);
  });

  it('after dispose only dispose and getSnapshot are allowed', () => {
    const test = createTestDie();
    test.die.dispose();
    const calls: (() => unknown)[] = [
      () => test.die.orientTo(1),
      () => test.die.rollTo(1),
      () => test.die.setValue(1),
      () => test.die.setTheme({}),
      () => test.die.setSkin(null),
      () => test.die.setMotion('full'),
      () => test.die.subscribe(() => {}),
    ];
    for (const call of calls) expect(errorCode(call)).toBe('DISPOSED');
    expect(() => test.die.dispose()).not.toThrow();
    expect(test.die.getSnapshot().state).toBe('disposed');
  });

  it('context loss rejects the active operation with CONTEXT_LOST and disposes the instance', async () => {
    const test = createTestDie();
    const listener = vi.fn();
    test.die.subscribe(listener);
    const promise = test.die.rollTo(3);
    test.scheduler.advance(100);
    test.renderer.contextLost = true;
    test.die.fail(new D20Error('CONTEXT_LOST', 'lost'));
    await expect(promise).rejects.toMatchObject({ code: 'CONTEXT_LOST' });
    expect(test.die.getSnapshot().state).toBe('disposed');
    expect(listener.mock.calls.at(-1)?.[0].state).toBe('disposed');
    expect(test.scheduler.pendingFrames).toBe(0);
    expect(errorCode(() => test.die.rollTo(1))).toBe('DISPOSED');
  });

  it('a renderer failure during a frame rejects the animation promise', async () => {
    const test = createTestDie();
    const promise = test.die.rollTo(3);
    vi.spyOn(test.renderer, 'render').mockImplementation(() => {
      test.renderer.contextLost = true;
      throw new Error('draw failed');
    });
    test.scheduler.advance(16);
    await expect(promise).rejects.toMatchObject({ code: 'CONTEXT_LOST' });
    expect(test.die.getSnapshot().state).toBe('disposed');
  });

  it('two instances run independently', async () => {
    const first = createTestDie({ value: 1 });
    const second = createTestDie({ value: 2 });
    const a = first.die.rollTo(10);
    const b = second.die.orientTo(11);
    second.scheduler.advance(450);
    await expect(b).resolves.toEqual({ status: 'completed', value: 11 });
    expect(first.die.getSnapshot()).toEqual({ state: 'animating', value: 1, target: 10 });
    first.die.dispose();
    expect(second.die.getSnapshot().state).toBe('idle');
    await expect(a).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
  });

  it('does not render while the drawing buffer has zero size', () => {
    const test = createTestDie();
    test.renderer.setSize(0, 0);
    const frames = test.renderer.poses.length;
    test.die.setValue(5);
    test.die.invalidate();
    expect(test.renderer.poses.length).toBe(frames);
    test.renderer.setSize(10, 10);
    test.die.invalidate();
    expect(test.renderer.poses.length).toBe(frames + 1);
  });
});
