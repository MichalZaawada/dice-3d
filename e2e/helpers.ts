import { expect, type Locator, type Page } from '@playwright/test';

export const FIXTURE = '/e2e/fixture/index.html';

export async function openFixture(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(FIXTURE);
  await page.waitForFunction(() => (window as unknown as { fixtureReady?: boolean }).fixtureReady === true);
  return errors;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Screenshots `locator` and returns the colors at the given CSS-pixel offsets. */
export async function samplePixels(page: Page, locator: Locator, points: readonly (readonly [number, number])[]): Promise<Rgba[]> {
  const png = await locator.screenshot({ animations: 'disabled' });
  return page.evaluate(
    async ({ base64, points, ratio }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => {
        const [r, g, b, a] = context.getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data;
        return { r: r!, g: g!, b: b!, a: a! };
      });
    },
    { base64: png.toString('base64'), points: points as [number, number][], ratio: await page.evaluate(() => devicePixelRatio) },
  );
}

/** Hue in degrees, or null for unsaturated colors. */
export function hueOf({ r, g, b }: Rgba): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) return null;
  let hue: number;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  return (hue * 60 + 360) % 360;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function expectHue(color: Rgba, expected: number, label: string): void {
  const hue = hueOf(color);
  expect(hue, `${label}: ${JSON.stringify(color)}`).not.toBeNull();
  expect(hueDistance(hue!, expected % 360), `${label}: hue ${hue} vs ${expected % 360}`).toBeLessThan(7);
}
