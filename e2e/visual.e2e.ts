import { expect, test } from '@playwright/test';

// Produces review screenshots (test-results/visual-*) for manual inspection of every face,
// the 6/9 markers, the 96/160/320 CSS px sizes and light/dark backgrounds.
test('visual review sheet renders without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/e2e/fixture/review.html');
  await page.waitForFunction(() => (window as unknown as { reviewReady?: boolean }).reviewReady === true);
  await page.waitForTimeout(200);
  const path = testInfo.outputPath(`visual-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('review', { path, contentType: 'image/png' });
  expect(await page.locator("canvas[data-dice-3d]").count()).toBe(6);
  expect(await page.locator("canvas.capture").count()).toBe(60);
  expect(errors).toEqual([]);
});
