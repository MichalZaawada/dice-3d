# dice-3d

Independent TypeScript library for 3D dice on the web. This directory is a self-contained
npm-workspaces project with its own dependencies, build, tests and documentation; it has no
dependency on any host application and can be moved to its own repository as-is.

| Package | Path | Purpose |
| --- | --- | --- |
| `dice-3d` | [`packages/core`](packages/core/README.md) | Framework-agnostic WebGL2 die (D20 in 0.1). |
| `dice-3d-react` | [`packages/react`](packages/react/README.md) | Optional `<D20View>` adapter. |

Examples: [`examples/vanilla`](examples/vanilla) (TypeScript, every core feature) and
[`examples/react`](examples/react).

Documentation:

- [Architecture and renderer choice](docs/architecture.md)
- [Skins, templates and UV conventions](docs/skins.md)
- [Testing and measurements](docs/testing.md)
- [Release checklist](docs/releasing.md)

## Requirements

Node.js ≥ 22.12 (developed with Node 26, see `.nvmrc`) and npm ≥ 10. Browsers need WebGL2.

## Scripts

Run from this directory after `npm install`:

| Script | What it does |
| --- | --- |
| `npm run build:packages` | Builds `dice-3d` and `dice-3d-react` (ESM + `.d.ts`). |
| `npm run build` | Packages, then the examples. |
| `npm run typecheck` | Type-checks packages, examples, tests and tooling. |
| `npm run lint` | ESLint (the core may not import any package). |
| `npm test` | Unit tests (Vitest: Node, jsdom and SSR projects). |
| `npm run test:e2e` | Browser tests (Playwright: Chromium, Firefox, WebKit) against the built packages. Install browsers once with `npx playwright install chromium firefox webkit`. |
| `npm run size` | Minified/gzip size of the entry points and the 200 kB gzip budget check. |
| `npm run pack:verify` | `npm pack`, installation into a clean temporary project, TypeScript (bundler/NodeNext) and Node SSR import checks. |
| `npm run templates` | Regenerates `packages/core/templates/d20-net-v1.{svg,json}` from the source tables. |
| `npm run check` | lint → build packages → typecheck → test → build examples → size → pack:verify. |

To try the examples: `npm run build:packages && npx vite` and open
`http://127.0.0.1:4317/examples/vanilla/index.html` or `/examples/react/index.html`.

## Layout

```text
packages/core/src/
  index.ts        public exports only
  controller/     createD20, DOM mount, state machine, validation, skin validation
  geometry/       die definitions: D20 vertices, numbering table, face frames, net template
  animation/      clock, easing, quaternions, orient/roll tracks, motion modes
  renderer/       WebGL2 renderer, shaders, camera, glyphs and number atlas, mesh
packages/core/templates/   d20-net-v1.svg / .json (published)
packages/core/tests/       unit tests and the numbering fixture
packages/react/            adapter and its tests
examples/                  vanilla and React examples
e2e/                       Playwright tests, test fixture and visual review page
scripts/                   template generation, size and pack verification
```

## Interactive demo

```sh
npm run build:packages
npm run demo
```

Open the address printed by Vite. The playground includes random rolls, rolls
with a chosen result, recent results, materials, custom UV artwork, net texture
uploads, number overlays and motion preferences.

For a standalone HTML file that opens directly without a server:

```sh
npm run demo:build
```

Open `examples/vanilla/dist/demo.html`. The file embeds the library, styles and
template downloads; it does not require a network connection. Uploads must use
the provided D20 net layout. Random results are chosen by the demo application.
