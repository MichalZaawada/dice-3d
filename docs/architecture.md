# Architecture

## Renderer backend: a purpose-built WebGL2 renderer

**Decision:** dice-3d draws with its own small WebGL2 renderer
(`packages/core/src/renderer/webgl2Renderer.ts`) behind the internal `DieRenderer` interface.
No 3D engine is bundled and none is exposed through the public API.

**Rationale.** The scene is one convex mesh of 20 flat triangles, a fixed camera and one
light, drawn in a single draw call. A general engine (three.js was the alternative considered)
would add far more code than the die needs and its own lifecycle around exactly the parts the
contract has to control precisely:

| Criterion | Own WebGL2 renderer | General 3D engine (three.js) |
| --- | --- | --- |
| Bundle size | Whole core: 28.8 kB minified, 11.3 kB gzip (`npm run size`). | The engine alone is typically well over 100 kB gzip before tree shaking. Estimate from the package; no engine prototype was built. |
| Number legibility | Signed-distance atlas sampled in the face shader: crisp at 96–320 px, no decal geometry, no z-fighting. | Possible, but needs the same custom shader work or text meshes. |
| Context loss and disposal | ~300 lines own every GPU object; `dispose` deletes them and releases the context. | Engine caches (programs, textures, render lists) must be disposed through its own API. |
| Maintenance | Small surface: shaders, one mesh, two textures. WebGL2 is stable. | Frequent engine releases; API changes to track. |

The prototype measurements (frame timing, size) are in [testing.md](testing.md). If future
dice need features such as physics, shadows or many dice per scene, the `DieRenderer`
interface allows another backend without changing the public API.

## Module structure

- `controller/createD20.ts` — public factory; refuses to run without `window`/`document`.
- `controller/mountD20.ts` — DOM wiring: canvas (`aria-hidden`), `ResizeObserver`, DPR
  `matchMedia` watch, `webglcontextlost`. Dependencies are injected so it can be tested in jsdom.
- `controller/dieController.ts` — die-independent state machine: snapshot, subscriptions,
  operations and Promise settlement, cancellation, motion modes, clock and frame scheduling.
- `controller/environment.ts` — browser services (`requestAnimationFrame`, visibility,
  `prefers-reduced-motion`, `reportError`) behind an interface; tests use fakes with manual time.
- `geometry/` — die definitions. `dieDefinition.ts` is shared; `d20.ts` and `d20NetV1.ts` are
  D20-specific.
- `animation/` — quaternions, easing, `AnimationClock`, orient and roll tracks.
- `renderer/` — WebGL2 renderer, shaders, camera, stroke glyphs, number atlas, mesh builder.

### Preparing for other dice

The required preset list, compatibility rules and demo behavior are defined in
[RPG dice support](dice-support.md). This is the implementation target; the
architecture below describes the current D20 implementation.

Shared: controller, clock, tracks, renderer, skin upload and validation helpers, glyph atlas.
Die-specific (`DieDefinition`): vertices, values, numbering and A/B/C vertex order per face;
face frames and result orientations are derived from it. The "opposite faces sum to 21" rule
is asserted only in D20 tests. A future `createD6` would add a definition, its own versioned net
template (for example `d6-net-v1`) and a factory, leaving `createD20` and `d20-net-v1`
untouched. Square faces would be triangulated while keeping one label frame per face.

## Geometry and numbering

The icosahedron has circumradius 1: vertex 0 is the top pole, 1–5 the upper ring (0°, 72°, …),
6–10 the lower ring (36°, 108°, …), 11 the bottom pole. `D20_FACE_TABLE` in `geometry/d20.ts`
lists `[value, A, B, C]` for every face and is the source of truth; the fixture
`packages/core/tests/fixtures/d20-faces.json` pins it together with normals and label-up
directions. Opposite faces sum to 21, and the five faces around every vertex sum to 52 or 53
(a balanced layout). The table is not derived from any generator ordering.

Result orientation: the face normal points to the camera (+Z) and the label's up direction
(centroid → A) points up (+Y). This is a presentation convention, not "the top face on a table".

## Rendering

- One interleaved static buffer: position, flat normal, barycentric coordinates, label
  coordinates and atlas cell per vertex (60 vertices), plus a dynamic buffer of skin UVs.
- Numbers: a 640 × 512 single-channel signed-distance atlas, rasterized in JavaScript from the
  built-in stroke font (`renderer/glyphs.ts`) once per page and shared read-only. No font files,
  no canvas text, so the result is identical on every platform and no font license is involved.
  6 and 9 carry an underline.
- Edges: computed from barycentric coordinates with `fwidth`, so their width is in device pixels.
- Color: theme colors and the skin (uploaded as `SRGB8_ALPHA8`) are lit in linear space and
  encoded to sRGB in the shader. Transparent skin pixels show `bodyColor`.
- Camera: fixed perspective camera on +Z; the shorter viewport side always shows ±1.42 model
  units, leaving room for the hop. Back-face culling and depth testing are enabled.
- The texture upload uses `UNPACK_FLIP_Y_WEBGL = false`: image row 0 is the top, which matches
  the public UV convention `(0, 0)` = top-left.

## Animation

- `orientTo`: spherical interpolation along the shortest arc with ease-in-out, from the current
  pose (which may be mid-roll), also settling any hop offset.
- `rollTo`: a separate spin segment — whole turns around a tilted axis, parameterized by angle
  with ease-out — composed with the shortest-path settle. Because the turns are not an
  interpolation between orientations, they are not lost, and the final frame is exactly the
  target orientation. A hop of two decaying arcs moves the die up and down. Each roll uses a
  different deterministic axis (golden-angle sequence); no randomness is involved.
- `AnimationClock` accumulates elapsed time and stops while the document is hidden. Progress
  depends only on elapsed time, never on the number of frames.

## Lifecycle

- `requestAnimationFrame` runs only while an animation is active; theme, skin, value and resize
  changes render one frame synchronously.
- The drawing buffer size is `round(cssSize × min(devicePixelRatio, maxPixelRatio))`. A zero size
  suspends drawing until the size is positive again.
- `dispose` and context loss share one teardown: stop frames, remove visibility and
  reduced-motion listeners, disconnect the `ResizeObserver`, stop the DPR watch, remove the
  `webglcontextlost` listener and the canvas, delete GPU objects and release the context
  (`WEBGL_lose_context`).
- Each instance owns one WebGL2 context. Browsers cap live contexts per page (about 16 in
  Chromium); beyond that the browser drops the oldest context and that instance reports
  `CONTEXT_LOST`. Sharing one context between instances is a possible future improvement.
