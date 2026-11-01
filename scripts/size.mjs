// Measures the minified + gzipped size of the published entry points and checks the budget.
// Run after `npm run build:packages`.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const CORE_BUDGET_BYTES = 200 * 1024;
const root = fileURLToPath(new URL('..', import.meta.url));

async function measure(entry, external = []) {
  const result = await build({
    entryPoints: [`${root}${entry}`],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].contents;
  return { minified: code.byteLength, gzip: gzipSync(code, { level: 9 }).byteLength };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const core = await measure('packages/core/dist/index.js');
const react = await measure('packages/react/dist/index.js', ['react', 'react/jsx-runtime', '@ticonemarsicano/dice-3d']);
console.log(`dice-3d        ${kb(core.minified)} minified, ${kb(core.gzip)} gzip (budget ${kb(CORE_BUDGET_BYTES)} gzip)`);
console.log(`dice-3d-react  ${kb(react.minified)} minified, ${kb(react.gzip)} gzip (excluding react and dice-3d)`);
if (core.gzip > CORE_BUDGET_BYTES) {
  console.error('dice-3d exceeds its size budget');
  process.exit(1);
}
