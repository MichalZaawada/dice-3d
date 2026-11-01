import { D20Error } from '../errors.js';
import { builtInDieModel, resolveDieModel, type DieModel } from '../geometry/dice.js';
import { buildDieMesh, type DieMesh } from '../renderer/dieMesh.js';
import { createLabelAtlas } from '../renderer/numberAtlas.js';
import { createWebGL2Renderer } from '../renderer/webgl2Renderer.js';
import type { CustomDieDefinition, D20, D20Options, Die, DieOptions, DieType, DieValueOf } from '../types.js';
import { dieInfo } from './dieInfo.js';
import { createBrowserEnvironment } from './environment.js';
import { mountDie } from './mountD20.js';

const meshes = new WeakMap<DieModel, DieMesh>();

/** Immutable mesh and label atlas of a die type, built on first use and shared by all instances. */
function meshOf(model: DieModel): DieMesh {
  let mesh = meshes.get(model);
  if (!mesh) {
    mesh = buildDieMesh(model.bodies, createLabelAtlas(model.atlasLabels));
    meshes.set(model, mesh);
  }
  return mesh;
}

function assertBrowser(name: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new D20Error('WEBGL_UNAVAILABLE', `${name} requires a browser environment`);
  }
}

function browserDependencies(model: DieModel) {
  return {
    window,
    environment: createBrowserEnvironment(window),
    createRenderer: (canvas: HTMLCanvasElement) => createWebGL2Renderer(canvas, meshOf(model)),
  };
}

/**
 * Creates a D20 inside `container`. The container sizes the die through CSS;
 * the library appends one decorative (`aria-hidden`) canvas to it.
 *
 * Throws `D20Error` synchronously: `INVALID_ARGUMENT` for bad input,
 * `WEBGL_UNAVAILABLE` outside a browser or without WebGL2 and
 * `TEXTURE_UPLOAD_FAILED` when the initial skin cannot be uploaded.
 */
export function createD20(container: HTMLElement, options?: D20Options): D20 {
  assertBrowser('createD20');
  const model = builtInDieModel('d20');
  return mountDie(container, options, model, browserDependencies(model)) as unknown as D20;
}

/**
 * Creates a die of any built-in type (`'d6'`, `'d100'`, `'df'`, …) or a custom
 * definition inside `container`. Same lifecycle, errors and options as
 * {@link createD20}, plus `type` and the `info` property.
 */
export function createDie<T extends DieType | CustomDieDefinition>(container: HTMLElement, options: DieOptions<T>): Die<DieValueOf<T>> {
  assertBrowser('createDie');
  if (typeof options !== 'object' || options === null) {
    throw new D20Error('INVALID_ARGUMENT', 'options must be an object with a type');
  }
  const model = resolveDieModel((options as { type?: unknown }).type);
  const die = mountDie(container, options, model, browserDependencies(model));
  return { info: dieInfo(model), ...die } as unknown as Die<DieValueOf<T>>;
}
