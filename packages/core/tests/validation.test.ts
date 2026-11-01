import { describe, expect, it } from 'vitest';
import { prepareSkin } from '../src/controller/skinValidation.js';
import { DEFAULT_THEME, mergeTheme, validateAnimationOptions, validateD20Options } from '../src/controller/validation.js';
import { D20Error, isD20Error } from '../src/errors.js';
import { D20_VALUES } from '../src/geometry/d20.js';
import { D20_NET_V1 } from '../src/geometry/d20NetV1.js';
import { builtInDieModel } from '../src/geometry/dice.js';
import type { D20Value, FaceUV } from '../src/types.js';
import { fakeInspector, fakeSource } from './helpers.js';

function expectInvalid(action: () => unknown, message?: RegExp): void {
  try {
    action();
  } catch (error) {
    expect(isD20Error(error)).toBe(true);
    expect((error as D20Error).code).toBe('INVALID_ARGUMENT');
    if (message) expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error('Expected INVALID_ARGUMENT');
}

describe('option validation', () => {
  it('applies documented defaults', () => {
    expect(validateD20Options(undefined)).toEqual({
      value: 20,
      theme: DEFAULT_THEME,
      motion: 'system',
      maxPixelRatio: 2,
      skin: undefined,
    });
  });

  it.each([0, 21, 2.5, '3', Number.NaN])('rejects value %s', (value) => {
    expectInvalid(() => validateD20Options({ value }), /value/);
  });

  it.each([0.5, Number.POSITIVE_INFINITY, Number.NaN, '2'])('rejects maxPixelRatio %s', (maxPixelRatio) => {
    expectInvalid(() => validateD20Options({ maxPixelRatio }), /maxPixelRatio/);
  });

  it('rejects unknown motion modes and non-object options', () => {
    expectInvalid(() => validateD20Options({ motion: 'slow' }), /motion/);
    expectInvalid(() => validateD20Options(42));
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN, '100'])('rejects durationMs %s', (durationMs) => {
    expectInvalid(() => validateAnimationOptions({ durationMs }), /durationMs/);
  });

  it('accepts durationMs 0 and an AbortSignal', () => {
    const signal = new AbortController().signal;
    expect(validateAnimationOptions({ durationMs: 0, signal })).toEqual({ durationMs: 0, signal });
    expectInvalid(() => validateAnimationOptions({ signal: {} }), /signal/);
  });

  it('accepts #RRGGBB colors and transparent backgrounds only', () => {
    expect(mergeTheme(DEFAULT_THEME, { bodyColor: '#AABBCC', background: 'transparent' }).bodyColor).toBe('#AABBCC');
    expect(mergeTheme(DEFAULT_THEME, { background: '#000000' }).background).toBe('#000000');
    for (const color of ['red', '#abc', '#abcdeg', 'rgb(0,0,0)', 123, 'transparent']) {
      expectInvalid(() => mergeTheme(DEFAULT_THEME, { bodyColor: color }), /bodyColor/);
    }
    expectInvalid(() => mergeTheme(DEFAULT_THEME, { background: 'none' }), /background/);
  });
});

describe('skin validation', () => {
  const options = { maxTextureSize: 4096, model: builtInDieModel('d20'), inspect: fakeInspector };

  function customLayout(): Record<D20Value, FaceUV> {
    const layout = {} as Record<D20Value, FaceUV>;
    for (const value of D20_VALUES) {
      const left = (value - 1) / 20;
      const right = value / 20;
      layout[value] = [[(left + right) / 2, 0], [left, 1], [right, 1]];
    }
    return layout;
  }

  it('accepts the official template and defaults numbers to overlay', () => {
    const prepared = prepareSkin({ source: fakeSource(1024, 512), layout: 'd20-net-v1' }, options);
    expect(prepared.numbers).toBe('overlay');
    expect(prepared.faces).toHaveLength(20);
    expect(prepared.faces[0]).toEqual(D20_NET_V1.faces[1]);
  });

  it('accepts a custom layout and copies it', () => {
    const layout = customLayout();
    const prepared = prepareSkin({ source: fakeSource(400, 400), layout, numbers: 'in-texture' }, options);
    expect(prepared.numbers).toBe('in-texture');
    (layout as Record<number, unknown>)[1] = 'mutated later';
    expect(prepared.faces[0]).toEqual([[0.025, 0], [0, 1], [0.05, 1]]);
  });

  it('rejects unsupported, undecoded and oversized sources', () => {
    expectInvalid(() => prepareSkin({ source: {}, layout: 'd20-net-v1' }, options), /HTMLImageElement/);
    expectInvalid(() => prepareSkin({ source: fakeSource(2048, 1024, false), layout: 'd20-net-v1' }, options), /decoded/);
    expectInvalid(() => prepareSkin({ source: fakeSource(0, 0), layout: 'd20-net-v1' }, options), /decoded/);
    expectInvalid(() => prepareSkin({ source: fakeSource(8192, 4096), layout: 'd20-net-v1' }, options), /MAX_TEXTURE_SIZE/);
  });

  it('checks the template aspect ratio', () => {
    expectInvalid(() => prepareSkin({ source: fakeSource(1000, 1000), layout: 'd20-net-v1' }, options), /2:1/);
    expect(() => prepareSkin({ source: fakeSource(2050, 1024), layout: 'd20-net-v1' }, options)).not.toThrow();
  });

  it('rejects incomplete, extra, out-of-range, degenerate and mirrored UVs', () => {
    const source = fakeSource(400, 400);
    const missing = customLayout() as Partial<Record<D20Value, FaceUV>>;
    delete missing[20];
    expectInvalid(() => prepareSkin({ source, layout: missing }, options), /missing face 20/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 21: customLayout()[1] } }, options), /unexpected key/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 3: [[0.5, 0], [0, 1.2], [1, 1]] } }, options), /0 to 1/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 3: [[0.5, 0], [0, Number.NaN], [1, 1]] } }, options), /0 to 1/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 3: [[0, 0], [0.5, 0.5], [1, 1]] } }, options), /degenerate/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 3: [[0.5, 0], [1, 1], [0, 1]] } }, options), /mirrored/);
    expectInvalid(() => prepareSkin({ source, layout: { ...customLayout(), 3: [[0.5, 0], [0, 1]] } }, options), /three UV points/);
    expectInvalid(() => prepareSkin({ source, layout: 'd20-net-v2' }, options), /layout/);
  });

  it('rejects invalid number modes and non-object skins', () => {
    expectInvalid(() => prepareSkin({ source: fakeSource(), layout: 'd20-net-v1', numbers: 'none' }, options), /numbers/);
    expectInvalid(() => prepareSkin(undefined, options));
    expectInvalid(() => prepareSkin('skin.png', options));
  });
});
