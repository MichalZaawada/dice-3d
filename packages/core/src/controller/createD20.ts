import { D20Error } from '../errors.js';
import { d20FaceFrames } from '../geometry/d20.js';
import { buildDieMesh, type DieMesh } from '../renderer/dieMesh.js';
import { createNumberAtlas } from '../renderer/numberAtlas.js';
import { createWebGL2Renderer } from '../renderer/webgl2Renderer.js';
import type { D20, D20Options, D20Value } from '../types.js';
import { createBrowserEnvironment } from './environment.js';
import { mountD20 } from './mountD20.js';

let sharedMesh: DieMesh<D20Value> | undefined;

/** Immutable mesh and number atlas, built on first use and shared by all instances. */
function d20Mesh(): DieMesh<D20Value> {
  if (!sharedMesh) {
    const frames = d20FaceFrames();
    sharedMesh = buildDieMesh(frames, createNumberAtlas(frames.map((frame) => frame.value)));
  }
  return sharedMesh;
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
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new D20Error('WEBGL_UNAVAILABLE', 'createD20 requires a browser environment');
  }
  return mountD20(container, options, {
    window,
    environment: createBrowserEnvironment(window),
    createRenderer: (canvas) => createWebGL2Renderer(canvas, d20Mesh()),
  });
}
