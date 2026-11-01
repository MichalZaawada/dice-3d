# Changelog — dice-3d

All notable changes follow [Semantic Versioning](https://semver.org/). Before 1.0, contract
changes include migration notes.

## Unreleased

Added (backwards compatible; `createD20`, D20 types, numbering and `d20-net-v1` unchanged):

- `createDie(container, { type, … })` for D2, D3, D4, D5, D6, D7, D8, D10, D12, D14, D16, D20,
  D24, D30, D48, D60, D120, the percentile D100 (tens + units dice in one canvas) and tens D10,
  and Fudge/Fate DF, with the same lifecycle as `createD20` and an `info` property.
- Custom dice: `defineDie({ id, shape, faces })` on built-in shapes, prisms or trapezohedra,
  with repeated outcomes, string results, stroke symbols and blank faces.
- `getDieInfo`, `getDieTemplate`, `createDieTemplateSvg`, `DIE_TYPES`, `DIE_SHAPES`,
  `isDieType`, `DieError`/`isDieError` aliases and the `Die*` types.
- Per-type grid skin templates `templates/<type>-grid-v1.{svg,json}` and explicit per-face UV
  polygon layouts; layouts of other types are rejected.

## 0.0.1 — 2026-11-01

Initial MVP.

- `createD20(container, options)` with a purpose-built WebGL2 renderer (no runtime dependencies).
- Regular icosahedron with a durable, balanced numbering table (opposite faces sum to 21) and
  orientation markers on 6 and 9.
- `orientTo` (shortest path) and `rollTo` (separate spin segment plus hop) to an
  application-chosen value, `setValue`, last-request-wins cancellation with `replaced`,
  `aborted` and `disposed` results.
- Motion modes `system`, `full`, `reduced` (≤ 150 ms, no hop or spins) and `none`.
- Themes (`#RRGGBB` colors, transparent or solid background).
- Injectable skins: the `d20-net-v1` template (`templates/d20-net-v1.svg` and `.json`) or a
  custom UV table; `overlay` or `in-texture` numbers.
- `ResizeObserver` sizing, `maxPixelRatio`, DPR changes, pause while the page is hidden, no
  render loop at rest, context-loss handling, idempotent `dispose`.
- SSR-safe imports; `D20Error` with stable codes.
