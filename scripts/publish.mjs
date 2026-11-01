import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packages = ['core', 'react'].map((directory) => ({
  ...JSON.parse(readFileSync(new URL(`../packages/${directory}/package.json`, import.meta.url), 'utf8')),
  directory,
}));
const mode = process.env.NPM_PUBLISH_MODE || 'publish';
if (!['publish', 'bootstrap', 'stage'].includes(mode)) {
  throw new Error('NPM_PUBLISH_MODE must be publish, bootstrap or stage.');
}
const staged = mode !== 'publish';
const version = packages[0].version;
const tag = process.env.RELEASE_TAG;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}` || packages[1].version !== version) {
  throw new Error('Use a stable vX.Y.Z tag matching both package versions.');
}
if (packages[1].dependencies?.[packages[0].name] !== `^${version}`) {
  throw new Error('The React adapter must depend on the released core version (^X.Y.Z).');
}
console.log(`Validated ${tag}: ${packages.map((pkg) => pkg.name).join(', ')}`);
if (!process.argv.includes('--check')) {
  if (mode === 'bootstrap' && !process.env.NODE_AUTH_TOKEN) {
    throw new Error('Bootstrap requires the npm environment secret NPM_TOKEN.');
  }
  if (mode !== 'bootstrap' && process.env.NODE_AUTH_TOKEN) {
    throw new Error('OIDC modes must not use NODE_AUTH_TOKEN.');
  }
  // Preflight both versions before publishing either; network errors must fail closed.
  const pending = packages.filter((pkg) => {
    const result = spawnSync('npm', ['view', `${pkg.name}@${version}`, 'version', '--json', '--registry=https://registry.npmjs.org'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status === 0) {
      const response = JSON.parse(result.stdout);
      // npm 12 wraps even a single version in an array.
      const published = Array.isArray(response) && response.length === 1 ? response[0] : response;
      if (published !== version) throw new Error(`Unexpected registry version for ${pkg.name}`);
      console.log(`${pkg.name}@${version} already published; skipping immutable version.`);
      return false;
    }
    let response;
    try { response = JSON.parse(result.stdout); } catch { /* Report below. */ }
    if (response?.error?.code !== 'E404') throw new Error(`Registry lookup failed for ${pkg.name}: ${result.stderr}`);
    return true;
  });
  for (const pkg of pending) {
    const command = staged ? ['stage', 'publish'] : ['publish'];
    try {
      execFileSync('npm', [...command, '--access', 'public', '--provenance', '--registry=https://registry.npmjs.org'], {
        cwd: fileURLToPath(new URL(`../packages/${pkg.directory}/`, import.meta.url)),
        stdio: 'inherit',
      });
    } catch (error) {
      if (staged) {
        console.error('If this version is already staged, approve or reject it on npm before retrying; staged versions cannot be overwritten.');
        console.error('A generic E400 on a first release can also mean npm rejected the package name (e.g. too similar to an existing package).');
      }
      throw error;
    }
  }
  const summary = staged
    ? `Staging finished. Approve ${packages[0].name} first, then ${packages[1].name} in npm Staged Packages with 2FA. Already published versions were skipped.`
    : 'Publishing finished. Already published versions were skipped.';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${tag} (${mode})\n\n${summary}\n`);
  }
}
