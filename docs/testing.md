# Testing and measurements

## Commands

```sh
npm install
npx playwright install chromium firefox webkit   # once, for browser tests
npm run check       # lint, build packages, typecheck, unit tests, build examples, size, pack:verify
npm run test:e2e    # Playwright in Chromium, Firefox and WebKit (needs built packages)
```

Unit tests run in three Vitest environments: Node (core logic, SSR import), jsdom (DOM mount
with fake renderer/observers, React adapter) and Node again for React server rendering.
Controller tests drive a fake frame scheduler, so time, frames and page visibility are fully
controlled. Browser tests run against a Vite dev server that serves the **built** packages
through their `exports`, exactly as a consumer would import them.

## Acceptance criteria coverage

| Area | Where it is verified |
| --- | --- |
| Geometry: 20 faces, each value once, opposite pairs sum to 21, outward normals | `packages/core/tests/geometry.test.ts` (+ 12 vertices, 30 equal edges, balanced vertex sums, numbering fixture) |
| Orientations: all 20 values face the camera with an upright label | `geometry.test.ts` (math, all values); `e2e/d20.e2e.ts` reads screen pixels for all 20 values with a color-coded skin |
| Textures: template and custom UV for all 20 faces without mirroring, overlay/in-texture, swap at rest and during animation, repeated swaps | `e2e/d20.e2e.ts` (template and custom layout pixel checks, 30 swaps + swap mid-roll + `ImageBitmap` + reset, `gl.getError() === 0`); `netTemplate.test.ts` (real unfolding: 19 shared net edges, equilateral, non-mirrored, JSON/SVG in sync); controller tests |
| Texture validation: bad UVs, undecoded image, CORS, GPU limit, upload error keep the previous look | `validation.test.ts`, `controller.test.ts` (simulated upload failure mid-animation), `e2e/d20.e2e.ts` (undecoded `Image`, cross-origin image without CORS → `TEXTURE_UPLOAD_FAILED`, canvas above `MAX_TEXTURE_SIZE`, mirrored UV; pixels unchanged afterwards) |
| Controller: replacement, abort, duration 0, invalid input, dispose settle each Promise once | `controller.test.ts`; `e2e/d20.e2e.ts` |
| Clock: completion independent of frame count; pause while hidden | `controller.test.ts` (1, 3, 60 and 500 frames; hidden at start and mid-animation), `animation.test.ts` |
| Lifecycle: no RAF, listeners, observers or resources after dispose | `controller.test.ts`, `mount.dom.test.ts`; browser: no frames requested at rest, canvas removed, context released |
| Accessibility: all motion modes and changes during animation | `controller.test.ts`; browser with `prefers-reduced-motion: reduce` |
| Browsers: resize, DPR, no WebGL, context loss | `e2e/d20.e2e.ts` in Chromium, Firefox and WebKit |
| Appearance: all faces, 6/9, 96/160/320 CSS px, light and dark | `e2e/visual.e2e.ts` writes `test-results/**/visual-<browser>.png` for manual review |
| Import: tarball in a clean TS project, SSR import | `npm run pack:verify`; `ssr.test.ts`; `D20View.ssr.test.tsx` |
| Isolation: two instances independent; core imports no React or app code | `controller.test.ts`, `e2e/d20.e2e.ts`, `ssr.test.ts` (import scan), ESLint rule |

## Results recorded on 2026-11-01

Environment: MacBook Air (M1, 2020, `MacBookAir10,1`, 16 GB), macOS 15.5, Node 26.13.0,
Playwright 1.64.1 with headless Chromium 156, Firefox 157 and WebKit 27.2. This machine is
**not** an agreed reference device.

- Unit tests: 130 passed (10 files).
- Browser tests: 57 passed (19 tests × 3 engines).
- `npm run check`: passed (lint, typecheck, build, unit tests, examples, size, pack:verify).
- Size (`npm run size`): `dice-3d` 28.8 kB minified / **11.3 kB gzip** (budget 200 kB gzip);
  `dice-3d-react` 1.0 kB gzip without React and core.
- Tarballs (`npm run pack:verify`): `dice-3d-0.1.0.tgz` 40.2 kB packed / 129.2 kB unpacked
  (60 files); `dice-3d-react-0.1.0.tgz` 4.5 kB / 11.4 kB.
- Frame timing (`e2e/performance.e2e.ts`, 160 × 160 CSS px, DPR 2, five consecutive rolls):

  | Engine | Frames | p95 frame interval | p95 time in animation callbacks |
  | --- | --- | --- | --- |
  | Chromium 156 | 354 | 16.8 ms | 0.1 ms |
  | Firefox 157 | 358 | 16.8 ms | 1 ms (timer resolution) |
  | WebKit 27.2 | 363 | 18.0 ms | 1 ms (timer resolution) |

  Frame intervals in headless browsers reflect the headless compositor, not GPU cost. The
  callback time (JavaScript plus WebGL command submission) stays far below the 16.7 ms budget.
  The p95 target still has to be confirmed on the chosen reference device in a headed browser.

## Known test limitations

- The pixel-reading tests run headless with each engine's default WebGL implementation on
  macOS; other GPUs and drivers are not covered.
- Context loss is simulated with `WEBGL_lose_context`; real GPU resets are not reproduced.
- Hidden-tab pausing is verified with controlled time in unit tests, not in a real background tab.
- The visual review is manual: the screenshots are produced, not compared against baselines.
