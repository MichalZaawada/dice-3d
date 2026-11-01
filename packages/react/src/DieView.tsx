import { forwardRef, useRef, type CSSProperties, type ForwardedRef, type ReactElement, type Ref } from 'react';
import {
  createDie,
  type CustomDieDefinition,
  type D20Theme,
  type DieSkin,
  type DieType,
  type DieValueOf,
  type MotionMode,
} from '@ticone_marsicano/dice-3d';
import { useDieView, type DieLike, type DieViewHandleBase } from './useDieView.js';

export interface DieViewProps<T extends DieType | CustomDieDefinition = DieType | CustomDieDefinition> {
  /**
   * Built-in type (`'d6'`, `'d100'`, `'df'`, …) or a custom definition (keep the
   * same object between renders). Changing it disposes the die and creates a new one.
   */
  type: T;
  /** Displayed result; must belong to `type`. Changes animate with `orientTo`. */
  value: DieValueOf<T>;
  /** Default: `system`. */
  motion?: MotionMode;
  /** Keys that are omitted use the library defaults. */
  theme?: Partial<D20Theme>;
  /** Compared by reference; must use a layout for `type`. `null`/`undefined` means the default appearance. */
  skin?: DieSkin | null;
  /** Applied when the die is created; changing it recreates the die. */
  maxPixelRatio?: number;
  /** The container must get its size from CSS. */
  className?: string;
  style?: CSSProperties;
  /** Receives `D20Error`s (creation failures, invalid props, skin upload failures, `CONTEXT_LOST`). */
  onError?: (error: unknown) => void;
}

/** Imperative access to the current die (a new instance after `type` changes). */
export type DieViewHandle<T extends DieType | CustomDieDefinition = DieType | CustomDieDefinition> = DieViewHandleBase<DieValueOf<T>>;

const createAnyDie = (host: HTMLDivElement, options: object, props: DieViewProps) =>
  createDie(host, { ...options, type: props.type } as Parameters<typeof createDie>[1]) as unknown as DieLike<
    DieValueOf<DieType>,
    DieSkin
  >;

function DieViewImpl(props: DieViewProps, ref: ForwardedRef<DieViewHandle>) {
  const hostRef = useRef<HTMLDivElement>(null);
  useDieView(props as never, ref as never, hostRef, createAnyDie as never, props.type);
  return <div ref={hostRef} className={props.className} style={props.style} data-dice-3d-view="" data-die-type={typeof props.type === 'string' ? props.type : props.type.id} />;
}

const DieViewComponent = forwardRef<DieViewHandle, DieViewProps>(DieViewImpl);
DieViewComponent.displayName = 'DieView';

/**
 * Renders any die into a `<div>`. The canvas is decorative: render the result
 * as text next to it (`info.format(value)` from `getDieInfo`).
 */
export const DieView = DieViewComponent as unknown as <T extends DieType | CustomDieDefinition>(
  props: DieViewProps<T> & { ref?: Ref<DieViewHandle<T>> },
) => ReactElement;
