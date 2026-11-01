import { expect, test } from '@playwright/test';
import { hueDistance, hueOf, openFixture, samplePixels } from './helpers';

const hueOfFace = (index: number) => (index % 12) * 30;

const TYPES = ['d2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd10', 'd12', 'd14', 'd16', 'd20', 'd24', 'd30', 'd48', 'd60', 'd120', 'd100', 'd10-tens', 'df'];

test.describe('every die type in a real browser', () => {
  for (const type of TYPES) {
    test(`${type}: each result turns the matching face of its grid template towards the camera`, async ({ page }) => {
      const errors = await openFixture(page);
      const faces = await page.evaluate((type) => {
        const { dice } = window;
        const template = dice.getDieTemplate(type as never);
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = Math.round(1024 / template.aspectRatio);
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#808080';
        context.fillRect(0, 0, canvas.width, canvas.height);
        for (const face of template.faces) {
          context.fillStyle = `hsl(${(face.index % 12) * 30} 100% 50%)`;
          context.strokeStyle = context.fillStyle;
          context.lineWidth = 8;
          context.beginPath();
          face.uv.forEach(([u, v], i) => (i ? context.lineTo(u * canvas.width, v * canvas.height) : context.moveTo(u * canvas.width, v * canvas.height)));
          context.closePath();
          context.fill();
          context.stroke();
        }
        window.die = dice.createDie(document.querySelector<HTMLElement>('#host')!, {
          type: type as never,
          motion: 'none',
          skin: { source: canvas, layout: template.id, numbers: 'in-texture' },
        }) as never;
        const info = dice.getDieInfo(type as never);
        return { values: [...info.values] as unknown as number[], faces: info.faces.map((face) => ({ value: face.value, label: face.label })) };
      }, type);

      const host = page.locator('#host');
      for (const value of faces.values) {
        await page.evaluate((v) => (window.die as unknown as { setValue(v: number): void }).setValue(v), value);
        const parts = type === 'd100' ? [Math.floor((value % 100) / 10) * 10, value % 10] : [value];
        // D100: tens die on the left (faces 0–9), units die on the right (faces 10–19).
        const points = type === 'd100' ? ([[51, 100], [149, 100]] as const) : ([[100, 100]] as const);
        const pixels = await samplePixels(page, host, points);
        parts.forEach((part, body) => {
          const candidates = faces.faces
            .map((face, index) => ({ ...face, index }))
            .filter((face) => (type === 'd100' ? (body === 0 ? face.index < 10 : face.index >= 10) : true))
            .filter((face) => (type === 'd4' ? face.label.split(' ').includes(String(part)) : face.value === part))
            .map((face) => hueOfFace(face.index));
          const hue = hueOf(pixels[body]!);
          expect(hue, `${type} ${value}: ${JSON.stringify(pixels[body])}`).not.toBeNull();
          const distance = Math.min(...candidates.map((candidate) => hueDistance(hue!, candidate)));
          expect(distance, `${type} ${value} (body ${body}): hue ${hue} vs ${candidates.join('/')}`).toBeLessThan(10);
        });
      }
      expect(errors).toEqual([]);
    });
  }

  test('rolls, cancels and disposes a percentile pair and a DF die without leaking canvases', async ({ page }) => {
    const errors = await openFixture(page);
    const results = await page.evaluate(async () => {
      const { dice } = window;
      const host = document.querySelector<HTMLElement>('#host')!;
      const d100 = dice.createDie(host, { type: 'd100', motion: 'full' });
      const rolled = await d100.rollTo(37, { durationMs: 300 });
      const controller = new AbortController();
      const aborted = d100.rollTo(100, { signal: controller.signal });
      controller.abort();
      const pending = d100.rollTo(55);
      d100.dispose();
      const df = dice.createDie(host, { type: 'df', motion: 'full' });
      const fate = await df.rollTo(-1, { durationMs: 200 });
      const canvases = host.querySelectorAll('canvas').length;
      df.dispose();
      return { rolled, aborted: await aborted, pending: await pending, fate, canvases, after: host.querySelectorAll('canvas').length };
    });
    expect(results).toEqual({
      rolled: { status: 'completed', value: 37 },
      aborted: { status: 'cancelled', reason: 'aborted' },
      pending: { status: 'cancelled', reason: 'disposed' },
      fate: { status: 'completed', value: -1 },
      canvases: 1,
      after: 0,
    });
    expect(errors).toEqual([]);
  });

  test('default overlay labels draw ink on every type', async ({ page }) => {
    await openFixture(page);
    for (const type of ['d4', 'd6', 'd12', 'd100', 'df', 'd120']) {
      await page.evaluate((type) => {
        window.die?.dispose();
        window.die = window.dice.createDie(document.querySelector<HTMLElement>('#host')!, { type: type as never, motion: 'none' }) as never;
      }, type);
      const samples = await samplePixels(page, page.locator('#host'), Array.from({ length: 41 }, (_, i) => [60 + i * 2, 100] as const));
      expect(samples.some((pixel) => pixel.r < 90 && pixel.g < 90 && pixel.b < 90), type).toBe(true);
    }
  });
});
