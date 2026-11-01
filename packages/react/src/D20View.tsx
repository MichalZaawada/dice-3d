import { forwardRef, useRef, type CSSProperties, type ForwardedRef } from 'react';
import {
  createD20,
  type AnimationOptions,
  type AnimationResult,
  type D20Skin,
  type D20Snapshot,
  type D20Theme,
  type D20Value,
  type MotionMode,
} from 'dice-3d';
import { useDieView, type DieLike, type DieViewHandleBase } from './useDieView.js';

export interface D20ViewProps {
  /** Displayed value. Changes animate with `orientTo`. */
  value: D20Value;
  /** Default: `system`. */
  motion?: MotionMode;
  /** Keys that are omitted use the library defaults. */
  theme?: Partial<D20Theme>;
  /** Compared by reference; pass a stable object. `null`/`undefined` means the default appearance. */
  skin?: D20Skin | null;
  /** Applied when the die is created; changing it recreates the die. */
  maxPixelRatio?: number;
  /** The container must get its size from CSS. */
  className?: string;
  style?: CSSProperties;
  /**
   * Receives `D20Error`s: creation failures (e.g. `WEBGL_UNAVAILABLE`), invalid
   * props, skin upload failures and `CONTEXT_LOST` after which the view stays empty.
   */
  onError?: (error: unknown) => void;
}

/** Imperative access for animations that a prop cannot express, such as rolling the same value again. */
export interface D20ViewHandle {
  /** Resolves `{ status: 'cancelled', reason: 'disposed' }` when no die is available. */
  rollTo(value: D20Value, options?: AnimationOptions): Promise<AnimationResult>;
  orientTo(value: D20Value, options?: AnimationOptions): Promise<AnimationResult>;
  /** `null` when no die is available (e.g. WebGL2 unavailable or during server rendering). */
  getSnapshot(): Readonly<D20Snapshot> | null;
}

const createD20Die = (host: HTMLDivElement, options: Parameters<typeof createD20>[1]) =>
  createD20(host, options) as unknown as DieLike<D20Value, D20Skin>;

function D20ViewImpl(props: D20ViewProps, ref: ForwardedRef<D20ViewHandle>) {
  const hostRef = useRef<HTMLDivElement>(null);
  useDieView<D20Value, D20Skin, D20ViewProps>(props, ref as ForwardedRef<DieViewHandleBase<D20Value>>, hostRef, createD20Die, 'd20');
  return <div ref={hostRef} className={props.className} style={props.style} data-dice-3d-view="" />;
}

/**
 * Renders a D20 into a `<div>`. The canvas is decorative: render the value as
 * text next to it (and an `aria-live` region if needed), also as the fallback
 * when WebGL2 is unavailable.
 */
export const D20View = forwardRef<D20ViewHandle, D20ViewProps>(D20ViewImpl);
D20View.displayName = 'D20View';
