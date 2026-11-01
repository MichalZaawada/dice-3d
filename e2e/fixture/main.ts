// Test-only page: exposes the public package API and texture helpers to Playwright.
import * as dice from '@ticone_marsicano/dice-3d';
import type { D20Value, FaceUV } from '@ticone_marsicano/dice-3d';

/** Hue (degrees) that identifies a value in the test skins. */
export const valueHue = (value: number): number => (value - 1) * 18;

function hsl(hue: number): string {
  return `hsl(${hue % 360} 100% 50%)`;
}

/**
 * Custom-UV skin: one column per value; the half near vertex A uses the value's
 * hue and the half near the B–C edge uses the complementary hue.
 */
function createColumnSkin(): { canvas: HTMLCanvasElement; layout: Record<D20Value, FaceUV> } {
  const columnWidth = 64;
  const canvas = document.createElement('canvas');
  canvas.width = columnWidth * 20;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const layout = {} as Record<D20Value, FaceUV>;
  for (const value of dice.D20_VALUES) {
    const x = (value - 1) * columnWidth;
    context.fillStyle = hsl(valueHue(value));
    context.fillRect(x, 0, columnWidth, canvas.height / 2);
    context.fillStyle = hsl(valueHue(value) + 180);
    context.fillRect(x, canvas.height / 2, columnWidth, canvas.height / 2);
    const left = (x + 6) / canvas.width;
    const right = (x + columnWidth - 6) / canvas.width;
    layout[value] = [[(left + right) / 2, 0.02], [left, 0.98], [right, 0.98]];
  }
  return { canvas, layout };
}

/** Skin on the official d20-net-v1 template using the same color code as {@link createColumnSkin}. */
function createNetSkin(width = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width / 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#808080';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const value of dice.D20_VALUES) {
    const toPixel = ([u, v]: readonly [number, number]) => [u * canvas.width, v * canvas.height] as const;
    const [faceA, faceB, faceC] = dice.D20_NET_V1.faces[value];
    const a = toPixel(faceA);
    const b = toPixel(faceB);
    const c = toPixel(faceC);
    const middle = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2] as const;
    const gradient = context.createLinearGradient(a[0], a[1], middle[0], middle[1]);
    gradient.addColorStop(0, hsl(valueHue(value)));
    gradient.addColorStop(0.5, hsl(valueHue(value)));
    gradient.addColorStop(0.5, hsl(valueHue(value) + 180));
    gradient.addColorStop(1, hsl(valueHue(value) + 180));
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.lineTo(c[0], c[1]);
    context.closePath();
    context.fill();
    // Bleed: stroke the triangle in the same colors to avoid seams.
    context.strokeStyle = gradient;
    context.lineWidth = 6;
    context.stroke();
  }
  return canvas;
}

const testWindow = window as unknown as Record<string, unknown>;
testWindow.dice = dice;
testWindow.testSkins = { createColumnSkin, createNetSkin, valueHue };
testWindow.fixtureReady = true;
