# Deployment pipelines

## Demo: GitHub Pages

Live URL: https://MichalZaawada.github.io/dice-3d/

`pages.yml` runs on every push to `main`, or manually from Actions → Publish demo
→ Run workflow → main. It calls the reusable quality workflow (lint, build,
types, unit tests, package checks and Chromium/Firefox/WebKit tests), builds the
self-contained demo, and deploys it to the `github-pages` environment. Failed
checks leave the previous site online. Pull requests run checks without deploying.

The site artifact contains only `index.html`, downloadable `demo.html`, and
`.nojekyll`. The generated HTML embeds all scripts, styles and template files,
so it works at `/dice-3d/` without absolute asset paths. No npm credentials or
custom domain are needed. The repo's Settings → Pages source must be **GitHub
Actions**. Deployment is serialized to avoid interrupting an in-progress publish.

## Packages: npm

`npm.yml` runs when a `v*` tag is pushed. It can also be rerun manually by
selecting the release tag in the Actions UI. Branch runs skip publication.
Only stable `vX.Y.Z` tags matching both package versions are accepted, and the
release commit must be an ancestor of `main`. The React dependency must match
`^X.Y.Z`. Pre-release publishing is intentionally not supported yet.

After the same quality checks, packages are rebuilt from the tag and published
publicly with provenance, core first. Publishing uses npm trusted publishing
(OIDC) on GitHub-hosted runners; no `NPM_TOKEN` secret is used. The `npm`
environment can have required reviewers configured in GitHub Settings.

### One-time npm setup

The pipeline does not create an npm account or configure package ownership.
For each package, configure its trusted publisher on npm:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | `MichalZaawada` |
| Repository | `dice-3d` |
| Workflow filename | `npm.yml` |
| Environment | `npm` |
| Allowed action | Direct publishing (`npm publish`) |

If a package does not yet exist, bootstrap its first version from a trusted
local checkout using your npm account, then configure its trusted publisher.
Check name availability and ownership first. Confirm the project's MIT license
before the first npm release. The workflow does not publish a first version
until npm accepts its authentication and ownership configuration.

Example bootstrap from the commit intended for release:

```sh
nvm use
npm ci
npm run check
npm run test:e2e
npm login
npm publish -w dice-3d --access public
npm publish -w dice-3d-react --access public
```

Follow npm's current [trusted publishing setup](https://docs.npmjs.com/trusted-publishers/)
for account-side configuration. Keep the workflow filename and environment in
sync with the npm settings. Node 26 includes an npm CLI supporting OIDC.

### Subsequent releases

1. Update both package versions, the React adapter's core dependency,
   `package-lock.json` (`npm install --package-lock-only`), and both changelogs.
2. Merge those changes to `main` and let checks pass.
3. Tag that commit and push the tag (example version):

   ```sh
   git tag -a v0.2.0 -m "Release 0.2.0"
   git push origin v0.2.0
   ```

4. Review the Publish npm packages workflow; approve its environment if required.

Local preflight: `RELEASE_TAG=v0.2.0 node scripts/publish.mjs --check`.
This validates versions without accessing npm or publishing anything.

If core succeeds and the adapter fails, fix the authentication/environment issue
and rerun the same tag. Registry preflight skips already published versions and
publishes the missing package. Registry failures other than E404 stop the job.
Published versions are immutable; skipped versions are not compared with local
source. Never reuse an existing version for changed code. Publishing two packages
is not atomic. To undo a broken demo, revert the change on `main`; to fix a package,
publish a new version instead of moving an existing tag.

Workflow actions are pinned to commit SHAs. Update those pins deliberately when
upgrading Actions. npm publishing is separate from Pages and never happens on
an ordinary push to `main`.
