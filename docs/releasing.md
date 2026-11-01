# Release checklist

See [deployment pipelines](deployment.md) for GitHub Pages, npm authentication and tag-based releases.

Before the first npm release of `@ticonemarsicano/dice-3d` and `@ticonemarsicano/dice-3d-react`:

1. **License.** The packages currently carry the MIT license as a placeholder chosen during
   implementation; the owner must confirm it (or replace `LICENSE` and the `license` fields).
   No font is embedded (numbers use the library's own stroke glyphs), so no font license applies.
2. **Package names.** Packages are published under the `@ticonemarsicano` scope. The unscoped
   name `dice-3d` was rejected by npm on 2026-11-01 because it differs from the existing
   `dice3d` only by punctuation (staging reported a generic `E400 Version uniqueness check
   failed unexpectedly`). Scoped names skip that similarity check; the npm account or
   organization `ticonemarsicano` must own the scope.
3. **Repository metadata.** Verify the `repository`, `homepage` and `bugs` fields point to
   `MichalZaawada/dice-3d`.
4. Run `npm run check` and `npm run test:e2e` (Chromium, Firefox, WebKit).
5. Record the reference device, browser version, tarball/bundle size and p95 frame time
   (see [testing.md](testing.md)); the p95 target is ≤ 16.7 ms.
6. Update both `CHANGELOG.md` files and versions (SemVer; before 1.0 contract changes need
   migration notes).
7. For the first release, configure the `bootstrap` mode and stage-only token in
   the GitHub `npm` environment, push the matching stable tag, and approve both
   packages on npm with 2FA (core first). Then configure Trusted Publishing for
   subsequent releases. See the deployment guide for exact settings.

## Repository

The project is maintained independently at https://github.com/MichalZaawada/dice-3d.
