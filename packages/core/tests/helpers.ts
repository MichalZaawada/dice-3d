import type { FrameScheduler } from '../src/animation/clock.js';
import type { Pose } from '../src/animation/tracks.js';
import { createDieController, type DieControllerConfig } from '../src/controller/dieController.js';
import type { DieEnvironment } from '../src/controller/environment.js';
import { prepareSkin, type SourceInspector } from '../src/controller/skinValidation.js';
import { assertD20Value, DEFAULT_THEME } from '../src/controller/validation.js';
import { d20FaceFrame } from '../src/geometry/d20.js';
import { builtInDieModel } from '../src/geometry/dice.js';
import { D20Error } from '../src/errors.js';
import type { DieRenderer, PreparedSkin, ResolvedTheme } from '../src/renderer/renderer.js';
import type { D20Value, MotionMode } from '../src/types.js';

/** Manually driven animation frames and time. */
export class FakeScheduler implements FrameScheduler {
  time = 0;
  private nextHandle = 1;
  private readonly callbacks = new Map<number, () => void>();

  now = (): number => this.time;

  requestFrame = (callback: () => void): number => {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  };

  cancelFrame = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  get pendingFrames(): number {
    return this.callbacks.size;
  }

  /** Advances time by `ms`, split evenly across `frames` animation frames. */
  advance(ms: number, frames = 1): void {
    for (let i = 0; i < frames; i++) {
      this.time += ms / frames;
      this.runFrame();
    }
  }

  /** Advances time without running any frame (e.g. while the page is hidden). */
  skip(ms: number): void {
    this.time += ms;
  }

  runFrame(): void {
    const pending = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of pending) callback();
  }
}

export class FakeEnvironment implements DieEnvironment {
  readonly scheduler = new FakeScheduler();
  hidden = false;
  reducedMotion = false;
  readonly reportedErrors: unknown[] = [];
  readonly visibilityListeners = new Set<() => void>();
  readonly motionListeners = new Set<() => void>();

  isHidden = (): boolean => this.hidden;
  prefersReducedMotion = (): boolean => this.reducedMotion;

  onVisibilityChange = (listener: () => void): (() => void) => {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  };

  onReducedMotionChange = (listener: () => void): (() => void) => {
    this.motionListeners.add(listener);
    return () => this.motionListeners.delete(listener);
  };

  reportError = (error: unknown): void => {
    this.reportedErrors.push(error);
  };

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of [...this.visibilityListeners]) listener();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    for (const listener of [...this.motionListeners]) listener();
  }
}

export class FakeRenderer implements DieRenderer {
  maxTextureSize = 4096;
  readonly poses: Pose[] = [];
  readonly sizes: (readonly [number, number])[] = [];
  themes: ResolvedTheme[] = [];
  skin: PreparedSkin | null = null;
  skinUploads = 0;
  failNextUpload = false;
  contextLost = false;
  disposed = false;
  width = 100;
  height = 100;

  setTheme(theme: ResolvedTheme): void {
    this.themes.push(theme);
  }

  setSkin(skin: PreparedSkin | null): void {
    if (skin && this.failNextUpload) {
      this.failNextUpload = false;
      throw new D20Error('TEXTURE_UPLOAD_FAILED', 'Simulated upload failure');
    }
    if (skin) this.skinUploads++;
    this.skin = skin;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.sizes.push([width, height]);
  }

  canRender(): boolean {
    return !this.disposed && !this.contextLost && this.width > 0 && this.height > 0;
  }

  /** All bodies of every rendered frame; `poses` keeps the first body for single-body assertions. */
  readonly frames: (readonly Pose[])[] = [];

  render(poses: readonly Pose[]): void {
    this.frames.push(poses);
    this.poses.push(poses[0]!);
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  dispose(): void {
    this.disposed = true;
  }

  get lastPose(): Pose | undefined {
    return this.poses[this.poses.length - 1];
  }
}

/** Fake image sources recognized by {@link fakeInspector}. */
export interface FakeSource {
  readonly fake: true;
  readonly width: number;
  readonly height: number;
  readonly decoded?: boolean;
}

export const fakeSource = (width = 2048, height = 1024, decoded = true): FakeSource => ({
  fake: true,
  width,
  height,
  decoded,
});

export const fakeInspector: SourceInspector = (source) => {
  if (typeof source !== 'object' || source === null || !('fake' in source)) return null;
  const fake = source as FakeSource;
  return { kind: 'image', width: fake.width, height: fake.height, decoded: fake.decoded ?? true };
};

export interface TestDie {
  readonly die: ReturnType<typeof createDieController<D20Value>>;
  readonly renderer: FakeRenderer;
  readonly environment: FakeEnvironment;
  readonly scheduler: FakeScheduler;
  readonly teardowns: { count: number };
}

export function createTestDie(
  options: { value?: D20Value; motion?: MotionMode; environment?: FakeEnvironment; renderer?: FakeRenderer } = {},
): TestDie {
  const renderer = options.renderer ?? new FakeRenderer();
  const environment = options.environment ?? new FakeEnvironment();
  const teardowns = { count: 0 };
  const config: DieControllerConfig<D20Value> = {
    initialValue: options.value ?? 20,
    motion: options.motion ?? 'full',
    theme: DEFAULT_THEME,
    renderer,
    environment,
    orientationsOf: (value) => [d20FaceFrame(value).orientation],
    validateValue: (value) => {
      assertD20Value(value);
      return value;
    },
    prepareSkin: (skin) =>
      prepareSkin(skin, { maxTextureSize: renderer.maxTextureSize, model: builtInDieModel('d20'), inspect: fakeInspector }),
    onTeardown: () => {
      teardowns.count++;
    },
  };
  return { die: createDieController(config), renderer, environment, scheduler: environment.scheduler, teardowns };
}
