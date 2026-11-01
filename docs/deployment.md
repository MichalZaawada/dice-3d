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

The release workflow runs on a pushed `v*` tag, or Actions → Publish npm packages
→ Run workflow with a release tag selected. Branch runs do not publish. Stable
`vX.Y.Z` must match both package versions and the React core dependency `^X.Y.Z`.
The release commit must be reachable from `main`. Prereleases are not supported.

Quality checks (including Chromium, Firefox and WebKit) must pass before the
release job starts. The job uses a fresh GitHub-hosted Ubuntu runner, Node from
`.nvmrc`, pinned npm 12.2.1, no dependency cache, and read-only repository access.
Only the release job receives `id-token: write`; checkout does not persist credentials.
It rebuilds and verifies the packed packages before sending core, then React,
to npm with provenance. Actions are pinned to commit SHAs.

### Publication modes

| Mode | Authentication | Result |
| --- | --- | --- |
| `publish` (default) | Trusted Publishing / OIDC | Public immediately after checks |
| `bootstrap` | npm environment secret `NPM_TOKEN` | Staged; maintainer approves with 2FA |
| `stage` | Trusted Publishing / OIDC | Staged; maintainer approves with 2FA |

Manual runs have a mode selector. Tag pushes use the `NPM_PUBLISH_MODE` variable
in the GitHub `npm` environment, defaulting to `publish`. Mode selection is explicit:
leaving a token secret behind never switches an OIDC release to token authentication.
Only `bootstrap` exposes the secret, and only to the final publication step.

### First release: 0.0.1

1. Create the npm account (or organization) `ticone_marsicano`, which owns the
   `@ticone_marsicano` scope, verify its email and enable 2FA. Verify package names
   and repository metadata, and review the release checklist.
2. In GitHub Settings → Environments → `npm`, add a short-lived granular npm
   token with write permission to create packages in the `@ticone_marsicano` scope
   as secret `NPM_TOKEN`.
   A stage-only token is sufficient. Do not put the token in the repository.
3. In the same environment, add variable `NPM_PUBLISH_MODE` = `bootstrap`.
4. Merge the release changes to `main`, including both versions `0.0.1`, then push
   tag `v0.0.1`. Creating a GitHub Release with that new tag also triggers the workflow.
5. After staging succeeds, open npmjs.com → Staged Packages, inspect and approve
   `@ticone_marsicano/dice-3d@0.0.1`, then `@ticone_marsicano/dice-3d-react@0.0.1`,
   with 2FA. A green staging job means uploaded for review, not publicly released. npm initially creates a public
   `0.0.0-stage` placeholder; the real staged contents remain private until approval.

No local npm login or publish is required for this bootstrap.

### Enable Trusted Publishing after bootstrap

Configure each package on npmjs.com → Settings → Trusted publishing:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | `MichalZaawada` |
| Repository | `dice-3d` |
| Workflow filename | `npm.yml` |
| Environment | `npm` |
| Allowed action | Enable `npm publish` for automatic releases; stage-only for manual npm approval |

Set the GitHub `npm` environment variable `NPM_PUBLISH_MODE` to `publish` (or
`stage` for approval on every release). A newly configured trusted publisher must
complete a successful release within two days or be recreated. After verifying
OIDC, delete the GitHub token secret, revoke the npm token, and set package
publishing access to require 2FA and disallow traditional tokens. OIDC still works.

Protect `main`, release tags `v*`, and workflow changes with GitHub rulesets.
The `npm` environment may require reviewers before the release job runs. GitHub
environment approval and npm staging approval are separate controls.

### Subsequent releases and recovery

1. Update both versions, the adapter dependency, lockfile and changelogs.
2. Merge to `main`, then create and push the matching tag, e.g. `v0.0.2`.
3. Review the Actions summary. `publish` makes both packages public; `stage`
   requires npm approval for each, core first.

Offline preflight: `RELEASE_TAG=v0.0.1 node scripts/publish.mjs --check`.
Release automation tests: `npm run test:publish` (mock CLI, no registry writes).

Publishing both packages is not atomic. On retry the script skips already public
versions; registry errors other than E404 stop the job before any package writes.
If a version is already staged, inspect and approve it rather than staging it again.
If rejected, follow npm's version reuse rules; never move a release tag to changed code.
The script does not automatically reject or approve staged versions. Published
versions are immutable, and skipped versions are not compared to local source.

References: [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[staged publishing](https://docs.npmjs.com/staged-publishing/), and
[npm stage CLI](https://docs.npmjs.com/cli/v12/commands/npm-stage/).
