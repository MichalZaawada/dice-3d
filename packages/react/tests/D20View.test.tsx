import { act, cleanup, render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D20, D20Options, D20Snapshot, D20Value } from '@ticone_marsicano/dice-3d';
import { D20Error } from '@ticone_marsicano/dice-3d';
import { D20View, type D20ViewHandle } from '../src/index.js';

interface FakeDie extends D20 {
  options: D20Options | undefined;
  container: HTMLElement;
  emit(snapshot: D20Snapshot): void;
  snapshot: D20Snapshot;
}

const created: FakeDie[] = [];
let createError: unknown = null;

vi.mock('@ticone_marsicano/dice-3d', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ticone_marsicano/dice-3d')>();
  return {
    ...actual,
    createD20: vi.fn((container: HTMLElement, options?: D20Options) => {
      if (createError) throw createError;
      const listeners = new Set<(snapshot: D20Snapshot) => void>();
      const die: FakeDie = {
        options,
        container,
        snapshot: { state: 'idle', value: options?.value ?? 20, target: null },
        emit(snapshot) {
          die.snapshot = snapshot;
          for (const listener of listeners) listener(snapshot);
        },
        orientTo: vi.fn(async (value: D20Value) => ({ status: 'completed', value }) as const),
        rollTo: vi.fn(async (value: D20Value) => ({ status: 'completed', value }) as const),
        setValue: vi.fn(),
        setTheme: vi.fn(),
        setSkin: vi.fn(),
        setMotion: vi.fn(),
        getSnapshot: vi.fn(() => die.snapshot),
        subscribe: vi.fn((listener: (snapshot: D20Snapshot) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }),
        dispose: vi.fn(() => {
          die.emit({ ...die.snapshot, state: 'disposed', target: null });
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

describe('D20View', () => {
  it('creates one die inside its container with the initial props and disposes it on unmount', () => {
    const { container, unmount } = render(
      <D20View value={7} motion="reduced" theme={{ bodyColor: '#123456' }} maxPixelRatio={1.5} className="dice" />,
    );
    const host = container.querySelector('div.dice');
    expect(created).toHaveLength(1);
    expect(created[0]!.container).toBe(host);
    expect(created[0]!.options).toMatchObject({
      value: 7,
      motion: 'reduced',
      maxPixelRatio: 1.5,
      theme: { bodyColor: '#123456', edgeColor: '#4a443c' },
    });
    unmount();
    expect(created[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('tolerates Strict Mode double effects and keeps exactly one live die', () => {
    const { unmount } = render(
      <StrictMode>
        <D20View value={3} />
      </StrictMode>,
    );
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(live()).toHaveLength(1);
    unmount();
    expect(live()).toHaveLength(0);
  });

  it('animates value changes with orientTo and skips values already targeted', () => {
    const { rerender } = render(<D20View value={3} />);
    const die = created[0]!;
    expect(die.orientTo).not.toHaveBeenCalled();
    rerender(<D20View value={9} />);
    expect(die.orientTo).toHaveBeenCalledWith(9);
    die.snapshot = { state: 'animating', value: 3, target: 12 };
    rerender(<D20View value={12} />);
    expect(die.orientTo).toHaveBeenCalledTimes(1);
  });

  it('applies motion, theme and skin changes only when they change', () => {
    const skin = { source: document.createElement('canvas'), layout: 'd20-net-v1' as const };
    const { rerender } = render(<D20View value={3} theme={{ bodyColor: '#111111' }} skin={skin} />);
    const die = created[0]!;
    rerender(<D20View value={3} theme={{ bodyColor: '#111111' }} skin={skin} />);
    expect(die.setTheme).not.toHaveBeenCalled();
    expect(die.setSkin).not.toHaveBeenCalled();
    expect(die.setMotion).not.toHaveBeenCalled();

    rerender(<D20View value={3} motion="none" theme={{ bodyColor: '#222222' }} skin={null} />);
    expect(die.setMotion).toHaveBeenCalledWith('none');
    expect(die.setTheme).toHaveBeenCalledWith(expect.objectContaining({ bodyColor: '#222222', background: 'transparent' }));
    expect(die.setSkin).toHaveBeenCalledWith(null);

    rerender(<D20View value={3} motion="none" />);
    // Removing a theme key restores the library default for it.
    expect(die.setTheme).toHaveBeenLastCalledWith(expect.objectContaining({ bodyColor: '#f2ede4' }));
  });

  it('reports creation failures through onError and renders an empty container', () => {
    createError = new D20Error('WEBGL_UNAVAILABLE', 'no webgl');
    const onError = vi.fn();
    const ref = createRef<D20ViewHandle>();
    const { container } = render(<D20View ref={ref} value={5} onError={onError} className="dice" />);
    expect(onError).toHaveBeenCalledWith(createError);
    expect(container.querySelector('div.dice')?.childElementCount).toBe(0);
    expect(ref.current?.getSnapshot()).toBeNull();
    return expect(ref.current?.rollTo(5)).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
  });

  it('reports setter errors through onError instead of throwing during commit', () => {
    const onError = vi.fn();
    const { rerender } = render(<D20View value={3} onError={onError} />);
    const failure = new D20Error('TEXTURE_UPLOAD_FAILED', 'upload failed');
    vi.mocked(created[0]!.setSkin).mockImplementation(() => {
      throw failure;
    });
    rerender(<D20View value={3} onError={onError} skin={{ source: document.createElement('canvas'), layout: 'd20-net-v1' }} />);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('reports CONTEXT_LOST when the die is disposed by the library', () => {
    const onError = vi.fn();
    render(<D20View value={3} onError={onError} />);
    act(() => created[0]!.emit({ state: 'disposed', value: 3, target: null }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONTEXT_LOST' }));
  });

  it('does not report anything after unmount', () => {
    const onError = vi.fn();
    const { unmount } = render(<D20View value={3} onError={onError} />);
    unmount();
    expect(onError).not.toHaveBeenCalled();
  });

  it('exposes rollTo and orientTo through a ref', async () => {
    const ref = createRef<D20ViewHandle>();
    render(<D20View ref={ref} value={3} />);
    await expect(ref.current!.rollTo(3)).resolves.toEqual({ status: 'completed', value: 3 });
    expect(created[0]!.rollTo).toHaveBeenCalledWith(3, undefined);
    expect(ref.current!.getSnapshot()).toEqual({ state: 'idle', value: 3, target: null });
  });

  it('recreates the die when maxPixelRatio changes', () => {
    const { rerender } = render(<D20View value={3} maxPixelRatio={1} />);
    rerender(<D20View value={4} maxPixelRatio={2} />);
    expect(created).toHaveLength(2);
    expect(created[0]!.dispose).toHaveBeenCalled();
    expect(created[1]!.options).toMatchObject({ value: 4, maxPixelRatio: 2 });
    expect(live()).toHaveLength(1);
  });
});
