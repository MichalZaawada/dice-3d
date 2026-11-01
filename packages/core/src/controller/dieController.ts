import { AnimationClock } from '../animation/clock.js';
import {
  DEFAULT_ORIENT_DURATION_MS,
  DEFAULT_ROLL_DURATION_MS,
  REDUCED_MOTION_MAX_MS,
  resolveMotion,
  type EffectiveMotion,
} from '../animation/motion.js';
import type { Quat } from '../animation/quaternion.js';
import { createOrientTrack, createRollTrack, restPose, type Pose, type Track } from '../animation/tracks.js';
import { D20Error } from '../errors.js';
import type { DieRenderer, PreparedSkin, ResolvedTheme } from '../renderer/renderer.js';
import type { AnimationOptions, D20Theme, DieValue, MotionMode } from '../types.js';
import type { DieEnvironment } from './environment.js';
import { assertMotionMode, mergeTheme, validateAnimationOptions } from './validation.js';

export type DieState = 'idle' | 'animating' | 'disposed';

export interface DieSnapshot<V extends DieValue> {
  readonly state: DieState;
  readonly value: V;
  readonly target: V | null;
}

export type DieAnimationResult<V extends DieValue> =
  | { readonly status: 'completed'; readonly value: V }
  | { readonly status: 'cancelled'; readonly reason: 'replaced' | 'aborted' | 'disposed' };

/** Die-independent controller API; `D20` is this interface with `V = D20Value`. */
export interface DieController<V extends DieValue> {
  orientTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  rollTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  setValue(value: V): void;
  setTheme(theme: Partial<D20Theme>): void;
  setSkin(skin: unknown): void;
  setMotion(mode: MotionMode): void;
  getSnapshot(): Readonly<DieSnapshot<V>>;
  subscribe(listener: (snapshot: Readonly<DieSnapshot<V>>) => void): () => void;
  dispose(): void;
}

/** Hooks used by the DOM mount; not part of the public API. */
export interface DieControllerInternals {
  /** Redraws once when idle (after resize, DPR or theme changes). */
  invalidate(): void;
  /** Ends the instance after an unrecoverable renderer failure (e.g. context loss). */
  fail(error: unknown): void;
}

export interface DieControllerConfig<V extends DieValue> {
  readonly initialValue: V;
  readonly motion: MotionMode;
  readonly theme: ResolvedTheme;
  readonly renderer: DieRenderer;
  readonly environment: DieEnvironment;
  /**
   * Target rotation of every body for a value. Values with several physical
   * faces resolve to the pose closest to `current` (empty before the first pose).
   */
  readonly orientationsOf: (value: V, current: readonly Quat[]) => readonly Quat[];
  readonly validateValue: (value: unknown) => V;
  readonly prepareSkin: (skin: unknown) => PreparedSkin;
  /** Called once during disposal, before GPU resources are released. */
  readonly onTeardown?: () => void;
}

type Listener<V extends DieValue> = (snapshot: Readonly<DieSnapshot<V>>) => void;

interface Operation<V extends DieValue> {
  readonly target: V;
  readonly rotations: readonly Quat[];
  settled: boolean;
  resolve(result: DieAnimationResult<V>): void;
  reject(error: unknown): void;
  detachSignal?: () => void;
}

interface ActiveAnimation<V extends DieValue> {
  readonly operation: Operation<V>;
  /** One track per body; all share kind and duration. */
  tracks: Track[];
}

export function createDieController<V extends DieValue>(
  config: DieControllerConfig<V>,
): DieController<V> & DieControllerInternals {
  const { renderer, environment, orientationsOf } = config;
  const { scheduler } = environment;
  const clock = new AnimationClock(() => scheduler.now());
  const listeners = new Set<Listener<V>>();

  let snapshot: Readonly<DieSnapshot<V>> = Object.freeze({ state: 'idle', value: config.initialValue, target: null });
  /** Rest rotations of the last completed value. */
  let rest: readonly Quat[] = orientationsOf(config.initialValue, []);
  let poses: readonly Pose[] = rest.map(restPose);
  let theme = config.theme;
  let motionMode = config.motion;
  let active: ActiveAnimation<V> | null = null;
  let frameHandle: number | null = null;
  let rollVariant = 0;
  let disposed = false;

  const stopVisibility = environment.onVisibilityChange(handleVisibilityChange);
  const stopMotionPreference = environment.onReducedMotionChange(() => {
    if (motionMode === 'system') applyMotionToActive();
  });

  function assertUsable(): void {
    if (disposed) throw new D20Error('DISPOSED', 'The die has been disposed');
  }

  function effectiveMotion(): EffectiveMotion {
    return resolveMotion(motionMode, environment.prefersReducedMotion());
  }

  function publish(next: DieSnapshot<V>): void {
    if (next.state === snapshot.state && next.value === snapshot.value && next.target === snapshot.target) return;
    snapshot = Object.freeze({ state: next.state, value: next.value, target: next.target });
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        environment.reportError(error);
      }
    }
  }

  function draw(): void {
    if (renderer.canRender()) renderer.render(poses);
  }

  function rotations(): readonly Quat[] {
    return poses.map((pose) => pose.rotation);
  }

  function settleAt(next: readonly Quat[]): void {
    rest = next;
    poses = next.map(restPose);
  }

  function drawOrReport(): void {
    try {
      draw();
    } catch (error) {
      environment.reportError(error);
    }
  }

  function settle(operation: Operation<V>, outcome: { result: DieAnimationResult<V> } | { error: unknown }): void {
    if (operation.settled) return;
    operation.settled = true;
    operation.detachSignal?.();
    if ('error' in outcome) operation.reject(outcome.error);
    else operation.resolve(outcome.result);
  }

  function stopFrames(): void {
    if (frameHandle !== null) {
      scheduler.cancelFrame(frameHandle);
      frameHandle = null;
    }
  }

  function scheduleFrame(): void {
    if (frameHandle === null && active && !disposed && !environment.isHidden()) {
      frameHandle = scheduler.requestFrame(onFrame);
    }
  }

  function onFrame(): void {
    frameHandle = null;
    if (!active) return;
    const elapsed = clock.tick();
    if (elapsed >= (active.tracks[0]?.durationMs ?? 0)) {
      completeActive();
      return;
    }
    poses = active.tracks.map((track) => track.sample(elapsed));
    try {
      draw();
    } catch (error) {
      failActive(error);
      return;
    }
    scheduleFrame();
  }

  function completeActive(): void {
    const current = active;
    if (!current) return;
    active = null;
    stopFrames();
    const value = current.operation.target;
    settleAt(current.operation.rotations);
    drawOrReport();
    publish({ state: 'idle', value, target: null });
    settle(current.operation, { result: { status: 'completed', value } });
  }

  /** Cancels the running animation. `restore` returns to the last completed value. */
  function cancelActive(reason: 'replaced' | 'aborted' | 'disposed', restore: boolean): void {
    const current = active;
    if (!current) return;
    active = null;
    stopFrames();
    if (restore) {
      poses = rest.map(restPose);
      drawOrReport();
      publish({ state: 'idle', value: snapshot.value, target: null });
    }
    settle(current.operation, { result: { status: 'cancelled', reason } });
  }

  function failActive(error: unknown): void {
    if (renderer.isContextLost()) {
      fail(new D20Error('CONTEXT_LOST', 'The WebGL context was lost', { cause: error }));
      return;
    }
    const current = active;
    active = null;
    stopFrames();
    poses = rest.map(restPose);
    publish({ state: 'idle', value: snapshot.value, target: null });
    if (current) settle(current.operation, { error });
  }

  function handleVisibilityChange(): void {
    if (environment.isHidden()) {
      clock.pause();
      stopFrames();
    } else if (active) {
      clock.resume();
      scheduleFrame();
    }
  }

  function applyMotionToActive(): void {
    if (!active || disposed) return;
    const motion = effectiveMotion();
    if (motion === 'none') {
      completeActive();
      return;
    }
    if (motion === 'reduced') {
      const elapsed = clock.tick();
      const first = active.tracks[0];
      if (!first) return;
      const remaining = Math.max(0, first.durationMs - elapsed);
      if (first.kind === 'roll' || remaining > REDUCED_MOTION_MAX_MS) {
        poses = active.tracks.map((track) => track.sample(elapsed));
        const duration = Math.min(remaining, REDUCED_MOTION_MAX_MS);
        active.tracks = active.tracks.map((track, index) => createOrientTrack(poses[index]!, track.target, duration));
        clock.start();
        if (environment.isHidden()) clock.pause();
        if (duration === 0) completeActive();
      }
    }
  }

  function start(kind: 'orient' | 'roll', rawValue: unknown, options: unknown): Promise<DieAnimationResult<V>> {
    assertUsable();
    const value = config.validateValue(rawValue);
    const { durationMs, signal } = validateAnimationOptions(options);
    if (signal?.aborted) return Promise.resolve({ status: 'cancelled', reason: 'aborted' });
    if (kind === 'orient' && !active && value === snapshot.value) {
      return Promise.resolve({ status: 'completed', value });
    }

    const motion = effectiveMotion();
    const requested = durationMs ?? (kind === 'orient' ? DEFAULT_ORIENT_DURATION_MS : DEFAULT_ROLL_DURATION_MS);
    const duration = motion === 'none' ? 0 : motion === 'reduced' ? Math.min(requested, REDUCED_MOTION_MAX_MS) : requested;
    const targets = orientationsOf(value, rotations());

    return new Promise<DieAnimationResult<V>>((resolve, reject) => {
      const operation: Operation<V> = { target: value, rotations: targets, settled: false, resolve, reject };
      cancelActive('replaced', false);

      if (duration === 0) {
        settleAt(targets);
        drawOrReport();
        publish({ state: 'idle', value, target: null });
        settle(operation, { result: { status: 'completed', value } });
        return;
      }

      const variant = rollVariant++;
      const tracks = targets.map((target, index) => {
        const from = poses[index] ?? restPose(target);
        return kind === 'roll' && motion === 'full'
          ? createRollTrack(from, target, duration, { variant: variant + index * 7 })
          : createOrientTrack(from, target, duration);
      });
      active = { operation, tracks };

      if (signal) {
        const onAbort = () => {
          if (active?.operation === operation) cancelActive('aborted', true);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        operation.detachSignal = () => signal.removeEventListener('abort', onAbort);
      }

      clock.start();
      if (environment.isHidden()) clock.pause();
      publish({ state: 'animating', value: snapshot.value, target: value });
      scheduleFrame();
    });
  }

  function teardown(): void {
    stopFrames();
    stopVisibility();
    stopMotionPreference();
    try {
      config.onTeardown?.();
    } finally {
      renderer.dispose();
    }
  }

  function fail(error: unknown): void {
    if (disposed) return;
    disposed = true;
    const current = active;
    active = null;
    if (current) settle(current.operation, { error });
    try {
      teardown();
    } catch (teardownError) {
      environment.reportError(teardownError);
    }
    publish({ state: 'disposed', value: snapshot.value, target: null });
    listeners.clear();
  }

  return {
    orientTo: (value, options) => start('orient', value, options),
    rollTo: (value, options) => start('roll', value, options),

    setValue(rawValue) {
      assertUsable();
      const value = config.validateValue(rawValue);
      const targets = orientationsOf(value, rotations());
      cancelActive('replaced', false);
      settleAt(targets);
      draw();
      publish({ state: 'idle', value, target: null });
    },

    setTheme(partial) {
      assertUsable();
      const next = mergeTheme(theme, partial);
      renderer.setTheme(next);
      theme = next;
      if (!active) draw();
    },

    setSkin(skin) {
      assertUsable();
      if (skin === null) renderer.setSkin(null);
      else renderer.setSkin(config.prepareSkin(skin));
      if (!active) draw();
    },

    setMotion(mode) {
      assertUsable();
      assertMotionMode(mode);
      motionMode = mode;
      applyMotionToActive();
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      assertUsable();
      if (typeof listener !== 'function') throw new D20Error('INVALID_ARGUMENT', 'listener must be a function');
      const entry: Listener<V> = (state) => listener(state);
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive('disposed', false);
      try {
        teardown();
      } finally {
        publish({ state: 'disposed', value: snapshot.value, target: null });
        listeners.clear();
      }
    },

    invalidate() {
      if (!disposed && !active) drawOrReport();
    },

    fail,
  };
}
