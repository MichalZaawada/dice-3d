import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFaceUV } from '../src/controller/skinValidation.js';
import { D20_DEFINITION, D20_VALUES } from '../src/geometry/d20.js';
import { D20_NET_V1, d20NetV1PixelFaces } from '../src/geometry/d20NetV1.js';

const templatesDir = fileURLToPath(new URL('../templates/', import.meta.url));

describe('d20-net-v1 template', () => {
  it('defines a non-mirrored equilateral triangle for every value', () => {
    const pixels = d20NetV1PixelFaces();
    for (const value of D20_VALUES) {
      const face = D20_NET_V1.faces[value];
      expect(() => validateFaceUV(face, `face ${value}`, D20_NET_V1.width, D20_NET_V1.height)).not.toThrow();
      const [a, b, c] = pixels[value];
      for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
        expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeCloseTo(D20_NET_V1.triangleSide, 3);
      }
      for (const [u, v] of face) {
        expect(u).toBeGreaterThan(0);
        expect(u).toBeLessThan(1);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('is a real unfolding: 19 net edges join faces that share the same 3D edge', () => {
    const key = (point: readonly number[]) => point.map((n) => n.toFixed(4)).join(',');
    let sharedNetEdges = 0;
    for (const first of D20_DEFINITION.faces) {
      for (const second of D20_DEFINITION.faces) {
        if (first.value >= second.value) continue;
        const shared3d = first.vertices.filter((vertex) => second.vertices.includes(vertex));
        const firstUV = D20_NET_V1.faces[first.value];
        const secondUV = D20_NET_V1.faces[second.value];
        const sharedUV = firstUV.filter((point) => secondUV.some((other) => key(other) === key(point)));
        if (sharedUV.length === 2) {
          sharedNetEdges++;
          // Faces touching in the net must also touch on the die, at the same vertices.
          expect(shared3d).toHaveLength(2);
          for (const vertex of shared3d) {
            const a = firstUV[first.vertices.indexOf(vertex)];
            const b = secondUV[second.vertices.indexOf(vertex)];
            expect(key(a!)).toBe(key(b!));
          }
        }
      }
    }
    expect(sharedNetEdges).toBe(19);
  });

  it('ships a JSON template that matches the library table', () => {
    const json = JSON.parse(readFileSync(`${templatesDir}d20-net-v1.json`, 'utf8'));
    expect(json.template).toBe('d20-net-v1');
    expect(json.version).toBe(1);
    expect(json.width).toBe(D20_NET_V1.width);
    expect(json.height).toBe(D20_NET_V1.height);
    expect(json.uvOrigin).toBe('top-left');
    expect(json.vertexOrder).toEqual(['A', 'B', 'C']);
    for (const value of D20_VALUES) expect(json.faces[String(value)]).toEqual(D20_NET_V1.faces[value]);
  });

  it('ships an SVG template with separate guide, number and artwork layers', () => {
    const svg = readFileSync(`${templatesDir}d20-net-v1.svg`, 'utf8');
    expect(svg).toContain(`viewBox="0 0 ${D20_NET_V1.width} ${D20_NET_V1.height}"`);
    for (const id of ['artwork', 'numbers', 'guides']) expect(svg).toMatch(new RegExp(`<g id="${id}"[^>]*inkscape:groupmode="layer"`));
    for (const value of D20_VALUES) expect(svg).toContain(`id="number-${value}"`);
    expect(svg).not.toMatch(/<text|font-family|https?:\/\/(?!www\.w3\.org|www\.inkscape\.org)/);
  });
});
