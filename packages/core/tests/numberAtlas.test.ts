import { describe, expect, it } from 'vitest';
import { D20_VALUES, d20FaceFrames } from '../src/geometry/d20.js';
import { buildDieMesh, MESH_STRIDE } from '../src/renderer/dieMesh.js';
import { labelPolylines, MARKER_Y, needsOrientationMarker } from '../src/renderer/glyphs.js';
import { ATLAS_GLYPH_SCALE, createNumberAtlas } from '../src/renderer/numberAtlas.js';

const atlas = createNumberAtlas([...D20_VALUES]);

function cellInk(label: number, predicate: (x: number, y: number) => boolean = () => true): number {
  const [column, row] = atlas.cellOf(label);
  let ink = 0;
  for (let y = 0; y < atlas.cellSize; y++) {
    for (let x = 0; x < atlas.cellSize; x++) {
      if (!predicate(x, y)) continue;
      const pixel = atlas.pixels[(row * atlas.cellSize + y) * atlas.width + column * atlas.cellSize + x] as number;
      if (pixel > 128) ink++;
    }
  }
  return ink;
}

describe('number atlas', () => {
  it('rasterizes every label into its own cell', () => {
    expect(atlas.width).toBe(640);
    expect(atlas.height).toBe(512);
    for (const value of D20_VALUES) expect(cellInk(value)).toBeGreaterThan(200);
  });

  it('leaves a clear border around every cell so labels never bleed into neighbors', () => {
    const border = 6;
    for (const value of D20_VALUES) {
      const ink = cellInk(value, (x, y) => x < border || y < border || x >= atlas.cellSize - border || y >= atlas.cellSize - border);
      expect(ink).toBe(0);
    }
  });

  it('marks 6 and 9 with an orientation underline and no other value', () => {
    const markerRow = Math.round(atlas.cellSize / 2 + (MARKER_Y - 0.5) * ATLAS_GLYPH_SCALE * atlas.cellSize);
    const markerBand = (_x: number, y: number) => Math.abs(y - markerRow) <= 1;
    for (const value of D20_VALUES) {
      const ink = cellInk(value, markerBand);
      if (needsOrientationMarker(value)) expect(ink).toBeGreaterThan(20);
      else expect(ink).toBe(0);
    }
  });

  it('draws 9 as 6 turned upside down', () => {
    const six = labelPolylines(6).slice(0, 2).flat();
    const nine = labelPolylines(9).slice(0, 2).flat();
    six.forEach(([x, y], index) => {
      expect(nine[index]?.[0]).toBeCloseTo(-x, 9);
      expect(nine[index]?.[1]).toBeCloseTo(-y, 9);
    });
  });
});

describe('die mesh', () => {
  it('builds three vertices per face with label coordinates centered on the face', () => {
    const mesh = buildDieMesh(d20FaceFrames(), atlas);
    expect(mesh.vertexCount).toBe(60);
    expect(mesh.data).toHaveLength(60 * MESH_STRIDE);
    for (let face = 0; face < 20; face++) {
      let u = 0;
      let v = 0;
      for (let corner = 0; corner < 3; corner++) {
        const offset = (face * 3 + corner) * MESH_STRIDE;
        u += mesh.data[offset + 9] as number;
        v += mesh.data[offset + 10] as number;
      }
      // The centroid maps to the cell center.
      expect(u / 3).toBeCloseTo(0.5, 5);
      expect(v / 3).toBeCloseTo(0.5, 5);
      // Vertex A is above the label (smaller v).
      expect(mesh.data[face * 3 * MESH_STRIDE + 10] as number).toBeLessThan(0);
    }
  });
});
