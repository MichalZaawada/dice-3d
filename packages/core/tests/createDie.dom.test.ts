import { afterEach, describe, expect, it, vi } from 'vitest';
import { angleBetween } from '../src/animation/quaternion.js';
import { createDie } from '../src/controller/createD20.js';
import { getDieTemplate } from '../src/controller/dieInfo.js';
import { mountDie } from '../src/controller/mountD20.js';
import { builtInDieModel, DIE_TYPES, resolveDieModel } from '../src/geometry/dice.js';
import type { DieType, DieValue } from '../src/types.js';
import { FakeEnvironment, FakeRenderer, fakeInspector, fakeSource } from './helpers.js';

function mount(type: DieType | object, options: Record<string, unknown> = {}) {
  const renderer = new FakeRenderer();
  const environment = new FakeEnvironment();
  const container = document.createElement('div');
  document.body.append(container);
  const model = resolveDieModel(type);
  const die = mountDie(container, { motion: 'full', ...options }, model, {
    window: { devicePixelRatio: 1 },
    environment,
    createRenderer: () => renderer,
    inspectSource: fakeInspector,
  });
  // jsdom has no layout: give the canvas a size so frames are drawn, then draw the initial pose.
  renderer.setSize(100, 100);
  die.setTheme({});
  return { die, renderer, environment, scheduler: environment.scheduler, container, model };
}

function expectRestingAt(renderer: FakeRenderer, model: ReturnType<typeof builtInDieModel>, value: DieValue) {
  const frame = renderer.frames.at(-1)!;
  expect(frame).toHaveLength(model.bodies.length);
  const targets = model.orientations(value, frame.map((pose) => pose.rotation));
  frame.forEach((pose, body) => {
    expect(angleBetween(pose.rotation, targets[body]!)).toBeLessThan(1e-6);
    expect(pose.offset).toEqual([0, 0, 0]);
  });
}

afterEach(() => document.body.replaceChildren());

describe.each(DIE_TYPES)('%s lifecycle', (type) => {
  const model = builtInDieModel(type);
  const values = model.values;
  const first = values[0]!;
  const last = values[values.length - 1]!;

  it('starts at the default value and marks its canvas', () => {
    const { die, container } = mount(type);
    expect(die.getSnapshot()).toEqual({ state: 'idle', value: model.defaultValue, target: null });
    expect(container.querySelector('canvas')?.getAttribute('data-dice-3d')).toBe(type);
  });

  it('sets, orients to and rolls to values, ending exactly on the target', async () => {
    const { die, renderer, scheduler } = mount(type, { value: first });
    for (const value of [values[Math.floor(values.length / 2)]!, last]) {
      die.setValue(value);
      expectRestingAt(renderer, model, value);
    }
    const orient = die.orientTo(first);
    expect(die.getSnapshot()).toEqual({ state: 'animating', value: last, target: first });
    scheduler.advance(500, 5);
    await expect(orient).resolves.toEqual({ status: 'completed', value: first });
    expectRestingAt(renderer, model, first);
    const roll = die.rollTo(first);
    scheduler.advance(600);
    expect(die.getSnapshot().state).toBe('animating');
    scheduler.advance(700);
    await expect(roll).resolves.toEqual({ status: 'completed', value: first });
    expectRestingAt(renderer, model, first);
  });

  it('rejects invalid results before changing state', () => {
    const { die } = mount(type, { value: last });
    for (const invalid of [999, -5, 1.5, 'x', null]) {
      expect(() => die.setValue(invalid as never)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
      expect(() => die.rollTo(invalid as never)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    }
    expect(die.getSnapshot()).toEqual({ state: 'idle', value: last, target: null });
  });

  it('cancels on abort (restoring the last value), replacement and disposal', async () => {
    const { die, renderer, scheduler, container } = mount(type, { value: last });
    const controller = new AbortController();
    const aborted = die.rollTo(first, { signal: controller.signal });
    scheduler.advance(300);
    controller.abort();
    await expect(aborted).resolves.toEqual({ status: 'cancelled', reason: 'aborted' });
    expect(die.getSnapshot()).toEqual({ state: 'idle', value: last, target: null });
    expectRestingAt(renderer, model, last);

    const replaced = die.rollTo(first);
    const replacement = die.orientTo(last);
    await expect(replaced).resolves.toEqual({ status: 'cancelled', reason: 'replaced' });
    const pending = die.rollTo(first);
    die.dispose();
    await expect(replacement).resolves.toEqual({ status: 'cancelled', reason: 'replaced' });
    await expect(pending).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
    expect(die.getSnapshot().state).toBe('disposed');
    expect(renderer.disposed).toBe(true);
    expect(container.querySelector('canvas')).toBeNull();
    expect(scheduler.pendingFrames).toBe(0);
    expect(() => die.setValue(first)).toThrow(expect.objectContaining({ code: 'DISPOSED' }));
    die.dispose();
  });

  it('applies its own skin template and keeps the previous skin when an incompatible one is rejected', () => {
    const { die, renderer } = mount(type);
    const template = getDieTemplate(type);
    die.setSkin({ source: fakeSource(template.width, template.height) as never, layout: template.id });
    const applied = renderer.skin;
    expect(applied?.faces).toHaveLength(model.faces.length);
    const otherLayout = type === 'd6' ? 'd8-grid-v1' : 'd6-grid-v1';
    expect(() => die.setSkin({ source: fakeSource(template.width, template.height) as never, layout: otherLayout })).toThrow(
      expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    );
    expect(renderer.skin).toBe(applied);
    die.setSkin(null);
    expect(renderer.skin).toBeNull();
  });
});

describe('multi-face and multi-body dice', () => {
  it('D100 animates both bodies and settles on tens and units', async () => {
    const { die, renderer, scheduler, model } = mount('d100', { value: 100 });
    expect(renderer.frames.at(-1)).toHaveLength(2);
    const roll = die.rollTo(37);
    scheduler.advance(600);
    const [tens, units] = renderer.frames.at(-1)!;
    expect(tens!.rotation).not.toEqual(units!.rotation);
    scheduler.advance(700);
    await expect(roll).resolves.toEqual({ status: 'completed', value: 37 });
    expectRestingAt(renderer, model, 37);
    expect(model.labelsFor(37)).toEqual(['30', '7']);
  });

  it('DF rolls of the same result stay on the same physical face (nearest equivalent pose)', async () => {
    const { die, renderer, scheduler, model } = mount('df', { value: 1 });
    const before = renderer.frames.at(-1)![0]!.rotation;
    const roll = die.rollTo(1);
    scheduler.advance(1300);
    await roll;
    expect(angleBetween(renderer.frames.at(-1)![0]!.rotation, before)).toBeLessThan(1e-6);
    die.setValue(-1);
    const minus = renderer.frames.at(-1)![0]!.rotation;
    const poses = model.bodies[0]!.poses.filter((pose) => pose.value === -1).map((pose) => pose.orientation);
    expect(poses.some((pose) => angleBetween(pose, minus) < 1e-6)).toBe(true);
  });

  it('custom string results work through the same lifecycle', async () => {
    const definition = {
      id: 'weather',
      shape: 'd6',
      faces: [
        { value: 'sun', label: '+' }, { value: 'sun', label: '+' }, { value: 'cloud', label: null },
        { value: 'cloud', label: null }, { value: 'rain', label: '-' }, { value: 'rain', label: '-' },
      ],
    };
    const { die, scheduler } = mount(definition, { value: 'cloud' });
    expect(die.getSnapshot().value).toBe('cloud');
    const roll = die.rollTo('rain');
    scheduler.advance(1300);
    await expect(roll).resolves.toEqual({ status: 'completed', value: 'rain' });
    expect(() => die.setValue('snow')).toThrow(/one of "sun", "cloud", "rain"/);
  });
});

describe('createDie', () => {
  it('validates the type and value before creating a canvas', () => {
    const container = document.createElement('div');
    expect(() => createDie(container, { type: 'd13' as never })).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() => createDie(container, undefined as never)).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(() => createDie(container, { type: 'd6', value: 7 as never })).toThrow(/integer from 1 to 6, received 7/);
    expect(container.childElementCount).toBe(0);
  });

  it('throws WEBGL_UNAVAILABLE and leaves no canvas when WebGL2 is missing', () => {
    const container = document.createElement('div');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => createDie(container, { type: 'd8' })).toThrow(expect.objectContaining({ code: 'WEBGL_UNAVAILABLE' }));
    expect(container.childElementCount).toBe(0);
  });
});
