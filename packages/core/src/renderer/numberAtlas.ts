import { GLYPH_STROKE_WIDTH, labelExtent, labelPolylines, needsOrientationMarker, type LabelSource, type Point } from './glyphs.js';

/**
 * Signed-distance atlas with one square cell per label.
 *
 * The atlas is rasterized in plain JavaScript (no canvas, fonts or network) and
 * sampled as a single-channel texture; the shader turns the distance into an
 * anti-aliased edge at any on-screen size.
 */
export interface NumberAtlas {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  /** One byte per pixel; 128 is the stroke outline, larger values are inside. */
  readonly pixels: Uint8Array;
  /** Glyph units to cell fraction; {@link ATLAS_GLYPH_SCALE} unless a long label needs less. */
  readonly glyphScale: number;
  /** Cell index of a label key. */
  cellOf(label: number | string): readonly [column: number, row: number];
}

/** One atlas entry: `key` identifies the cell, `source` is the text or symbol drawn into it. */
export interface AtlasLabel {
  readonly key: string;
  readonly source: LabelSource;
  readonly marker: boolean;
}

/** Fraction of the cell covered by one glyph unit. */
export const ATLAS_GLYPH_SCALE = 0.5;
const SPREAD_PX = 6;
/** Fraction of the cell that the widest label may span. */
const MAX_LABEL_SPAN = 0.94;

/** Atlas of the numbers of a numeric die (D20: 1–20, with 6 and 9 underlined). */
export function createNumberAtlas(labels: readonly number[], columns = 5, cellSize = 128): NumberAtlas {
  const texts = labels.map(String);
  return createLabelAtlas(
    texts.map((text) => ({ key: text, source: text, marker: needsOrientationMarker(text, texts) })),
    columns,
    cellSize,
  );
}

/** Uniform glyph scale so that the widest (or tallest) label fits its cell. */
export function fittingScale(labels: readonly AtlasLabel[]): number {
  let extent = 0;
  for (const label of labels) {
    const { width, top, bottom } = labelExtent(label.source, label.marker);
    extent = Math.max(extent, width + GLYPH_STROKE_WIDTH, 2 * (Math.max(-top, bottom) + GLYPH_STROKE_WIDTH / 2));
  }
  return extent === 0 ? ATLAS_GLYPH_SCALE : Math.min(ATLAS_GLYPH_SCALE, MAX_LABEL_SPAN / extent);
}

export function createLabelAtlas(
  labels: readonly AtlasLabel[],
  columns = labels.length <= 25 ? 5 : Math.ceil(Math.sqrt(labels.length)),
  cellSize = 128,
): NumberAtlas {
  const rows = Math.max(1, Math.ceil(labels.length / columns));
  const width = columns * cellSize;
  const height = rows * cellSize;
  const distance = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
  const glyphScale = fittingScale(labels);
  const unitPx = glyphScale * cellSize;
  const halfStrokePx = (GLYPH_STROKE_WIDTH / 2) * unitPx;
  const reach = halfStrokePx + SPREAD_PX + 1;
  const cells = new Map<string, readonly [number, number]>();

  labels.forEach((label, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    cells.set(label.key, [column, row]);
    const originX = column * cellSize + cellSize / 2;
    const originY = row * cellSize + cellSize / 2;
    const toPx = ([x, y]: Point): Point => [originX + x * unitPx, originY + y * unitPx];
    for (const line of labelPolylines(label.source, label.marker)) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = toPx(line[i] as Point);
        const b = toPx(line[i + 1] as Point);
        const minX = Math.max(column * cellSize, Math.floor(Math.min(a[0], b[0]) - reach));
        const maxX = Math.min((column + 1) * cellSize - 1, Math.ceil(Math.max(a[0], b[0]) + reach));
        const minY = Math.max(row * cellSize, Math.floor(Math.min(a[1], b[1]) - reach));
        const maxY = Math.min((row + 1) * cellSize - 1, Math.ceil(Math.max(a[1], b[1]) + reach));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const d = segmentDistance(x + 0.5, y + 0.5, a, b);
            const offset = y * width + x;
            if (d < (distance[offset] as number)) distance[offset] = d;
          }
        }
      }
    }
  });

  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const signed = (distance[i] as number) - halfStrokePx;
    const encoded = 128 - (signed / SPREAD_PX) * 127;
    pixels[i] = Math.max(0, Math.min(255, Math.round(encoded)));
  }

  return {
    columns,
    rows,
    cellSize,
    width,
    height,
    pixels,
    glyphScale,
    cellOf(label) {
      const cell = cells.get(String(label));
      if (!cell) throw new Error(`Label ${label} is not part of the atlas`);
      return cell;
    },
  };
}

function segmentDistance(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
