# dice-3d

Framework-agnostic 3D dice for the web, rendered with WebGL2. Version 0.1 supports the
twenty-sided die (D20); the package name and internals are prepared for more dice types.

- Real 3D geometry: a regular icosahedron with a fixed, documented numbering.
- `orientTo` turns a face to the viewer; `rollTo` plays a roll animation that ends exactly on
  the value your application chose. The library never picks results.
- Themes, injectable textures (skins) on an official template or with your own UV layout.
- No runtime dependencies, no fonts, no network access, about 11 kB gzip.
- Safe to import during server-side rendering.

Additional RPG dice (standard, percentile, Fate and extended/custom dice) are specified
in the [implementation scope](../../docs/dice-support.md). These are planned; D20 is
the only currently implemented type.

React users: see [`dice-3d-react`](../react/README.md).

## Installation

```sh
npm install dice-3d
```

The package is ESM-only and ships TypeScript declarations.

## Quick start

```html
<div id="dice" style="width: 160px; height: 160px"></div>
<output id="result" aria-label="Die result"></output>
```

```ts
import { createD20, type D20 } from 'dice-3d';

const host = document.querySelector<HTMLElement>('#dice');
const output = document.querySelector<HTMLOutputElement>('#result');
if (!host || !output) throw new Error('Missing container or result element');

let die: D20 | undefined;
output.textContent = '12'; // text stays accessible without WebGL
try {
  die = createD20(host, { value: 20, motion: 'system' });
  const result = await die.rollTo(12); // result determined by the application
  if (result.status === 'completed') output.textContent = String(result.value);
} catch (error) {
  console.error('Failed to render the die', error);
}

// When removing the view:
die?.dispose();
```

The container decides the size through CSS. The library appends one `<canvas>` that fills it.

## API

```ts
createD20(container: HTMLElement, options?: D20Options): D20
```

| Option | Default | Notes |
| --- | --- | --- |
| `value` | `20` | Integer 1–20. |
| `theme` | ivory body, dark edges and numbers, transparent background | `Partial<D20Theme>`; colors are `#RRGGBB`, `background` may be `'transparent'`. |
| `skin` | default appearance | See [Skins](#skins). |
| `motion` | `'system'` | `'system' \| 'full' \| 'reduced' \| 'none'`. |
| `maxPixelRatio` | `2` | Finite number ≥ 1; caps the canvas resolution on high-DPI screens. |

| Method | Behavior |
| --- | --- |
| `orientTo(value, { durationMs = 450, signal })` | Shortest rotation to the value. Resolves immediately if the die is idle on that value. |
| `rollTo(value, { durationMs = 1200, signal })` | Spins (whole turns) with a hop and lands exactly on the value; also animates when the value repeats. |
| `setValue(value)` | Cancels any animation (`replaced`) and shows the value immediately. |
| `setTheme(partial)` | Validates and merges; renders one frame when idle. |
| `setSkin(skin \| null)` | Validates and uploads a texture; `null` restores the default look. |
| `setMotion(mode)` | Applies to the running animation too (see below). |
| `getSnapshot()` | Frozen `{ state, value, target }`; `value` is the last completed value, `target` the running animation's goal or `null`. |
| `subscribe(listener)` | Called when `state`, `value` or `target` change (not per frame, not on subscription). Returns an idempotent unsubscribe. |
| `dispose()` | Idempotent. Cancels with `disposed`, removes the canvas, observers and listeners, and releases GPU resources. |

Both animation methods resolve with
`{ status: 'completed', value }` or `{ status: 'cancelled', reason: 'replaced' | 'aborted' | 'disposed' }`.
They reject only on renderer failures (for example `CONTEXT_LOST`).

Other exports: `D20Error`, `isD20Error`, `D20_VALUES`, `isD20Value`, `D20_DEFAULT_THEME` and
`D20_NET_V1` (template description with its UV table), plus all public types.

### Concurrency rules

- The last valid request wins: a new `orientTo`/`rollTo` cancels the previous one with
  `replaced` and continues from the die's current position, without a jump.
- `value` changes only when an animation completes; `target` is set only while animating.
- Aborting a running animation through its `AbortSignal` resolves `aborted`, snaps back to the
  last completed value and returns to `idle`. A signal that is already aborted resolves
  `aborted` immediately and does not touch the running animation.
- `durationMs: 0` finishes immediately with `completed`, without entering `animating`.
- Every Promise settles exactly once. Listener exceptions are reported (`reportError`) and do not
  affect other listeners or Promise settlement.
- After `dispose`, only `dispose` and `getSnapshot` may be called; other methods throw `DISPOSED`.

### Motion

- `system` follows `prefers-reduced-motion` and reacts to changes while running.
- `reduced`: no hop and no whole turns; transitions take at most 150 ms.
- `none`: instant.
- Switching to `none` during an animation completes it on the target (`completed`).
  Switching to `reduced` shortens the remainder to at most 150 ms from the current pose.

Animation time advances only while the page is visible; a hidden tab pauses the animation and
it resumes where it stopped. The render loop runs only during animations.

### Errors

All errors are `D20Error` instances with a `code`:

| Code | When |
| --- | --- |
| `INVALID_ARGUMENT` | Synchronously, before any state change: value outside 1–20, negative/non-finite duration, bad color, bad option, invalid skin (see below). |
| `WEBGL_UNAVAILABLE` | `createD20` outside a browser, without WebGL2 or when the shaders fail to compile. |
| `CONTEXT_LOST` | Rejects the running animation when the WebGL context is lost; the instance becomes `disposed`. |
| `TEXTURE_UPLOAD_FAILED` | The image cannot be uploaded (CORS-tainted image, GPU error). The previous look is kept. |
| `DISPOSED` | A method other than `dispose`/`getSnapshot` was called after disposal. |

## Skins

A skin replaces the body color with your own image. Geometry, values and animations stay the
same.

```ts
const image = new Image();
image.crossOrigin = 'anonymous'; // cross-origin images also need CORS headers
image.src = '/textures/my-d20-net.png';
await image.decode();

die.setSkin({ source: image, layout: 'd20-net-v1', numbers: 'in-texture' });
die.setSkin(null); // back to the default appearance
```

- `source`: a decoded `HTMLImageElement`, `ImageBitmap` or `HTMLCanvasElement`. The library
  never fetches files and never closes or modifies your source. It keeps its own GPU copy, so
  later changes to the source require another `setSkin` call.
- `layout: 'd20-net-v1'`: an image painted on the official template. Templates ship with the
  package: `dice-3d/templates/d20-net-v1.svg` (layers `artwork`, `numbers`, `guides`) and
  `dice-3d/templates/d20-net-v1.json` (UVs). The image must have a 2:1 aspect ratio (±1 %);
  2048 × 1024 is recommended. Hide the guides before exporting and paint into the bleed area.
- Custom `layout`: `{ 1: [A, B, C], …, 20: [A, B, C] }` with normalized `[u, v]` points, where
  `(0, 0)` is the top-left of the image. Seen from outside with the face upright, A is the top
  vertex, B bottom-left and C bottom-right, so A → B → C runs counter-clockwise on the image.
  Clockwise (mirrored) triangles are rejected.
- `numbers: 'overlay'` (default) draws the standard numbers in `numberColor`;
  `'in-texture'` hides them and your artwork must contain the numbers (including 6/9 markers).
- Transparent pixels are composited over `bodyColor`; lighting applies to the image (sRGB).

Validation (`INVALID_ARGUMENT`) covers: supported and decoded source with positive size, at most
the device's `MAX_TEXTURE_SIZE`, all 20 faces present and no extra keys, finite UVs in 0–1,
non-degenerate and non-mirrored triangles, the template aspect ratio. A failed `setSkin` keeps
the previous appearance, value, pose and running animation. More details: `docs/skins.md` in
the repository.

## Accessibility

The canvas has `aria-hidden="true"`. The library creates no controls and does not handle the
keyboard. Show the value as text yourself (with `aria-live` if appropriate); that text is also
your fallback when WebGL2 is unavailable.

## Server-side rendering

Importing the package has no side effects and does not touch `window` or `document`.
`createD20` must run in the browser (for example inside `useEffect`); on the server it throws
`WEBGL_UNAVAILABLE`.

## Limitations

- One die per instance and one WebGL2 context per instance. Browsers cap live contexts (about 16
  in Chromium); creating more makes the browser drop the oldest ones, which then report
  `CONTEXT_LOST` and become `disposed`.
- No physics: the roll is an artistic animation, not a simulation. Results come from your app.
- No automatic recovery after context loss; create a new instance.

## License

MIT (see `LICENSE`).
