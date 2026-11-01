import { useEffect, useImperativeHandle, useRef, type ForwardedRef } from 'react';
import {
  D20_DEFAULT_THEME,
  D20Error,
  type AnimationOptions,
  type D20Theme,
  type DieAnimationResult,
  type DieSnapshot,
  type DieValue,
  type MotionMode,
} from 'dice-3d';

/** Props shared by `D20View` and `DieView`. */
export interface DieViewBaseProps<V extends DieValue, S> {
  value: V;
  motion?: MotionMode | undefined;
  theme?: Partial<D20Theme> | undefined;
  skin?: S | null | undefined;
  maxPixelRatio?: number | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

/** The lifecycle surface both `createD20` and `createDie` return. */
export interface DieLike<V extends DieValue, S> {
  orientTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  rollTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  setTheme(theme: Partial<D20Theme>): void;
  setSkin(skin: S | null): void;
  setMotion(mode: MotionMode): void;
  getSnapshot(): Readonly<DieSnapshot<V>>;
  subscribe(listener: (snapshot: Readonly<DieSnapshot<V>>) => void): () => void;
  dispose(): void;
}

export interface CreateOptions<V extends DieValue, S> {
  value: V;
  motion: MotionMode;
  theme: D20Theme;
  skin?: S;
  maxPixelRatio?: number;
}

export interface DieViewHandleBase<V extends DieValue> {
  /** Resolves `{ status: 'cancelled', reason: 'disposed' }` when no die is available. */
  rollTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  orientTo(value: V, options?: AnimationOptions): Promise<DieAnimationResult<V>>;
  /** `null` when no die is available (e.g. WebGL2 unavailable or during server rendering). */
  getSnapshot(): Readonly<DieSnapshot<V>> | null;
}

interface Applied<V, S> {
  value: V;
  motion: MotionMode;
  themeKey: string;
  skin: S | null;
}

const NO_DIE = Object.freeze({ status: 'cancelled', reason: 'disposed' } as const);

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

/**
 * Shared implementation: creates the die after mount, recreates it when
 * `maxPixelRatio` or `identity` (the die type) changes, disposes it on
 * unmount (Strict Mode safe: each effect run owns its instance) and pushes
 * prop changes to the live instance.
 */
export function useDieView<V extends DieValue, S extends object, P extends DieViewBaseProps<V, S>>(
  props: P,
  ref: ForwardedRef<DieViewHandleBase<V>>,
  host: { readonly current: HTMLDivElement | null },
  create: (host: HTMLDivElement, options: CreateOptions<V, S>, props: P) => DieLike<V, S>,
  identity: unknown,
): void {
  const { value, motion = 'system', theme, skin = null, maxPixelRatio } = props;
  const dieRef = useRef<DieLike<V, S> | null>(null);
  const appliedRef = useRef<Applied<V, S> | null>(null);
  const propsRef = useRef(props);
  const createRef = useRef(create);
  const onErrorRef = useRef(props.onError);

  useEffect(() => {
    propsRef.current = props;
    createRef.current = create;
    onErrorRef.current = props.onError;
  });

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const initial = propsRef.current;
    const initialTheme = resolveTheme(initial.theme);
    const initialMotion = initial.motion ?? 'system';
    const initialSkin = initial.skin ?? null;
    let die: DieLike<V, S>;
    try {
      die = createRef.current(
        element,
        {
          value: initial.value,
          motion: initialMotion,
          theme: initialTheme,
          ...(initialSkin ? { skin: initialSkin } : {}),
          ...(maxPixelRatio !== undefined ? { maxPixelRatio } : {}),
        },
        initial,
      );
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
  }, [maxPixelRatio, identity, host]);

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
}

