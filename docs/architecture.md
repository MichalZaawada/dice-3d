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

- `controller/createD20.ts` — public factories `createD20` and `createDie`; refuse to run
  without `window`/`document`; cache one mesh and label atlas per die type.
- `controller/mountD20.ts` — `mountDie` (and the `mountD20` wrapper): canvas (`aria-hidden`,
  `data-dice-3d="<type>"`), `ResizeObserver`, DPR `matchMedia` watch, `webglcontextlost`.
  Dependencies are injected so it can be tested in jsdom.
- `controller/dieController.ts` — die-independent state machine: snapshot, subscriptions,
  operations and Promise settlement, cancellation, motion modes, clock and frame scheduling.
  It animates one pose per body (one track per body, shared duration).
- `controller/dieInfo.ts` — `getDieInfo`, `getDieTemplate`, `createDieTemplateSvg`, `defineDie`.
- `controller/skinValidation.ts` — skin validation for any type (template ids, UV polygons,
  the D20 record layout).
- `controller/environment.ts` — browser services (`requestAnimationFrame`, visibility,
  `prefers-reduced-motion`, `reportError`) behind an interface; tests use fakes with manual time.
- `geometry/shapes.ts` — polyhedra with circumradius 1: coin, prisms, tetrahedron, cube,
  octahedron, trapezohedra, dodecahedron (dual of the icosahedron), icosahedron (the D20
  table), kis and disdyakis subdivisions with canonical Catalan radii, rhombic triacontahedron.
- `geometry/model.ts` — turns a shape and per-face results/labels into faces, mesh regions,
  label placements and result poses.
- `geometry/dice.ts` — the built-in registry, numbering, D100 pair, custom definitions.
- `geometry/template.ts` — grid skin templates (and the D20 net template data) and the SVG.
- `geometry/d20.ts`, `d20NetV1.ts` — the durable D20 numbering table and net.
- `animation/` — quaternions, easing, `AnimationClock`, orient and roll tracks.
- `renderer/` — WebGL2 renderer, shaders, camera, stroke glyphs, label atlas, mesh builder.

### How a die type is described

A `DieModel` holds one or more **bodies** (the D100 has two: tens and units). Each body has:

- **faces** in a global, documented order (skin layouts and templates use it; for built-in
  numeric dice face i shows i + 1, so the canonical shape order follows the built-in numbering);
- **regions**: convex polygons for the mesh, each with at most one label, per-edge flags saying
  which edges are real die edges, and per-point corner weights for skin UVs. Single-label faces
  are one region; D4 faces are split into three corner kites; coin rims and prism caps are
  label-less trim regions without skin UVs;
- **poses**: `(value, orientation)` pairs. Repeated outcomes have several poses; the controller
  asks for the pose nearest to the current rotation, so the choice is deterministic.

`orientations(value, current)` returns one rotation per body; `labelsFor`/`format` describe
results; `isValue` validates before any state change. Adding a type means adding a shape and an
entry in the registry — controller, renderer, skins and React need no change.

### Labels

Labels are text from the stroke font (digits, `+`, `−`) or user stroke symbols, rasterized into
one signed-distance atlas per type. The glyph scale is uniform per die (three-digit labels
shrink all labels of that die equally). Each label's cell size and position are the largest
box of the widest label that fits its region (nested ternary search over a concave objective),
at 86 % (corner labels 80 %), capped at 0.85 model units. The D20 keeps its original fixed
0.5-unit label at the face centroid. A label is underlined when it reads as another label of
the same die upside down (6/9; 16/91, 66/99 … on the D120); on the D20 this is exactly 6 and 9.

## Geometry and numbering

The icosahedron has circumradius 1: vertex 0 is the top pole, 1–5 the upper ring (0°, 72°, …),
6–10 the lower ring (36°, 108°, …), 11 the bottom pole. `D20_FACE_TABLE` in `geometry/d20.ts`
lists `[value, A, B, C]` for every face and is the source of truth; the fixture
`packages/core/tests/fixtures/d20-faces.json` pins it together with normals and label-up
directions. Opposite faces sum to 21, and the five faces around every vertex sum to 52 or 53
(a balanced layout). The table is not derived from any generator ordering.

Result orientation: the face normal points to the camera (+Z) and the label's up direction
(centroid → A) points up (+Y). This is a presentation convention, not "the top face on a table".
Other dice follow the same rule with their own label-up direction (D4: towards the result corner).

Built-in numbering for other dice: faces are sorted by normal (top first, then azimuth) and
opposite pairs get alternating low/high values summing to N + 1; even trapezohedra (D16) pair
each kite with the kite half a turn away; prisms count around their axis; the D4 numbers its
vertices. `tests/dice.test.ts` pins the rules for every type.

## Rendering

- One interleaved static buffer per type: position, normal (flat; smooth on the coin rim),
  barycentric coordinates, label coordinates and atlas cell per vertex (D20: 60 vertices), plus
  a dynamic buffer of skin UVs. Polygons are fanned; the barycentric component of an internal
  diagonal is offset by 1, so only real edges are drawn. Multi-body dice draw each body's
  vertex range with its own model matrix (offset and scale).
- Numbers: a 640 × 512 single-channel signed-distance atlas, rasterized in JavaScript from the
  built-in stroke font (`renderer/glyphs.ts`) once per page and shared read-only. No font files,
  no canvas text, so the result is identical on every platform and no font license is involved.
  6 and 9 carry an underline.
- Edges: computed from barycentric coordinates with `fwidth`, so their width is in device pixels
  (scaled by √(20 / faces) above 20 faces so dense dice stay light).
- Trim surfaces carry negative skin UVs and keep the body color when a skin is active.
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
