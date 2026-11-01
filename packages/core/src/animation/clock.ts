/** Frame scheduling primitives; injectable so animations can be tested on controlled time. */
export interface FrameScheduler {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

/**
 * Accumulates active animation time. Time does not advance while paused
 * (hidden document), so an animation resumes where it stopped. Progress
 * depends on elapsed time only, never on the number of frames.
 */
export class AnimationClock {
  private elapsed = 0;
  private last: number | null = null;

  constructor(private readonly now: () => number) {}

  start(): void {
    this.elapsed = 0;
    this.last = this.now();
  }

  pause(): void {
    if (this.last !== null) this.elapsed += Math.max(0, this.now() - this.last);
    this.last = null;
  }

  resume(): void {
    if (this.last === null) this.last = this.now();
  }

  get paused(): boolean {
    return this.last === null;
  }

  /** Advances to the current time and returns the accumulated elapsed milliseconds. */
  tick(): number {
    if (this.last !== null) {
      const now = this.now();
      this.elapsed += Math.max(0, now - this.last);
      this.last = now;
    }
    return this.elapsed;
  }
}
