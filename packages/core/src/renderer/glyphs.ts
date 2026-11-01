/**
 * Built-in stroke font for face numbers.
 *
 * Digits are polylines in a 0.6 × 1 box (y grows downwards) drawn with a round
 * stroke of {@link GLYPH_STROKE_WIDTH}. Using our own vector glyphs keeps the
 * output identical on every platform and avoids font files and font licensing.
 */
export type Point = readonly [number, number];
export type Polyline = readonly Point[];

export const GLYPH_WIDTH = 0.6;
export const GLYPH_HEIGHT = 1;
export const GLYPH_STROKE_WIDTH = 0.15;
export const GLYPH_ADVANCE = GLYPH_WIDTH + 0.24;
/** Vertical position (glyph units) of the orientation marker under 6 and 9. */
export const MARKER_Y = 1.24;

/** Elliptic arc using mathematical angles in degrees (counter-clockwise, y up) mapped to y-down space. */
function arc(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, segments = 24): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = ((fromDeg + ((toDeg - fromDeg) * i) / segments) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(angle), cy - ry * Math.sin(angle)]);
  }
  return points;
}

function quadratic(from: Point, control: Point, to: Point, segments = 12): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push([a * from[0] + b * control[0] + c * to[0], a * from[1] + b * control[1] + c * to[1]]);
  }
  return points;
}

const SIX: readonly Polyline[] = [
  arc(0.3, 0.68, 0.3, 0.32, 0, 360, 32),
  quadratic([0.52, 0.03], [0.02, 0.1], [0, 0.68]),
];

const rotateHalfTurn = (lines: readonly Polyline[]): Polyline[] =>
  lines.map((line) => line.map(([x, y]) => [GLYPH_WIDTH - x, GLYPH_HEIGHT - y] as Point));

export const DIGIT_GLYPHS: readonly (readonly Polyline[])[] = [
  /* 0 */ [arc(0.3, 0.5, 0.3, 0.5, 0, 360, 36)],
  /* 1 */ [
    [[0.1, 0.2], [0.34, 0], [0.34, 1]],
    [[0.12, 1], [0.56, 1]],
  ],
  /* 2 */ [[...arc(0.3, 0.28, 0.28, 0.28, 165, -35, 18), [0.02, 1], [0.6, 1]]],
  /* 3 */ [arc(0.3, 0.26, 0.26, 0.24, 150, -90, 18), arc(0.3, 0.75, 0.3, 0.25, 90, -150, 20)],
  /* 4 */ [[[0.46, 1], [0.46, 0], [0, 0.68], [0.6, 0.68]]],
  /* 5 */ [[[0.56, 0], [0.1, 0], [0.07, 0.47], ...arc(0.3, 0.68, 0.3, 0.32, 140, -150, 22)]],
  /* 6 */ SIX,
  /* 7 */ [[[0, 0], [0.6, 0], [0.2, 1]]],
  /* 8 */ [arc(0.3, 0.26, 0.25, 0.24, 0, 360, 28), arc(0.3, 0.74, 0.3, 0.26, 0, 360, 32)],
  /* 9 */ rotateHalfTurn(SIX),
];

const MINUS: readonly Polyline[] = [[[0.02, 0.5], [0.58, 0.5]]];
const PLUS: readonly Polyline[] = [...MINUS, [[0.3, 0.22], [0.3, 0.78]]];

/** Characters available for text labels. */
export const LABEL_GLYPHS: Readonly<Record<string, readonly Polyline[]>> = Object.freeze({
  ...Object.fromEntries(DIGIT_GLYPHS.map((glyph, digit) => [String(digit), glyph])),
  '+': PLUS,
  '-': MINUS,
  '\u2212': MINUS,
});

/** User-drawn symbol: polylines in a unit box (x right, y down, 0 to 1). */
export interface SymbolStrokes {
  readonly strokes: readonly (readonly (readonly [number, number])[])[];
}

export type LabelSource = string | SymbolStrokes;

const ROTATED_DIGIT: Readonly<Record<string, string>> = { '0': '0', '1': '1', '6': '9', '8': '8', '9': '6' };

/** The text a numeric label reads as when turned upside down, or null when it does not read as digits. */
export function rotatedReading(label: string): string | null {
  let result = '';
  for (const char of label) {
    const rotated = ROTATED_DIGIT[char];
    if (rotated === undefined) return null;
    result = rotated + result;
  }
  return result;
}

/**
 * Whether a label needs an orientation underline: it reads as a different
 * label of the same die when turned upside down (6 and 9 on a D20).
 */
export function needsOrientationMarker(label: number | string, labels?: Iterable<string>): boolean {
  const text = String(label);
  const set = new Set(labels ?? ['6', '9']);
  const rotated = rotatedReading(text);
  return rotated !== null && rotated !== text && set.has(rotated);
}

export function isSupportedText(text: string): boolean {
  return [...text].every((char) => char in LABEL_GLYPHS);
}

/** Width and vertical extent (glyph units, before the stroke) of a label drawn by {@link labelPolylines}. */
export function labelExtent(label: LabelSource, marker = false): { width: number; top: number; bottom: number } {
  if (typeof label !== 'string') return { width: 1, top: -0.5, bottom: 0.5 };
  const count = [...label].length;
  return { width: GLYPH_WIDTH + (count - 1) * GLYPH_ADVANCE, top: -0.5, bottom: marker ? MARKER_Y - 0.5 : 0.5 };
}

/**
 * Polylines of a label, centered horizontally on 0 with the glyphs spanning
 * y ∈ [-0.5, 0.5] (glyph units, y down). Symbols span a 1 × 1 box.
 * `marker` adds the orientation underline (defaults to the D20 rule for 6 and 9).
 */
export function labelPolylines(label: number | LabelSource, marker?: boolean): Polyline[] {
  if (typeof label === 'object') {
    return label.strokes.map((line) => line.map(([x, y]) => [x - 0.5, y - 0.5] as Point));
  }
  if (typeof label === 'number' && (!Number.isInteger(label) || label < 0)) throw new Error(`Unsupported label ${label}`);
  const text = String(label);
  const chars = [...text];
  const { width } = labelExtent(text);
  const left = -width / 2;
  const lines: Polyline[] = [];
  chars.forEach((char, index) => {
    const glyph = LABEL_GLYPHS[char];
    if (!glyph) throw new Error(`Unsupported label character ${JSON.stringify(char)}`);
    const offsetX = left + index * GLYPH_ADVANCE;
    for (const line of glyph) lines.push(line.map(([x, y]) => [x + offsetX, y - 0.5] as Point));
  });
  if (marker ?? needsOrientationMarker(text)) {
    lines.push([
      [left + 0.04, MARKER_Y - 0.5],
      [left + width - 0.04, MARKER_Y - 0.5],
    ]);
  }
  return lines;
}
