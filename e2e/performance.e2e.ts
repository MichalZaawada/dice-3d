import { expect, test } from '@playwright/test';
import { openFixture } from './helpers';

test.use({ deviceScaleFactor: 2 });

// Indicative measurement only: headless browsers on CI machines are not the reference device.
test('frame timing during a roll at 160 × 160 CSS px and DPR 2', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    const work: number[] = [];
    (window as unknown as { frameWork: number[] }).frameWork = work;
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        const start = performance.now();
        callback(time);
        work.push(performance.now() - start);
      });
  });
  await openFixture(page);
  const metrics = await page.evaluate(async () => {
    const host = document.querySelector<HTMLElement>('#host')!;
    host.style.width = '160px';
    host.style.height = '160px';
    const die = window.dice.createD20(host, { motion: 'full' });
    const intervals: number[] = [];
    let last = 0;
    let measuring = true;
    const tick = (time: number) => {
      if (last) intervals.push(time - last);
      last = time;
      if (measuring) requestAnimationFrame(tick);
    };
    const work = (window as unknown as { frameWork: number[] }).frameWork;
    work.length = 0;
    requestAnimationFrame(tick);
    for (const value of [3, 17, 8, 12, 20] as const) await die.rollTo(value);
    measuring = false;
    const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;
    return {
      canvas: [host.querySelector('canvas')!.width, host.querySelector('canvas')!.height],
      frames: intervals.length,
      p95IntervalMs: p95(intervals),
      p95CallbackMs: p95(work),
      userAgent: navigator.userAgent,
    };
  });
  testInfo.annotations.push({ type: 'frame-timing', description: JSON.stringify(metrics) });
  console.log(`[${testInfo.project.name}] ${JSON.stringify(metrics)}`);
  expect(metrics.canvas).toEqual([320, 320]);
  expect(metrics.frames).toBeGreaterThan(30);
  // Generous guard against regressions; the 16.7 ms target is checked on the reference device.
  expect(metrics.p95CallbackMs).toBeLessThan(16.7);
});
