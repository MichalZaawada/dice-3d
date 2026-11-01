/** A face value of a twenty-sided die. */
export type D20Value =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

/**
 * Motion preference.
 * - `system`: follows `prefers-reduced-motion` and reacts to its changes.
 * - `full`: full roll animation with spins and a hop.
 * - `reduced`: no hop and no full spins; transitions take at most 150 ms.
 * - `none`: changes are applied instantly.
 */
export type MotionMode = 'system' | 'full' | 'reduced' | 'none';

export type D20State = 'idle' | 'animating' | 'disposed';

export interface D20Theme {
  /** Body color in `#RRGGBB` format. Ignored while a skin is active. */
  bodyColor: string;
  /** Edge line color in `#RRGGBB` format. */
  edgeColor: string;
  /** Overlay number color in `#RRGGBB` format. */
  numberColor: string;
  /** Canvas background in `#RRGGBB` format or `'transparent'`. */
  background: string | 'transparent';
}

/** Normalized texture coordinate: `(0, 0)` is the top-left and `(1, 1)` the bottom-right of the image. */
export type UV = readonly [u: number, v: number];

/** Texture coordinates of the canonical face vertices A (top), B (bottom-left) and C (bottom-right). */
export type FaceUV = readonly [UV, UV, UV];

/** A decoded image owned by the application. */
export type D20SkinSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export type D20SkinLayout = 'd20-net-v1' | Readonly<Record<D20Value, FaceUV>>;

export interface D20Skin {
  /** Decoded image; loading (and CORS) is the application's responsibility. */
  source: D20SkinSource;
  /** The official net template or an explicit UV triangle for every value. */
  layout: D20SkinLayout;
  /** `overlay` (default) draws the standard numbers on top of the image. */
  numbers?: 'overlay' | 'in-texture';
}

export interface D20Options {
  /** Initial value. Default: 20. */
  value?: D20Value;
  theme?: Partial<D20Theme>;
  /** Omitted: default appearance. */
  skin?: D20Skin;
  /** Default: `system`. */
  motion?: MotionMode;
  /** Upper bound for the device pixel ratio. Default: 2; finite number >= 1. */
  maxPixelRatio?: number;
}

export interface AnimationOptions {
  /** Default: 450 for `orientTo`, 1200 for `rollTo`. `0` finishes immediately. */
  durationMs?: number;
  signal?: AbortSignal;
}

export interface D20Snapshot {
  state: D20State;
  /** Last completed value. */
  value: D20Value;
  /** Target of the running animation, otherwise `null`. */
  target: D20Value | null;
}

export type AnimationResult =
  | { status: 'completed'; value: D20Value }
  | { status: 'cancelled'; reason: 'replaced' | 'aborted' | 'disposed' };

export interface D20 {
  /** Rotates the die to the given value along the shortest path. */
  orientTo(value: D20Value, options?: AnimationOptions): Promise<AnimationResult>;
  /** Plays a roll animation (spins and a hop) that ends exactly on the given value. */
  rollTo(value: D20Value, options?: AnimationOptions): Promise<AnimationResult>;
  /** Cancels any animation (`replaced`) and shows the value immediately. */
  setValue(value: D20Value): void;
  setTheme(theme: Partial<D20Theme>): void;
  /** `null` restores the default appearance. */
  setSkin(skin: D20Skin | null): void;
  setMotion(mode: MotionMode): void;
  getSnapshot(): Readonly<D20Snapshot>;
  /** The listener is not called on subscription. Returns an idempotent unsubscribe function. */
  subscribe(listener: (state: Readonly<D20Snapshot>) => void): () => void;
  /** Idempotent. */
  dispose(): void;
}
