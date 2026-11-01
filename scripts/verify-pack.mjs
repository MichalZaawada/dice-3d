// Packs both packages, installs the tarballs into a clean project outside this workspace and checks
// the published contract: file list, explicit exports, TypeScript types (bundler and NodeNext
// resolution), template subpaths and SSR-safe imports in Node. Run after `npm run build:packages`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 'dice-3d-pack-verify-'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function pack(workspace) {
  const [info] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work, '-w', workspace], root));
  return info;
}

function assert(condition, message) {
  if (!condition) throw new Error(`verify-pack: ${message}`);
}

try {
  const core = pack('dice-3d');
  const react = pack('dice-3d-react');
  for (const [info, required] of [
    [core, ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'dist/index.js', 'dist/index.d.ts', 'templates/d20-net-v1.svg', 'templates/d20-net-v1.json']],
    [react, ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'dist/index.js', 'dist/index.d.ts']],
  ]) {
    const files = info.files.map((file) => file.path);
    for (const path of required) assert(files.includes(path), `${info.name} tarball is missing ${path}`);
    assert(!files.some((path) => /^(src|tests)\//.test(path) || path.endsWith('.tsbuildinfo')), `${info.name} ships sources or tests`);
    console.log(`${info.filename}: ${info.files.length} files, ${(info.size / 1024).toFixed(1)} kB packed, ${(info.unpackedSize / 1024).toFixed(1)} kB unpacked`);
  }

  const consumer = join(work, 'consumer');
  run('mkdir', ['-p', join(consumer, 'src')], work);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }, null, 2));
  run(
    'npm',
    [
      'install', '--no-audit', '--no-fund', '--prefer-offline', '--ignore-scripts',
      join(work, core.filename), join(work, react.filename),
      'react@19.3.1', 'react-dom@19.3.1', '@types/react@19.3.0', '@types/react-dom@19.3.0', 'typescript@~6.0.3', '@types/node@^24',
    ],
    consumer,
  );

  writeFileSync(
    join(consumer, 'src', 'usage.tsx'),
    `import { createD20, D20Error, D20_NET_V1, isD20Error, type AnimationResult, type D20, type D20Skin, type D20Value } from 'dice-3d';
import { D20View, type D20ViewHandle } from 'dice-3d-react';
import { createRef } from 'react';

export async function mount(host: HTMLElement, image: HTMLImageElement): Promise<AnimationResult | undefined> {
  let die: D20 | undefined;
  try {
    die = createD20(host, { value: 20, motion: 'system', theme: { bodyColor: '#123456' } });
  } catch (error) {
    if (isD20Error(error) && error.code === 'WEBGL_UNAVAILABLE') return undefined;
    throw error;
  }
  const skin: D20Skin = { source: image, layout: 'd20-net-v1', numbers: 'in-texture' };
  die.setSkin(skin);
  const value: D20Value = 12;
  const faces = D20_NET_V1.faces[value];
  void faces;
  const error: D20Error | null = null;
  void error;
  return die.rollTo(value, { durationMs: 900 });
}

export const handle = createRef<D20ViewHandle>();
export const element = <D20View ref={handle} value={5} motion="reduced" className="dice" />;
`,
  );
  for (const moduleResolution of ['bundler', 'nodenext']) {
    writeFileSync(
      join(consumer, `tsconfig.${moduleResolution}.json`),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: moduleResolution === 'bundler' ? 'ESNext' : 'NodeNext',
            moduleResolution,
            lib: ['ES2022', 'DOM'],
            jsx: 'react-jsx',
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
          },
          include: ['src'],
        },
        null,
        2,
      ),
    );
    run(join(consumer, 'node_modules', '.bin', 'tsc'), ['-p', `tsconfig.${moduleResolution}.json`], consumer);
    console.log(`TypeScript (${moduleResolution}): ok`);
  }

  writeFileSync(
    join(consumer, 'ssr.mjs'),
    `import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
const core = await import('dice-3d');
const { D20View } = await import('dice-3d-react');
if (typeof globalThis.window !== 'undefined') throw new Error('window must not exist in this test');
const html = renderToString(createElement(D20View, { value: 7, className: 'dice' }));
if (html !== '<div class="dice" data-dice-3d-view=""></div>') throw new Error('Unexpected SSR output: ' + html);
try {
  core.createD20({});
  throw new Error('createD20 must fail on the server');
} catch (error) {
  if (error.code !== 'WEBGL_UNAVAILABLE') throw error;
}
const template = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('dice-3d/templates/d20-net-v1.json')), 'utf8'));
if (JSON.stringify(template.faces['20']) !== JSON.stringify(core.D20_NET_V1.faces[20])) throw new Error('Template mismatch');
readFileSync(fileURLToPath(import.meta.resolve('dice-3d/templates/d20-net-v1.svg')), 'utf8');
try {
  await import('dice-3d/dist/controller/createD20.js');
  throw new Error('Internal files must not be importable');
} catch (error) {
  if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
}
console.log('Node SSR import: ok');
`,
  );
  process.stdout.write(run('node', ['ssr.mjs'], consumer));
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules', 'dice-3d', 'package.json'), 'utf8'));
  assert(!installed.dependencies, 'dice-3d must not have runtime dependencies');
  console.log(`verify-pack: ok (${keep ? `kept ${work}` : 'temporary project removed'})`);
} finally {
  if (!keep) rmSync(work, { recursive: true, force: true });
}
