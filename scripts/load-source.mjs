// Loads a TypeScript module from packages/core/src for Node scripts (bundled in memory with esbuild).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function loadCoreModule(relativePath) {
  const entry = fileURLToPath(new URL(`../packages/core/src/${relativePath}`, import.meta.url));
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
