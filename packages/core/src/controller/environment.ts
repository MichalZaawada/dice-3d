import type { FrameScheduler } from '../animation/clock.js';

/** Browser services used by a die controller; injectable for deterministic tests. */
export interface DieEnvironment {
  readonly scheduler: FrameScheduler;
  isHidden(): boolean;
  onVisibilityChange(listener: () => void): () => void;
  prefersReducedMotion(): boolean;
  onReducedMotionChange(listener: () => void): () => void;
  /** Reports an error (e.g. thrown by a subscriber) without interrupting the caller. */
  reportError(error: unknown): void;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Creates the environment for a real browser window. Must only be called in a browser. */
export function createBrowserEnvironment(win: Window & typeof globalThis): DieEnvironment {
  const doc = win.document;
  const motionQuery = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : null;
  return {
    scheduler: {
      now: () => win.performance.now(),
      requestFrame: (callback) => win.requestAnimationFrame(() => callback()),
      cancelFrame: (handle) => win.cancelAnimationFrame(handle),
    },
    isHidden: () => doc.visibilityState === 'hidden',
    onVisibilityChange(listener) {
      doc.addEventListener('visibilitychange', listener);
      return () => doc.removeEventListener('visibilitychange', listener);
    },
    prefersReducedMotion: () => motionQuery?.matches ?? false,
    onReducedMotionChange(listener) {
      if (!motionQuery) return () => {};
      motionQuery.addEventListener('change', listener);
      return () => motionQuery.removeEventListener('change', listener);
    },
    reportError(error) {
      if (typeof win.reportError === 'function') win.reportError(error);
      else win.console.error(error);
    },
  };
}
