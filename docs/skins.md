# Skins, templates and UV conventions

A skin is an image owned by the application that replaces the die's body color. It never
changes geometry, numbering, results or animations.

```ts
interface D20Skin {
  source: HTMLImageElement | ImageBitmap | HTMLCanvasElement; // decoded by the application
  layout: 'd20-net-v1' | Readonly<Record<D20Value, FaceUV>>;
  numbers?: 'overlay' | 'in-texture'; // default: 'overlay'
}
```

Dice created with `createDie` take a `DieSkin`, whose `layout` is the die's template id
(`info.templateId`) or one UV polygon per face; the D20 also accepts everything above. See
[Templates for every die type](#templates-for-every-die-type).

## Face vertex convention (A/B/C)

Every face has canonical vertices A, B and C. Seen from outside, with the face turned to the
viewer in its result orientation: **A is the top vertex, B the bottom-left, C the bottom-right.**
The overlay number is upright when A points up. A face's UV triangle lists the image points for
A, B and C in this order, which also fixes rotation and prevents mirroring: on the image, A → B
→ C must run counter-clockwise (with y pointing down). Clockwise triangles are rejected as
mirrored.

UVs are normalized: `(0, 0)` is the top-left corner of the image and `(1, 1)` the bottom-right.
The renderer adapts this to WebGL's texture conventions internally.

## The official template: `d20-net-v1`

Published files (package subpath `@ticonemarsicano/dice-3d/templates/*`):

- `d20-net-v1.svg` — 2048 × 1024 editing template with three layers:
  - `artwork` (bottom): paint here; it starts with a full-size background rectangle.
  - `numbers`: the standard numbers as vector paths, upright towards each face's A vertex
    (no fonts). Keep this layer visible for `numbers: 'in-texture'`; hide it for `'overlay'`.
  - `guides` (top): face edges (solid), bleed lines on the outer border (dashed) and a dot near
    each A vertex. **Hide this layer before exporting.**
- `d20-net-v1.json` — the same UV table as `D20_NET_V1.faces` in code, with metadata
  (`template`, `version`, `width`, `height`, `aspectRatio`, `uvOrigin: "top-left"`,
  `vertexOrder`, `triangleSide`, `recommendedBleedPx`).

The net is a real unfolding: a row of five cap triangles, a band of ten and five bottom
triangles (5.5 × 3 triangle units). Nineteen inner edges are shared on both the image and the
die, so artwork continues across them without seams. Down-pointing triangles have A at the
bottom, so their artwork is upside down on the flat image — the `numbers` layer shows the
expected orientation of every face.

Rules:

- Keep the 2:1 aspect ratio (±1 % is accepted) and the triangle positions. Any resolution works;
  2048 × 1024 is a good start. Check quality on the target device.
- Extend artwork beyond the outer edges into the bleed (24 px at 2048 × 1024) to avoid seams
  from texture filtering.
- Export to PNG (or any format the browser decodes), load and decode it in the application:

```ts
const image = new Image();
image.crossOrigin = 'anonymous'; // plus CORS headers on the server for cross-origin images
image.src = '/textures/my-d20-net.png';
await image.decode();
die.setSkin({ source: image, layout: 'd20-net-v1', numbers: 'in-texture' });
```

`d20-net-v1` stays stable. A change of the template or of the numbering table would be published
as a new template id (`d20-net-v2`). Templates for future dice get their own ids.

## Custom layouts

Any atlas works if you list the UV triangle of every value:

```ts
const layout: Record<D20Value, FaceUV> = {
  1: [[0.1, 0.0], [0.0, 0.2], [0.2, 0.2]], // A (top), B (bottom-left), C (bottom-right)
  // … 2 to 20
};
die.setSkin({ source: atlasCanvas, layout, numbers: 'in-texture' });
```

The image alone is never analyzed to detect faces. Custom UVs do not change which number belongs
to which physical face. `examples/vanilla/src/skins.ts` builds such an atlas (twenty upright
triangles in a 5 × 4 grid) at runtime.

## Numbers

- `overlay` draws the library's numbers on top of the artwork in `theme.numberColor`.
- `in-texture` disables the overlay: the artwork is responsible for numbers or symbols matching
  the mapping, including a way to tell 6 from 9 and legibility. The API still reports 1–20.

## Color and lighting

The image is an sRGB color map lit by the scene (no normal, metalness or roughness maps).
`bodyColor` is not used to tint it; transparent pixels are composited over `bodyColor` and do not
cut holes. `edgeColor` and the background still apply.

## Validation and failures

`setSkin` validates and prepares the texture before swapping:

| Problem | Result |
| --- | --- |
| Not an object, unsupported `source` type, unknown `layout` or `numbers` | `INVALID_ARGUMENT` |
| Image not decoded yet, closed `ImageBitmap`, zero size | `INVALID_ARGUMENT` |
| Width or height above the context's `MAX_TEXTURE_SIZE` | `INVALID_ARGUMENT` |
| `d20-net-v1` with an aspect ratio other than 2:1 (±1 %) | `INVALID_ARGUMENT` |
| Missing value, extra key, non-finite or out-of-range UV, degenerate (< 1 px²) or mirrored triangle | `INVALID_ARGUMENT` |
| Cross-origin image without CORS permission (`SecurityError`), GPU upload error | `TEXTURE_UPLOAD_FAILED` |

On any failure the previous appearance stays, and value, pose and any running animation are
untouched. A successful swap applies from the next frame (or renders one frame at rest) and
deletes the previous GPU texture. The library does not validate the content of the artwork.

## Ownership

The library uploads its own GPU copy. It never modifies or closes your image, canvas or
`ImageBitmap`, and it does not need the source after a successful upload. Changing the source
does not update the die — call `setSkin` again. `dispose` releases the library's textures.

## Templates for every die type

Every type except the D20 uses a **grid template** with id `<type>-grid-v1` (custom dice:
`<id>-grid-v1`). Each face is drawn upright — its label's up direction points to the top of the
image — and centered in its own cell, in face index order, row by row. Built-in numeric dice
order faces by value (cell 0 is the face showing 1); DF faces are `+ + blank blank − −`; the
D100 lists the ten tens faces, then the ten units faces; D4 faces carry three corner labels.

- Files: `@ticonemarsicano/dice-3d/templates/<type>-grid-v1.svg` (layers `artwork`, `numbers`, `guides`, like the
  D20 net) and `.json` (`width`, `height`, `aspectRatio`, and per face `index`, `value`,
  `label`, `uv` and label positions). Reference width 2048 px; the aspect ratio must match
  within 1 %.
- In code: `getDieTemplate(type)` returns the same data (`faces[i].uv`, `faces[i].labels` with
  `center`, `rotation` in degrees, cell `size` in reference pixels, `glyphScale`, `marker`);
  `createDieTemplateSvg(type)` returns the SVG, also for custom dice.
- Explicit layouts: an array with one polygon per face, each listing the face corners in the
  same order as the template's `uv` (counter-clockwise on screen). Every fan triangle must keep
  that orientation, so mirrored, folded or degenerate polygons are rejected.
- Compatibility: a template id of another type (for example `d20-net-v1` on a D6, or
  `d6-grid-v1` on a DF) is rejected with `INVALID_ARGUMENT` and the previous appearance stays.
  The record-of-triangles layout is D20-only.
- Surfaces without results (coin rim, prism end caps) are not in the templates and keep
  `bodyColor`.
- `numbers: 'in-texture'` hides the overlay labels; the artwork must then contain them,
  including the underline of 6/9-style labels (`marker: true` in the template).

Regenerate the shipped files with `npm run templates`; a unit test fails if they drift.
