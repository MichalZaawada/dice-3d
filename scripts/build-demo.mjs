import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync('npm', ['run', 'build', '-w', 'dice-3d-example-vanilla'], { cwd: root, stdio: 'inherit' });
const dist = join(root, 'examples/vanilla/dist');
let html = await readFile(join(dist, 'index.html'), 'utf8');
const assets = await readdir(join(dist, 'assets'));
let script = await readFile(join(dist, 'assets', assets.find((name) => name.endsWith('.js'))), 'utf8');
for (const name of assets.filter((name) => !/\.(js|css)$/.test(name))) {
  const content = await readFile(join(dist, 'assets', name));
  const mime = name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
  script = script.replaceAll(`/assets/${name}`, `data:${mime};base64,${content.toString('base64')}`);
}
const css = await readFile(join(dist, 'assets', assets.find((name) => name.endsWith('.css'))), 'utf8');
html = html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`);
const output = join(dist, 'demo.html');
await writeFile(output, html);
console.log(`Standalone demo: ${output}`);
