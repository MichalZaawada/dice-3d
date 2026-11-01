export type LinearRGB = readonly [number, number, number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/** Parses `#RRGGBB` into sRGB channels in 0..1. */
export function parseHexColor(hex: string): LinearRGB {
  if (!isHexColor(hex)) throw new Error(`Invalid color ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** `#RRGGBB` to linear-light RGB, used for lighting in the shader. */
export function hexToLinear(hex: string): LinearRGB {
  const [r, g, b] = parseHexColor(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
