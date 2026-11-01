# dice-3d

Framework-agnostic 3D dice for the web, rendered with WebGL2: the standard RPG set (D4, D6,
D8, D10, D12, D20), percentile dice (D100 and the tens D10), D2/D3, extended dice (D5, D7,
D14, D16, D24, D30, D48, D60, D120), Fudge/Fate (DF) and your own custom dice.

- Real 3D geometry with a fixed, documented numbering for every type.
- `orientTo` turns a face to the viewer; `rollTo` plays a roll animation that ends exactly on
  the value your application chose. The library never picks results.
- Themes, injectable textures (skins) on an official template or with your own UV layout.
- No runtime dependencies, no fonts, no network access, about 21 kB gzip.
- Safe to import during server-side rendering.

`createD20` is the original D20 API and is unchanged. `createDie` creates any type with the
same lifecycle. The full support matrix is in [dice support](../../docs/dice-support.md).

React users: see [`@ticonemarsicano/dice-3d-react`](../react/README.md).

## Installation

```sh
npm install @ticonemarsicano/dice-3d
```

The package is ESM-only and ships TypeScript declarations.

## Quick start

```html
<div id="dice" style="width: 160px; height: 160px"></div>
<output id="result" aria-label="Die result"></output>
```

```ts
import { createD20, type D20 } from '@ticonemarsicano/dice-3d';

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

### Any die type

```ts
import { createDie, getDieInfo } from '@ticonemarsicano/dice-3d';

const die = createDie(host, { type: 'd100', value: 100, motion: 'system' });
const info = die.info; // same object as getDieInfo('d100')
const result = await die.rollTo(37); // typed: 1–100
if (result.status === 'completed') output.textContent = info.format(result.value); // "37"
info.labelsFor(37); // ['30', '7']: tens die and units die
```

## Dice types

| Type | Shape | Results | Notes |
| --- | --- | --- | --- |
| `d2` | coin | 1–2 | Blank rim. |
| `d3` | triangular prism ("log") | 1–3 | Numbered long faces, blank end caps. |
| `d4` | tetrahedron | 1–4 | Read at the **top corner** of the front face: every face prints a number at each corner, and the upright one at the top is the result. Each result has three equivalent poses. |
| `d5`, `d7` | pentagonal / heptagonal prism | 1–5, 1–7 | Logs like the D3, numbered around the axis. |
| `d6` | cube | 1–6 | |
| `d8` | octahedron | 1–8 | |
| `d10`, `d14`, `d16` | pentagonal / heptagonal / octagonal trapezohedron | 1–10, 1–14, 1–16 | Kite faces; labels point at the apex. The D10 prints `10` (not `0`). |
| `d12` | dodecahedron | 1–12 | |
| `d20` | icosahedron | 1–20 | The original `createD20` die, numbering and `d20-net-v1` template. |
| `d24` | tetrakis hexahedron | 1–24 | |
| `d30` | rhombic triacontahedron | 1–30 | |
| `d48` | disdyakis dodecahedron | 1–48 | |
| `d60` | pentakis dodecahedron | 1–60 | |
| `d120` | disdyakis triacontahedron | 1–120 | Small labels; give it ≥ 240 CSS px to read them. |
| `d100` | two pentagonal trapezohedra | 1–100 | Percentile pair in one canvas: tens die (00–90) left, units die (0–9) right. 37 shows 30 + 7; **00 + 0 means 100**. |
| `d10-tens` | pentagonal trapezohedron | 0, 10, …, 90 | Percentile tens die; 0 is printed `00`. |
| `df` | cube | −1, 0, +1 | Fudge/Fate: two faces each of minus, blank and plus. |

Numbering: wherever a die has opposite faces they sum to N + 1 (D16: kites half a turn
apart); prisms are numbered around their axis. 6/9-style labels (and 16/91, 66/99 … on the
D120) are underlined. All dice share the camera framing, so they look the same size.

**Repeated outcomes** (DF, D4 corners, custom dice): the result decides the value, the
physical face is chosen deterministically — the equivalent pose closest to the die's current
rotation (ties: the first one in face order). The same start state and value always land on
the same face.

The library never picks results. Rolling uniformly over `info.values` matches the physical
distribution of every built-in die (DF: two faces per result, so uniform over −1/0/+1).
Game rules, dice pools and modifiers are out of scope.

## API

```ts
createD20(container: HTMLElement, options?: D20Options): D20
createDie<T extends DieType | CustomDieDefinition>(container: HTMLElement, options: DieOptions<T>): Die<DieValueOf<T>>
```

`createDie` takes the options below plus `type` (required); `value` defaults to
`info.defaultValue` (the highest result; DF: +1, tens die: 0). `Die` has every `D20` method
plus `info`. Values are typed per type (`DieValueOf<'d6'>` is `1 | … | 6`).

Metadata helpers (work on the server): `getDieInfo(type)` returns `{ type, name, shape,
reading, values, defaultValue, faces, templateId, labelsFor(value), format(value) }`;
`getDieTemplate(type)` returns the skin template (UV polygons and label positions);
`createDieTemplateSvg(type)` returns the artwork template as SVG; `DIE_TYPES` lists the
built-in types in display order.

| Option | Default | Notes |
| --- | --- | --- |
| `value` | `20` (`createDie`: `info.defaultValue`) | Integer 1–20; for `createDie` any result of the type. |
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

Other exports: `D20Error` (alias `DieError`), `isD20Error` (alias `isDieError`), `D20_VALUES`,
`isD20Value`, `isDieType`, `DIE_SHAPES`, `D20_DEFAULT_THEME`, `defineDie` and `D20_NET_V1`
(template description with its UV table), plus all public types.

### Custom dice

```ts
import { createDie, defineDie } from '@ticonemarsicano/dice-3d';

const hits = defineDie({
  id: 'hit-die',
  shape: 'd6', // faces in D6 value order: face i sits where a D6 shows i + 1
  faces: [
    { value: 'hit', label: { strokes: [[[0.5, 0], [0.8, 1], [0, 0.35], [1, 0.35], [0.2, 1], [0.5, 0]]] } },
    { value: 'hit', label: '+' },
    { value: 'crit', label: '++' },
    { value: 'miss', label: null }, // blank
    { value: 'miss', label: null },
    { value: 'miss', label: '-' },
  ],
});
const die = createDie(host, { type: hits, value: 'miss' });
await die.rollTo('hit');
```

- `shape`: any built-in numeric shape (`'d2'` … `'d120'`), `{ prism: n }` (n numbered sides,
  3–24) or `{ trapezohedron: n }` (2n kites, 3–24). With `'d4'` the entries are corner results.
- `faces`: one entry per face; values are finite numbers or non-empty strings and may repeat.
- `label`: default `String(value)`; at most four characters from `0–9`, `+`, `-`, `−`; a
  drawn symbol `{ strokes }` (polylines in a unit box, y down); or `null`/`''` for blank. No
  artwork is bundled: game-specific symbols are drawn by you or painted into a skin.
- `defineDie` validates eagerly and returns a frozen copy. Keep that object: dice created from
  the same definition share their mesh, and `DieView` recreates the die when it changes.
- The skin template id is `<id>-grid-v1`.

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
| `INVALID_ARGUMENT` | Synchronously, before any state change: value not a result of the die (e.g. outside 1–20), unknown type, invalid custom definition, negative/non-finite duration, bad color, bad option, invalid skin (see below). |
| `WEBGL_UNAVAILABLE` | `createD20`/`createDie` outside a browser, without WebGL2 or when the shaders fail to compile. |
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
  package: `@ticonemarsicano/dice-3d/templates/d20-net-v1.svg` (layers `artwork`, `numbers`, `guides`) and
  `@ticonemarsicano/dice-3d/templates/d20-net-v1.json` (UVs). The image must have a 2:1 aspect ratio (±1 %);
  2048 × 1024 is recommended. Hide the guides before exporting and paint into the bleed area.
- Custom `layout`: `{ 1: [A, B, C], …, 20: [A, B, C] }` with normalized `[u, v]` points, where
  `(0, 0)` is the top-left of the image. Seen from outside with the face upright, A is the top
  vertex, B bottom-left and C bottom-right, so A → B → C runs counter-clockwise on the image.
  Clockwise (mirrored) triangles are rejected.
- `numbers: 'overlay'` (default) draws the standard numbers in `numberColor`;
  `'in-texture'` hides them and your artwork must contain the numbers (including 6/9 markers).
- Transparent pixels are composited over `bodyColor`; lighting applies to the image (sRGB).

### Skins for other dice

Every type has its own grid template: each face upright in its own cell, in face index order
(built-in numeric dice: face i shows i + 1). Pass the type's `info.templateId`, e.g.
`{ source, layout: 'd6-grid-v1' }`, or an explicit array with one UV polygon per face
(polygon corners in the order of `getDieTemplate(type).faces[i].uv`, counter-clockwise on
screen). Templates ship as `@ticonemarsicano/dice-3d/templates/<type>-grid-v1.svg` and `.json` for every
built-in type except the D20 (which keeps `d20-net-v1`); custom dice get theirs from
`getDieTemplate`/`createDieTemplateSvg`. A layout made for another type — including
`d20-net-v1` on a non-D20 — is rejected and the previous skin stays. Coin rims and prism end
caps are not part of templates and keep the body color.

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
`createD20` and `createDie` must run in the browser (for example inside `useEffect`); on the
server they throw `WEBGL_UNAVAILABLE`. `getDieInfo`, `getDieTemplate` and
`createDieTemplateSvg` work anywhere.

## Limitations

- One die per instance and one WebGL2 context per instance. Browsers cap live contexts (about 16
  in Chromium); creating more makes the browser drop the oldest ones, which then report
  `CONTEXT_LOST` and become `disposed`.
- No physics: the roll is an artistic animation, not a simulation. Results come from your app.
- No automatic recovery after context loss; create a new instance.
- The D100 is one instance with two bodies in a single canvas (not two independent dice).
- Labels are drawn with the built-in stroke font (digits, `+`, `−`) or your stroke symbols; there
  is no text font, so letters need a symbol or a skin.
- Custom shapes are limited to the built-in shapes, prisms and trapezohedra.

## License

MIT (see `LICENSE`).
