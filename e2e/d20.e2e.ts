import { expect, test } from '@playwright/test';
import { expectHue, openFixture, samplePixels } from './helpers';

declare global {
  interface Window {
    dice: typeof import('@ticonemarsicano/dice-3d');
    die?: import('@ticonemarsicano/dice-3d').D20;
    testSkins: {
      createColumnSkin(): { canvas: HTMLCanvasElement; layout: Record<number, unknown> };
      createNetSkin(width?: number): HTMLCanvasElement;
      valueHue(value: number): number;
    };
    rafCalls?: number;
  }
}

const HOST = '#host';
const TOWARDS_A = [100, 82] as const;
const TOWARDS_BC = [100, 112] as const;
const VALUES = Array.from({ length: 20 }, (_, index) => index + 1);
const hue = (value: number) => (value - 1) * 18;

test.describe('D20 in a real browser', () => {
  test('every value faces the camera upright with a custom UV skin', async ({ page }) => {
    const errors = await openFixture(page);
    await page.evaluate(() => {
      const { canvas, layout } = window.testSkins.createColumnSkin();
      window.die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, {
        skin: { source: canvas, layout: layout as never, numbers: 'in-texture' },
        motion: 'none',
      });
    });
    const host = page.locator(HOST);
    for (const value of VALUES) {
      await page.evaluate((v) => window.die!.setValue(v as never), value);
      const [above, below] = await samplePixels(page, host, [TOWARDS_A, TOWARDS_BC]);
      expectHue(above!, hue(value), `value ${value} near A`);
      expectHue(below!, hue(value) + 180, `value ${value} near B-C`);
    }
    expect(errors).toEqual([]);
  });

  test('the d20-net-v1 template maps every face without mirroring', async ({ page }) => {
    await openFixture(page);
    await page.evaluate(() => {
      window.die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, {
        skin: { source: window.testSkins.createNetSkin(), layout: 'd20-net-v1', numbers: 'in-texture' },
        motion: 'none',
      });
    });
    const host = page.locator(HOST);
    for (const value of VALUES) {
      await page.evaluate((v) => window.die!.setValue(v as never), value);
      const [above, below, left, right] = await samplePixels(page, host, [TOWARDS_A, TOWARDS_BC, [88, 110], [112, 110]]);
      expectHue(above!, hue(value), `value ${value} near A`);
      expectHue(below!, hue(value) + 180, `value ${value} near B-C`);
      // Left and right of the lower half share the complementary hue: no mirrored or rotated artwork.
      expectHue(left!, hue(value) + 180, `value ${value} lower left`);
      expectHue(right!, hue(value) + 180, `value ${value} lower right`);
    }
  });

  test('default appearance draws an opaque die with an overlay number on a transparent canvas', async ({ page }) => {
    await openFixture(page);
    await page.evaluate(() => {
      document.body.style.background = '#00ff00';
      window.die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { value: 20 });
    });
    const host = page.locator(HOST);
    const [corner, face] = await samplePixels(page, host, [[3, 3], [120, 125]]);
    expect(corner).toMatchObject({ r: 0, g: 255, b: 0 });
    expect(face!.g).toBeLessThan(250);
    // Some dark number pixels exist around the center.
    const samples = await samplePixels(
      page,
      host,
      Array.from({ length: 21 }, (_, i) => [85 + i * 1.5, 100] as const),
    );
    expect(samples.some((pixel) => pixel.r < 90 && pixel.g < 90 && pixel.b < 90)).toBe(true);
  });

  test('rollTo resolves on the target and stops the frame loop when idle', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.requestAnimationFrame.bind(window);
      window.rafCalls = 0;
      window.requestAnimationFrame = (callback) => {
        window.rafCalls! += 1;
        return original(callback);
      };
    });
    await openFixture(page);
    const result = await page.evaluate(async () => {
      const die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { motion: 'full' });
      const states: string[] = [];
      die.subscribe((snapshot) => states.push(snapshot.state));
      const started = performance.now();
      const outcome = await die.rollTo(7, { durationMs: 600 });
      const elapsed = performance.now() - started;
      const framesAfterRoll = window.rafCalls!;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { outcome, elapsed, states, idleFrames: window.rafCalls! - framesAfterRoll, framesAfterRoll };
    });
    expect(result.outcome).toEqual({ status: 'completed', value: 7 });
    expect(result.elapsed).toBeGreaterThanOrEqual(590);
    expect(result.states).toEqual(['animating', 'idle']);
    expect(result.framesAfterRoll).toBeGreaterThan(5);
    expect(result.idleFrames).toBe(0);
  });

  test('replacement, abort and dispose settle every promise once', async ({ page }) => {
    await openFixture(page);
    const outcomes = await page.evaluate(async () => {
      const die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { motion: 'full' });
      const controller = new AbortController();
      const first = die.rollTo(3);
      const second = die.orientTo(4, { signal: controller.signal });
      setTimeout(() => controller.abort(), 50);
      const third = new Promise((resolve) => setTimeout(() => resolve(die.rollTo(5)), 100)).then((p) => p);
      await new Promise((resolve) => setTimeout(resolve, 150));
      die.dispose();
      die.dispose();
      return Promise.all([first, second, third, die.getSnapshot()]);
    });
    expect(outcomes).toEqual([
      { status: 'cancelled', reason: 'replaced' },
      { status: 'cancelled', reason: 'aborted' },
      { status: 'cancelled', reason: 'disposed' },
      { state: 'disposed', value: 20, target: null },
    ]);
  });

  test('dispose removes the canvas and releases the WebGL context', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#host')!;
      const die = window.dice.createD20(host, {});
      const canvas = host.querySelector('canvas')!;
      const context = canvas.getContext('webgl2')!;
      die.dispose();
      let code = '';
      try {
        die.setValue(3);
      } catch (error) {
        code = (error as { code: string }).code;
      }
      return { children: host.childElementCount, lost: context.isContextLost(), code };
    });
    expect(result).toEqual({ children: 0, lost: true, code: 'DISPOSED' });
  });

  test('resizes the drawing buffer and pauses at zero size', async ({ page }) => {
    await openFixture(page);
    const sizes = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>('#host')!;
      window.dice.createD20(host, { maxPixelRatio: 1 });
      const canvas = host.querySelector('canvas')!;
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await nextFrame();
      const initial = [canvas.width, canvas.height];
      host.style.width = '320px';
      host.style.height = '160px';
      await nextFrame();
      const resized = [canvas.width, canvas.height];
      host.style.display = 'none';
      await nextFrame();
      const hidden = [canvas.width, canvas.height];
      host.style.display = 'block';
      host.style.width = '96px';
      host.style.height = '96px';
      await nextFrame();
      return { initial, resized, hidden, restored: [canvas.width, canvas.height] };
    });
    expect(sizes.initial).toEqual([200, 200]);
    expect(sizes.resized).toEqual([320, 160]);
    expect(sizes.hidden).toEqual([320, 160]);
    expect(sizes.restored).toEqual([96, 96]);
  });

  test('reports WEBGL_UNAVAILABLE without leaving DOM changes', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2') return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await openFixture(page);
    const result = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('#host')!;
      try {
        window.dice.createD20(host);
        return { code: 'none', children: host.childElementCount };
      } catch (error) {
        return { code: (error as { code: string }).code, children: host.childElementCount };
      }
    });
    expect(result).toEqual({ code: 'WEBGL_UNAVAILABLE', children: 0 });
  });

  test('a lost context rejects the running animation and disposes the die', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>('#host')!;
      const die = window.dice.createD20(host, { motion: 'full' });
      const states: string[] = [];
      die.subscribe((snapshot) => states.push(snapshot.state));
      const roll = die.rollTo(9, { durationMs: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 100));
      host.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
      try {
        await roll;
        return { outcome: 'resolved' };
      } catch (error) {
        return {
          outcome: (error as { code: string }).code,
          name: (error as Error).name,
          snapshot: die.getSnapshot(),
          states,
          children: host.childElementCount,
        };
      }
    });
    expect(result).toEqual({
      outcome: 'CONTEXT_LOST',
      name: 'D20Error',
      snapshot: { state: 'disposed', value: 20, target: null },
      states: ['animating', 'disposed'],
      children: 0,
    });
  });

  test('invalid or failing skins keep the previous appearance', async ({ page }) => {
    await page.route('http://cross-origin.test/**', async (route) => {
      // Valid CRCs are required by WebKit's Linux PNG decoder.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBEfcD/ePF9e8AAAAASUVORK5CYII=',
        'base64',
      );
      await route.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
    await openFixture(page);
    await page.evaluate(() => {
      window.die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, {
        skin: { source: window.testSkins.createNetSkin(), layout: 'd20-net-v1', numbers: 'in-texture' },
        motion: 'none',
        value: 20,
      });
    });
    const host = page.locator(HOST);
    const [before] = await samplePixels(page, host, [TOWARDS_A]);
    const codes = await page.evaluate(async () => {
      const attempt = (skin: unknown) => {
        try {
          window.die!.setSkin(skin as never);
          return 'ok';
        } catch (error) {
          return (error as { code: string }).code;
        }
      };
      const undecoded = new Image();
      const crossOrigin = new Image();
      crossOrigin.src = 'http://cross-origin.test/net.png';
      await crossOrigin.decode();
      const probe = document.createElement('canvas').getContext('webgl2')!;
      const max = probe.getParameter(probe.MAX_TEXTURE_SIZE) as number;
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      const oversized = document.createElement('canvas');
      oversized.width = max + 2;
      oversized.height = (max + 2) / 2;
      const { layout } = window.testSkins.createColumnSkin();
      const badLayout = { ...layout, 7: [[0.5, 0], [1, 1], [0, 1]] };
      return {
        undecoded: attempt({ source: undecoded, layout: 'd20-net-v1' }),
        crossOrigin: attempt({ source: crossOrigin, layout: 'd20-net-v1' }),
        oversized: attempt({ source: oversized, layout: 'd20-net-v1' }),
        mirrored: attempt({ source: window.testSkins.createNetSkin(), layout: badLayout }),
        snapshot: window.die!.getSnapshot(),
      };
    });
    expect(codes).toEqual({
      undecoded: 'INVALID_ARGUMENT',
      crossOrigin: 'TEXTURE_UPLOAD_FAILED',
      oversized: 'INVALID_ARGUMENT',
      mirrored: 'INVALID_ARGUMENT',
      snapshot: { state: 'idle', value: 20, target: null },
    });
    const [after] = await samplePixels(page, host, [TOWARDS_A]);
    expect(after).toEqual(before);
  });

  test('skins can be swapped repeatedly, during animation and back to default', async ({ page }) => {
    await openFixture(page);
    const outcome = await page.evaluate(async () => {
      const die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { motion: 'full' });
      const net = window.testSkins.createNetSkin(512);
      for (let i = 0; i < 30; i++) die.setSkin({ source: net, layout: 'd20-net-v1' });
      const roll = die.rollTo(6, { durationMs: 400 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      die.setSkin({ source: await createImageBitmap(net), layout: 'd20-net-v1', numbers: 'in-texture' });
      const result = await roll;
      die.setSkin(null);
      return result;
    });
    expect(outcome).toEqual({ status: 'completed', value: 6 });
    const errors = await page.evaluate(() => {
      const canvas = document.querySelector('#host canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2')!;
      return gl.getError();
    });
    expect(errors).toBe(0);
  });

  test('two instances run independently', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(async () => {
      const second = document.createElement('div');
      second.className = 'host';
      document.body.append(second);
      const a = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { motion: 'full' });
      const b = window.dice.createD20(second, { motion: 'none', value: 1 });
      const roll = a.rollTo(10, { durationMs: 300 });
      b.setValue(2);
      b.dispose();
      return { a: await roll, b: b.getSnapshot(), aSnapshot: a.getSnapshot() };
    });
    expect(result.a).toEqual({ status: 'completed', value: 10 });
    expect(result.b.state).toBe('disposed');
    expect(result.aSnapshot).toEqual({ state: 'idle', value: 10, target: null });
  });
});

test.describe('motion preferences', () => {
  test.use({ reducedMotion: 'reduce' });

  test('system mode follows prefers-reduced-motion (at most 150 ms)', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(async () => {
      const die = window.dice.createD20(document.querySelector<HTMLElement>('#host')!, { motion: 'system' });
      const started = performance.now();
      const outcome = await die.rollTo(3);
      const reducedMs = performance.now() - started;
      die.setMotion('none');
      const instant = die.rollTo(4);
      const snapshot = die.getSnapshot();
      return { outcome, reducedMs, instant: await instant, snapshot };
    });
    expect(result.outcome).toEqual({ status: 'completed', value: 3 });
    expect(result.reducedMs).toBeLessThan(400);
    expect(result.instant).toEqual({ status: 'completed', value: 4 });
    expect(result.snapshot).toEqual({ state: 'idle', value: 4, target: null });
  });
});

test.describe('device pixel ratio', () => {
  test.use({ deviceScaleFactor: 3 });

  test('limits the drawing buffer by maxPixelRatio', async ({ page }) => {
    await openFixture(page);
    const sizes = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>('#host')!;
      const second = document.createElement('div');
      second.className = 'host';
      document.body.append(second);
      window.dice.createD20(host);
      window.dice.createD20(second, { maxPixelRatio: 3 });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [host.querySelector('canvas')!.width, second.querySelector('canvas')!.width];
    });
    expect(sizes).toEqual([400, 600]);
  });
});

test('importing the package creates nothing until createD20 is called', async ({ page }) => {
  await openFixture(page);
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  expect(canvases).toBe(0);
});
