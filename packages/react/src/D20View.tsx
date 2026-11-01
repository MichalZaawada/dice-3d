import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ForwardedRef,
} from 'react';
import {
  createD20,
  D20_DEFAULT_THEME,
  D20Error,
  type AnimationOptions,
  type AnimationResult,
  type D20,
  type D20Skin,
  type D20Snapshot,
  type D20Theme,
  type D20Value,
  type MotionMode,
} from 'dice-3d';

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

interface Applied {
  value: D20Value;
  motion: MotionMode;
  themeKey: string;
  skin: D20Skin | null;
}

const NO_DIE: AnimationResult = Object.freeze({ status: 'cancelled', reason: 'disposed' });

function resolveTheme(theme: Partial<D20Theme> | undefined): D20Theme {
  return { ...D20_DEFAULT_THEME, ...theme };
}

function themeKey(theme: D20Theme): string {
  return [theme.bodyColor, theme.edgeColor, theme.numberColor, theme.background].join('|');
}

type ErrorHandlerRef = { readonly current: ((error: unknown) => void) | undefined };

function reportTo(handler: ErrorHandlerRef, error: unknown): void {
  if (handler.current) handler.current(error);
  else console.error(error);
}

function D20ViewImpl(props: D20ViewProps, ref: ForwardedRef<D20ViewHandle>) {
  const { value, motion = 'system', theme, skin = null, maxPixelRatio, className, style } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const dieRef = useRef<D20 | null>(null);
  const appliedRef = useRef<Applied | null>(null);
  const propsRef = useRef(props);
  const onErrorRef = useRef(props.onError);

  useEffect(() => {
    propsRef.current = props;
    onErrorRef.current = props.onError;
  });

  // Create the die after mount and dispose it on unmount (Strict Mode safe: each run owns its instance).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = propsRef.current;
    const initialTheme = resolveTheme(initial.theme);
    const initialMotion = initial.motion ?? 'system';
    const initialSkin = initial.skin ?? null;
    let die: D20;
    try {
      die = createD20(host, {
        value: initial.value,
        motion: initialMotion,
        theme: initialTheme,
        ...(initialSkin ? { skin: initialSkin } : {}),
        ...(maxPixelRatio !== undefined ? { maxPixelRatio } : {}),
      });
    } catch (error) {
      reportTo(onErrorRef, error);
      return;
    }
    dieRef.current = die;
    appliedRef.current = { value: initial.value, motion: initialMotion, themeKey: themeKey(initialTheme), skin: initialSkin };
    let ownDisposal = false;
    const unsubscribe = die.subscribe((snapshot) => {
      if (snapshot.state !== 'disposed' || ownDisposal) return;
      dieRef.current = null;
      appliedRef.current = null;
      reportTo(onErrorRef, new D20Error('CONTEXT_LOST', 'The die was disposed after its WebGL context was lost'));
    });
    return () => {
      ownDisposal = true;
      unsubscribe();
      die.dispose();
      if (dieRef.current === die) {
        dieRef.current = null;
        appliedRef.current = null;
      }
    };
  }, [maxPixelRatio]);

  // Push prop changes to the die; the core validates them.
  useEffect(() => {
    const die = dieRef.current;
    const applied = appliedRef.current;
    if (!die || !applied) return;
    const report = (error: unknown) => reportTo(onErrorRef, error);
    const run = (action: () => void) => {
      try {
        action();
      } catch (error) {
        report(error);
      }
    };
    if (motion !== applied.motion) {
      applied.motion = motion;
      run(() => die.setMotion(motion));
    }
    const nextTheme = resolveTheme(theme);
    const nextThemeKey = themeKey(nextTheme);
    if (nextThemeKey !== applied.themeKey) {
      applied.themeKey = nextThemeKey;
      run(() => die.setTheme(nextTheme));
    }
    if (skin !== applied.skin) {
      applied.skin = skin;
      run(() => die.setSkin(skin));
    }
    if (value !== applied.value) {
      applied.value = value;
      const snapshot = die.getSnapshot();
      const alreadyThere = snapshot.target === value || (snapshot.state === 'idle' && snapshot.value === value);
      if (!alreadyThere) {
        run(() => {
          die.orientTo(value).catch(report);
        });
      }
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      rollTo: (next, options) => dieRef.current?.rollTo(next, options) ?? Promise.resolve(NO_DIE),
      orientTo: (next, options) => dieRef.current?.orientTo(next, options) ?? Promise.resolve(NO_DIE),
      getSnapshot: () => dieRef.current?.getSnapshot() ?? null,
    }),
    [],
  );

  return <div ref={hostRef} className={className} style={style} data-dice-3d-view="" />;
}

/**
 * Renders a D20 into a `<div>`. The canvas is decorative: render the value as
 * text next to it (and an `aria-live` region if needed), also as the fallback
 * when WebGL2 is unavailable.
 */
export const D20View = forwardRef<D20ViewHandle, D20ViewProps>(D20ViewImpl);
D20View.displayName = 'D20View';
