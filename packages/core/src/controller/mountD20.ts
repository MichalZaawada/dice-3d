import { D20Error, invalidArgument } from '../errors.js';
import { builtInDieModel, type DieModel } from '../geometry/dice.js';
import type { DieRenderer } from '../renderer/renderer.js';
import type { D20, DieValue } from '../types.js';
import { createDieController, type DieController } from './dieController.js';
import type { DieEnvironment } from './environment.js';
import { prepareSkin, type SourceInspector } from './skinValidation.js';
import { assertDieValue, validateDieOptions } from './validation.js';

/** Window features used by the mount; a subset so tests can provide fakes. */
export interface MountWindow {
  readonly devicePixelRatio: number;
  matchMedia?(query: string): MediaQueryList;
  readonly ResizeObserver?: typeof ResizeObserver;
}

export interface MountDependencies {
  readonly window: MountWindow;
  readonly environment: DieEnvironment;
  readonly createRenderer: (canvas: HTMLCanvasElement) => DieRenderer;
  readonly inspectSource?: SourceInspector;
}

function isElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Node).appendChild === 'function' &&
    (value as Node).ownerDocument != null
  );
}

/** Public lifecycle surface shared by `D20` and `Die`. */
export type MountedDie = Omit<DieController<DieValue>, never>;

/** DOM wiring of a D20: canvas, sizing, DPR and context-loss handling. */
export function mountD20(container: unknown, options: unknown, deps: MountDependencies): D20 {
  return mountDie(container, options, builtInDieModel('d20'), deps) as unknown as D20;
}

/** DOM wiring of any die: canvas, sizing, DPR and context-loss handling. */
export function mountDie(container: unknown, options: unknown, model: DieModel, deps: MountDependencies): MountedDie {
  if (!isElement(container)) throw invalidArgument('container must be an HTMLElement');
  const config = validateDieOptions(options, model);
  const doc = container.ownerDocument;

  const canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-dice-3d', model.type);
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const renderer = deps.createRenderer(canvas);
  const validateSkin = (skin: unknown) =>
    prepareSkin(skin, {
      maxTextureSize: renderer.maxTextureSize,
      model,
      ...(deps.inspectSource ? { inspect: deps.inspectSource } : {}),
    });

  try {
    renderer.setTheme(config.theme);
    if (config.skin !== undefined) renderer.setSkin(validateSkin(config.skin));
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  const win = deps.window;
  let cssWidth = 0;
  let cssHeight = 0;
  let resizeObserver: ResizeObserver | null = null;
  let stopPixelRatioWatch: () => void = () => {};

  const applySize = () => {
    const ratio = Math.min(win.devicePixelRatio || 1, config.maxPixelRatio);
    renderer.setSize(Math.round(cssWidth * ratio), Math.round(cssHeight * ratio));
  };

  const onContextLost = () => {
    controller.fail(new D20Error('CONTEXT_LOST', 'The WebGL context was lost'));
  };

  const controller = createDieController<DieValue>({
    initialValue: config.value,
    motion: config.motion,
    theme: config.theme,
    renderer,
    environment: deps.environment,
    orientationsOf: (value, current) => model.orientations(value, current),
    validateValue: (value) => {
      assertDieValue(model, value);
      return value;
    },
    prepareSkin: validateSkin,
    onTeardown: () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      stopPixelRatioWatch();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.remove();
    },
  });

  container.appendChild(canvas);
  canvas.addEventListener('webglcontextlost', onContextLost);

  const measure = () => {
    cssWidth = canvas.clientWidth;
    cssHeight = canvas.clientHeight;
    applySize();
    controller.invalidate();
  };

  const watchPixelRatio = () => {
    if (typeof win.matchMedia !== 'function') return;
    const query = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    const onChange = () => {
      stopPixelRatioWatch();
      watchPixelRatio();
      measure();
    };
    query.addEventListener('change', onChange);
    stopPixelRatioWatch = () => {
      query.removeEventListener('change', onChange);
      stopPixelRatioWatch = () => {};
    };
  };

  if (win.ResizeObserver) {
    resizeObserver = new win.ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      cssWidth = entry.contentRect.width;
      cssHeight = entry.contentRect.height;
      applySize();
      controller.invalidate();
    });
    resizeObserver.observe(canvas);
  }
  watchPixelRatio();
  measure();

  // Expose only the public surface; internal hooks stay private.
  return {
    orientTo: controller.orientTo,
    rollTo: controller.rollTo,
    setValue: controller.setValue,
    setTheme: controller.setTheme,
    setSkin: controller.setSkin,
    setMotion: controller.setMotion,
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    dispose: controller.dispose,
  };
}
