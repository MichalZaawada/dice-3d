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

/* ------------------------------------------------------------------ */
/* All die types                                                       */
/* ------------------------------------------------------------------ */

type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

/** Integers from 1 to `N` (inclusive). */
export type DieRange<N extends number> = Exclude<Enumerate<N>, 0> | N;

/** Result types of the built-in dice. */
export interface DieValueMap {
  d2: DieRange<2>;
  d3: DieRange<3>;
  d4: DieRange<4>;
  d5: DieRange<5>;
  d6: DieRange<6>;
  d7: DieRange<7>;
  d8: DieRange<8>;
  d10: DieRange<10>;
  d12: DieRange<12>;
  d14: DieRange<14>;
  d16: DieRange<16>;
  d20: D20Value;
  d24: DieRange<24>;
  d30: DieRange<30>;
  d48: DieRange<48>;
  d60: DieRange<60>;
  d120: DieRange<120>;
  /** 1–100, shown as a tens die (00–90) and a units die (0–9); 00 + 0 is 100. */
  d100: DieRange<100>;
  /** The tens die of a percentile pair: 0 (shown as "00"), 10, …, 90. */
  'd10-tens': 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90;
  /** Fudge/Fate: −1, 0 or +1 (two faces each). */
  df: -1 | 0 | 1;
}

/** Name of a built-in die. */
export type DieType = keyof DieValueMap;

/** A die result: numbers for the built-in dice, numbers or strings for custom dice. */
export type DieValue = number | string;

/** A custom symbol: polylines in a unit box (x right, y down, coordinates from 0 to 1). */
export interface DieSymbol {
  readonly strokes: readonly (readonly (readonly [x: number, y: number])[])[];
}

/**
 * Label of a custom face: up to four characters from `0–9`, `+`, `-` and `−`, a
 * drawn {@link DieSymbol}, or `null`/`''` for a blank face. Default: `String(value)`.
 */
export type DieFaceLabel = string | DieSymbol | null;

export interface DieFaceDefinition<V extends DieValue = DieValue> {
  readonly value: V;
  readonly label?: DieFaceLabel;
}

/**
 * Geometry of a custom die: the shape of a built-in die (faces in that die's
 * value order, so face `i` sits where the built-in die shows `i + 1`), a
 * "log" prism with 3–24 numbered sides, or a trapezohedron with 2 × (3–24) kites.
 */
export type DieShape =
  | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8' | 'd10' | 'd12' | 'd14' | 'd16' | 'd20' | 'd24' | 'd30' | 'd48' | 'd60' | 'd120'
  | { readonly prism: number }
  | { readonly trapezohedron: number };

/** A user-defined die: any supported shape with custom outcomes and labels (repeats allowed). */
export interface CustomDieDefinition<V extends DieValue = DieValue> {
  /** Lowercase letters, digits and dashes; also names the skin template (`<id>-grid-v1`). */
  readonly id: string;
  readonly name?: string;
  readonly shape: DieShape;
  /** One entry per face (per corner for `'d4'`), in the shape's canonical order. */
  readonly faces: readonly DieFaceDefinition<V>[];
}

export interface DieFaceInfo<V extends DieValue = DieValue> {
  /** Index in skin layouts and templates. */
  readonly index: number;
  /** Result of the face; `null` for tetrahedron faces (results are read at the corners). */
  readonly value: V | null;
  /** Printed label(s); `''` for blank faces, corner labels separated by spaces. */
  readonly label: string;
}

/** Documented properties of a die type. */
export interface DieInfo<V extends DieValue = DieValue> {
  readonly type: string;
  readonly name: string;
  /** Physical shape, e.g. `'pentagonal trapezohedron'`. */
  readonly shape: string;
  /** `face`: the face towards the viewer; `vertex`: the top corner (D4); `pair`: tens + units dice (D100). */
  readonly reading: 'face' | 'vertex' | 'pair';
  /** Distinct results (numbers ascending). */
  readonly values: readonly V[];
  readonly defaultValue: V;
  readonly faces: readonly DieFaceInfo<V>[];
  /** Layout id accepted by `DieSkin.layout` (see {@link getDieTemplate}). */
  readonly templateId: string;
  /** The face label(s) that show a value, one per body (D100: tens, units). */
  labelsFor(value: V): readonly string[];
  /** Readable result text, e.g. `'+1'` for DF or `'00'` for the tens die. */
  format(value: V): string;
}

/** UV polygon of a face in its canonical vertex order (counter-clockwise on screen). */
export type FaceUVPolygon = readonly UV[];

export interface DieTemplateLabel {
  readonly label: string;
  /** Label center (normalized UV). */
  readonly center: UV;
  /** Clockwise rotation of the label's up direction from image up, in degrees. */
  readonly rotation: number;
  /** Side of the label cell in reference pixels. */
  readonly size: number;
  /** Glyph units per label cell (characters are 1 unit tall). */
  readonly glyphScale: number;
  /** Whether the label is underlined because it reads as another label upside down (6/9). */
  readonly marker: boolean;
  /** Strokes of a custom symbol label. */
  readonly symbol?: DieSymbol;
}

export interface DieTemplateFace {
  readonly index: number;
  readonly value: DieValue | null;
  readonly label: string;
  readonly uv: FaceUVPolygon;
  /** Where the overlay labels are drawn (for artwork with `numbers: 'in-texture'`). */
  readonly labels: readonly DieTemplateLabel[];
}

/** Grid skin template: every face upright in its own cell. */
export interface DieTemplate {
  readonly id: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly aspectTolerance: number;
  readonly faces: readonly DieTemplateFace[];
}

/**
 * A layout id (the die's {@link DieInfo.templateId}; the D20 also accepts
 * `'d20-net-v1'` and the per-value record) or one UV polygon per face.
 */
export type DieSkinLayout = string | readonly FaceUVPolygon[] | Readonly<Record<D20Value, FaceUV>>;

export interface DieSkin {
  source: D20SkinSource;
  layout: DieSkinLayout;
  /** `overlay` (default) draws the labels on top of the image. */
  numbers?: 'overlay' | 'in-texture';
}

export interface DieOptions<T extends DieType | CustomDieDefinition = DieType | CustomDieDefinition> {
  /** A built-in die type or a custom definition (see `defineDie`). */
  type: T;
  /** Initial result. Default: the type's {@link DieInfo.defaultValue}. */
  value?: DieValueOf<T>;
  theme?: Partial<D20Theme>;
  skin?: DieSkin;
  motion?: MotionMode;
  maxPixelRatio?: number;
}

/** Result type of a built-in type or custom definition. */
export type DieValueOf<T> = T extends DieType ? DieValueMap[T] : T extends CustomDieDefinition<infer V> ? V : DieValue;

export interface DieSnapshot<V extends DieValue = DieValue> {
  state: D20State;
  value: V;
  target: V | null;
}

export type DieAnimationResult<V extends DieValue = DieValue> =
  | { status: 'completed'; value: V }
  | { status: 'cancelled'; reason: 'replaced' | 'aborted' | 'disposed' };

/** A die of any type. Same lifecycle as {@link D20}. */
export interface Die<V extends DieValue = DieValue> {
  readonly info: DieInfo<V>;
  orientTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  rollTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  setValue(value: V): void;
  setTheme(theme: Partial<D20Theme>): void;
  setSkin(skin: DieSkin | null): void;
  setMotion(mode: MotionMode): void;
  getSnapshot(): Readonly<DieSnapshot<V>>;
  subscribe(listener: (state: Readonly<DieSnapshot<V>>) => void): () => void;
  dispose(): void;
}
