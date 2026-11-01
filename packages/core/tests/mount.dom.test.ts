import { afterEach, describe, expect, it, vi } from 'vitest';
import { createD20 } from '../src/controller/createD20.js';
import { mountD20, type MountWindow } from '../src/controller/mountD20.js';
import { D20Error } from '../src/errors.js';
import { FakeEnvironment, FakeRenderer, fakeInspector, fakeSource } from './helpers.js';

class FakeMediaQueryList {
  readonly listeners = new Set<() => void>();
  constructor(readonly media: string) {}
  matches = false;
  addEventListener(_type: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners.delete(listener);
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
  resize(width: number, height: number) {
    const target = [...this.targets][0]!;
    this.callback([{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry], this as never);
  }
}

function setup(options: Record<string, unknown> = {}, devicePixelRatio = 3) {
  const queries: FakeMediaQueryList[] = [];
  const win: MountWindow & { devicePixelRatio: number } = {
    devicePixelRatio,
    matchMedia: (query: string) => {
      const list = new FakeMediaQueryList(query);
      queries.push(list);
      return list as unknown as MediaQueryList;
    },
    ResizeObserver: FakeResizeObserver as unknown as typeof ResizeObserver,
  };
  const renderer = new FakeRenderer();
  const environment = new FakeEnvironment();
  const container = document.createElement('div');
  document.body.append(container);
  const die = mountD20(container, options, {
    window: win,
    environment,
    createRenderer: () => renderer,
    inspectSource: fakeInspector,
  });
  const observer = FakeResizeObserver.instances.at(-1)!;
  return { die, renderer, environment, container, observer, queries, win };
}

afterEach(() => {
  document.body.replaceChildren();
  FakeResizeObserver.instances = [];
});

describe('mountD20', () => {
  it('appends one decorative canvas sized by CSS', () => {
    const { container } = setup();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(canvases[0]?.style.width).toBe('100%');
    expect(canvases[0]?.style.height).toBe('100%');
    expect(container.querySelector('[tabindex], button, input')).toBeNull();
  });

  it('resizes the drawing buffer with the device pixel ratio limited by maxPixelRatio', () => {
    const { observer, renderer } = setup({ maxPixelRatio: 2 });
    observer.resize(160, 100);
    expect(renderer.sizes.at(-1)).toEqual([320, 200]);
    const defaults = setup({}, 1.5);
    defaults.observer.resize(96, 96);
    expect(defaults.renderer.sizes.at(-1)).toEqual([144, 144]);
  });

  it('renders once per resize and suspends rendering at zero size', () => {
    const { observer, renderer } = setup();
    observer.resize(100, 100);
    const frames = renderer.poses.length;
    observer.resize(0, 0);
    expect(renderer.poses.length).toBe(frames);
    observer.resize(50, 50);
    expect(renderer.poses.length).toBe(frames + 1);
  });

  it('re-measures when the device pixel ratio changes', () => {
    const { container, renderer, queries, win } = setup({ maxPixelRatio: 4 }, 1);
    const canvas = container.querySelector('canvas')!;
    // jsdom has no layout; report the CSS size the browser would measure.
    Object.defineProperty(canvas, 'clientWidth', { value: 100 });
    Object.defineProperty(canvas, 'clientHeight', { value: 80 });
    const dprQuery = queries.find((query) => query.media.includes('dppx'))!;
    win.devicePixelRatio = 2;
    for (const listener of [...dprQuery.listeners]) listener();
    expect(renderer.sizes.at(-1)).toEqual([200, 160]);
    expect(dprQuery.listeners.size).toBe(0);
    expect(queries.at(-1)?.media).toBe('(resolution: 2dppx)');
  });

  it('dispose removes the canvas, observers and listeners', () => {
    const { die, container, observer, queries, renderer, environment } = setup();
    const canvas = container.querySelector('canvas')!;
    const removeListener = vi.spyOn(canvas, 'removeEventListener');
    die.dispose();
    expect(container.querySelector('canvas')).toBeNull();
    expect(observer.disconnected).toBe(true);
    expect(queries.every((query) => query.listeners.size === 0)).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(renderer.disposed).toBe(true);
    expect(environment.visibilityListeners.size + environment.motionListeners.size).toBe(0);
    expect(environment.scheduler.pendingFrames).toBe(0);
  });

  it('a lost WebGL context rejects the running animation and disposes the instance', async () => {
    const { die, container, renderer } = setup();
    const canvas = container.querySelector('canvas')!;
    const promise = die.rollTo(5);
    renderer.contextLost = true;
    canvas.dispatchEvent(new Event('webglcontextlost'));
    await expect(promise).rejects.toMatchObject({ name: 'D20Error', code: 'CONTEXT_LOST' });
    expect(die.getSnapshot().state).toBe('disposed');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('validates the container and options before touching the DOM', () => {
    const createRenderer = vi.fn(() => new FakeRenderer());
    const deps = { window: { devicePixelRatio: 1 }, environment: new FakeEnvironment(), createRenderer };
    expect(() => mountD20(null, {}, deps)).toThrow(D20Error);
    expect(() => mountD20({}, {}, deps)).toThrow(/HTMLElement/);
    const container = document.createElement('div');
    expect(() => mountD20(container, { value: 42 }, deps)).toThrow(/value/);
    expect(createRenderer).not.toHaveBeenCalled();
    expect(container.childElementCount).toBe(0);
  });

  it('cleans up when the initial skin is invalid or fails to upload', () => {
    const renderer = new FakeRenderer();
    const container = document.createElement('div');
    const deps = {
      window: { devicePixelRatio: 1 },
      environment: new FakeEnvironment(),
      createRenderer: () => renderer,
      inspectSource: fakeInspector,
    };
    expect(() => mountD20(container, { skin: { source: fakeSource(10, 10), layout: 'd20-net-v1' } }, deps)).toThrow(
      /2:1/,
    );
    expect(renderer.disposed).toBe(true);
    expect(container.childElementCount).toBe(0);

    const failing = new FakeRenderer();
    failing.failNextUpload = true;
    expect(() =>
      mountD20(container, { skin: { source: fakeSource(), layout: 'd20-net-v1' } }, { ...deps, createRenderer: () => failing }),
    ).toThrow(expect.objectContaining({ code: 'TEXTURE_UPLOAD_FAILED' }));
    expect(failing.disposed).toBe(true);
    expect(container.childElementCount).toBe(0);
  });
});

describe('createD20', () => {
  it('throws WEBGL_UNAVAILABLE and leaves no canvas when WebGL2 is missing', () => {
    const container = document.createElement('div');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => createD20(container)).toThrow(expect.objectContaining({ code: 'WEBGL_UNAVAILABLE' }));
    expect(container.childElementCount).toBe(0);
  });
});
