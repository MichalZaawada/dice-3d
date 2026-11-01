import { act, cleanup, render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Die, DieAnimationResult, DieOptions, DieSnapshot, DieValue } from 'dice-3d';
import { D20Error, defineDie } from 'dice-3d';
import { DieView, type DieViewHandle } from '../src/index.js';

interface FakeDie extends Die {
  options: DieOptions;
  container: HTMLElement;
  snapshot: DieSnapshot;
  pending: ((result: DieAnimationResult) => void)[];
}

const created: FakeDie[] = [];
let createError: unknown = null;

vi.mock('dice-3d', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dice-3d')>();
  return {
    ...actual,
    createDie: vi.fn((container: HTMLElement, options: DieOptions) => {
      if (createError) throw createError;
      const info = actual.getDieInfo(options.type);
      if (options.value !== undefined && !info.values.includes(options.value as never)) {
        throw new actual.D20Error('INVALID_ARGUMENT', `options.value is not a ${info.name} result`);
      }
      const listeners = new Set<(snapshot: DieSnapshot) => void>();
      const emit = (snapshot: DieSnapshot) => {
        die.snapshot = snapshot;
        for (const listener of listeners) listener(snapshot);
      };
      // rollTo stays pending until the test settles it (or the die is disposed).
      const pendingRoll = (value: DieValue) =>
        new Promise<DieAnimationResult>((resolve) => {
          die.pending.push(resolve);
          emit({ state: 'animating', value: die.snapshot.value, target: value });
        });
      const die: FakeDie = {
        info: info as never,
        options,
        container,
        pending: [],
        snapshot: { state: 'idle', value: options.value ?? info.defaultValue, target: null },
        orientTo: vi.fn(async (value: DieValue) => ({ status: 'completed', value }) as const),
        rollTo: vi.fn(pendingRoll),
        setValue: vi.fn(),
        setTheme: vi.fn(),
        setSkin: vi.fn(),
        setMotion: vi.fn(),
        getSnapshot: vi.fn(() => die.snapshot),
        subscribe: vi.fn((listener: (snapshot: DieSnapshot) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }),
        dispose: vi.fn(() => {
          for (const resolve of die.pending.splice(0)) resolve({ status: 'cancelled', reason: 'disposed' });
          emit({ ...die.snapshot, state: 'disposed', target: null });
        }),
      };
      created.push(die);
      return die;
    }),
  };
});

beforeEach(() => {
  created.length = 0;
  createError = null;
});
afterEach(cleanup);

const live = () => created.filter((die) => die.snapshot.state !== 'disposed');

describe('DieView', () => {
  it('creates the requested type with the initial props and marks its container', () => {
    const { container, unmount } = render(<DieView type="d6" value={3} motion="none" className="dice" maxPixelRatio={1.5} />);
    const host = container.querySelector('div.dice') as HTMLElement;
    expect(host.dataset.dieType).toBe('d6');
    expect(created).toHaveLength(1);
    expect(created[0]!.container).toBe(host);
    expect(created[0]!.options).toMatchObject({ type: 'd6', value: 3, motion: 'none', maxPixelRatio: 1.5 });
    unmount();
    expect(created[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('switching type disposes the old die, creates exactly one new die and cancels its pending roll', async () => {
    const handle = createRef<DieViewHandle>();
    const { rerender } = render(<DieView ref={handle} type="d6" value={6} />);
    const first = created[0]!;
    let roll!: Promise<DieAnimationResult>;
    act(() => {
      roll = handle.current!.rollTo(4);
    });
    rerender(<DieView ref={handle} type="d100" value={100} />);
    await expect(roll).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.options).toMatchObject({ type: 'd100', value: 100 });
    // The handle now drives the new die only.
    act(() => {
      void handle.current!.rollTo(37);
    });
    expect(live()[0]!.rollTo).toHaveBeenCalledWith(37, undefined);
    expect(first.rollTo).toHaveBeenCalledTimes(1);
    expect(handle.current!.getSnapshot()).toMatchObject({ state: 'animating', target: 37 });
  });

  it('keeps one live die under Strict Mode and across rapid type switches', () => {
    const { rerender } = render(
      <StrictMode>
        <DieView type="d4" value={4} />
      </StrictMode>,
    );
    for (const [type, value] of [['d8', 8], ['df', 1], ['d10-tens', 0], ['d20', 20], ['d2', 1]] as const) {
      rerender(
        <StrictMode>
          <DieView type={type} value={value as never} />
        </StrictMode>,
      );
      expect(live()).toHaveLength(1);
      expect(live()[0]!.options.type).toBe(type);
    }
  });

  it('animates value changes on the current die and pushes theme, motion and skin changes', () => {
    const { rerender } = render(<DieView type="df" value={0} />);
    rerender(<DieView type="df" value={-1} motion="reduced" theme={{ bodyColor: '#123456' }} />);
    const die = created[0]!;
    expect(die.orientTo).toHaveBeenCalledWith(-1);
    expect(die.setMotion).toHaveBeenCalledWith('reduced');
    expect(die.setTheme).toHaveBeenCalledWith(expect.objectContaining({ bodyColor: '#123456' }));
  });

  it('recreates the die only when a custom definition changes identity', () => {
    const faces = Array.from({ length: 6 }, (_, index) => ({ value: index < 3 ? 'yes' : 'no', label: index < 3 ? '+' : '-' }));
    const coin = defineDie({ id: 'yes-no', shape: 'd6', faces });
    const { rerender } = render(<DieView type={coin} value="yes" />);
    rerender(<DieView type={coin} value="no" />);
    expect(created).toHaveLength(1);
    rerender(<DieView type={defineDie({ id: 'yes-no', shape: 'd6', faces })} value="no" />);
    expect(created).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it('reports creation errors (for example a value that does not belong to the new type)', () => {
    const onError = vi.fn();
    const { rerender } = render(<DieView type="d20" value={20} onError={onError} />);
    rerender(<DieView type="d6" value={20 as never} onError={onError} />);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(live()).toHaveLength(0);
    createError = new D20Error('WEBGL_UNAVAILABLE', 'no WebGL2');
    rerender(<DieView type="d8" value={8} onError={onError} />);
    expect(onError).toHaveBeenLastCalledWith(createError);
  });
});
