# Release checklist

Nothing has been published. Before the first release of `dice-3d` and `dice-3d-react`:

1. **License.** The packages currently carry the MIT license as a placeholder chosen during
   implementation; the owner must confirm it (or replace `LICENSE` and the `license` fields).
   No font is embedded (numbers use the library's own stroke glyphs), so no font license applies.
2. **Package names.** `npm view dice-3d` and `npm view dice-3d-react` returned 404 on
   2026-11-01. npm may still reject names that are too similar to existing packages; only a
   publish attempt confirms availability.
3. **Repository metadata.** Add `repository`, `homepage` and `bugs` fields once the library has
   its own repository.
4. Run `npm run check` and `npm run test:e2e` (Chromium, Firefox, WebKit).
5. Record the reference device, browser version, tarball/bundle size and p95 frame time
   (see [testing.md](testing.md)); the p95 target is ≤ 16.7 ms.
6. Update both `CHANGELOG.md` files and versions (SemVer; before 1.0 contract changes need
   migration notes).
7. `npm publish -w dice-3d && npm publish -w dice-3d-react` (core first; the adapter depends on
   `dice-3d@^0.1.0`).

## Moving the project to its own repository

The directory is self-contained: copy `dice-3d/` to a new repository root, run `npm install`,
and run `git init` there. Nothing refers to paths outside the directory.
