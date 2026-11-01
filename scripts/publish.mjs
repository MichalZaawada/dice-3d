import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const packages = ['core', 'react'].map((directory) =>
  JSON.parse(readFileSync(new URL(`../packages/${directory}/package.json`, import.meta.url), 'utf8')));
const version = packages[0].version;
const tag = process.env.RELEASE_TAG;
if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}` || packages[1].version !== version) {
  throw new Error('Use a stable vX.Y.Z tag matching both package versions.');
}
if (packages[1].dependencies['dice-3d'] !== `^${version}`) {
  throw new Error('The React adapter must depend on the released core version (^X.Y.Z).');
}
console.log(`Validated ${tag}: ${packages.map((pkg) => pkg.name).join(', ')}`);
if (!process.argv.includes('--check')) {
  // Preflight both versions before publishing either; network errors must fail closed.
  const pending = packages.filter((pkg) => {
    const result = spawnSync('npm', ['view', `${pkg.name}@${version}`, 'version', '--json', '--registry=https://registry.npmjs.org'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status === 0) {
      if (JSON.parse(result.stdout) !== version) throw new Error(`Unexpected registry version for ${pkg.name}`);
      console.log(`${pkg.name}@${version} already published; skipping immutable version.`);
      return false;
    }
    let response;
    try { response = JSON.parse(result.stdout); } catch { /* Report below. */ }
    if (response?.error?.code !== 'E404') throw new Error(`Registry lookup failed for ${pkg.name}: ${result.stderr}`);
    return true;
  });
  for (const pkg of pending) {
    execFileSync('npm', ['publish', '-w', pkg.name, '--access', 'public', '--provenance', '--registry=https://registry.npmjs.org'], { stdio: 'inherit' });
  }
}
