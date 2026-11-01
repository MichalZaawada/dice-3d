import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real release script with an isolated registry CLI; never contact npm.
function run({ mode = 'publish', token = '', tag = 'v0.0.1', registry = {}, check = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dice-release-test-'));
  try {
    for (const dir of ['scripts', 'bin', 'packages/core', 'packages/react']) mkdirSync(join(root, dir), { recursive: true });
    copyFileSync(new URL('./publish.mjs', import.meta.url), join(root, 'scripts/publish.mjs'));
    for (const [dir, name] of [['core', 'dice-3d'], ['react', 'dice-3d-react']]) {
      writeFileSync(join(root, `packages/${dir}/package.json`), JSON.stringify({ name, version: '0.0.1', dependencies: { 'dice-3d': '^0.0.1' } }));
    }
    const log = join(root, 'calls');
    writeFileSync(log, '');
    writeFileSync(join(root, 'bin/npm'), `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.TEST_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === 'view') {
  const state = JSON.parse(process.env.TEST_REGISTRY)[args[1]] || 'E404';
  console.log(JSON.stringify(state === 'published' ? '0.0.1' : { error: { code: state } }));
  process.exit(state === 'published' ? 0 : 1);
}
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, ['scripts/publish.mjs', ...(check ? ['--check'] : [])], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, RELEASE_TAG: tag,
        NPM_PUBLISH_MODE: mode, NODE_AUTH_TOKEN: token, TEST_LOG: log, TEST_REGISTRY: JSON.stringify(registry),
        GITHUB_STEP_SUMMARY: join(root, 'summary') },
    });
    const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    return { ...result, calls, writes: calls.filter(({ args }) => args[0] !== 'view') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const mode of ['publish', 'bootstrap', 'stage']) {
  test(`${mode}: correct command, core before adapter, no workspace flags`, () => {
    const result = run({ mode, token: mode === 'bootstrap' ? 'test-token' : '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.writes.length, 2);
    result.writes.forEach(({ args, cwd }, i) => {
      const command = mode === 'publish' ? ['publish'] : ['stage', 'publish'];
      assert.deepEqual(args.slice(0, command.length), command);
      assert.ok(cwd.endsWith(i === 0 ? '/packages/core' : '/packages/react'));
      assert.ok(!args.includes('-w'));
      assert.ok(args.includes('--provenance'));
    });
  });
}
test('registry failure in either package prevents all writes', () => {
  const result = run({ registry: { 'dice-3d-react@0.0.1': 'E503' } });
  assert.notEqual(result.status, 0);
  assert.equal(result.writes.length, 0);
});
test('retry skips published core and publishes only adapter', () => {
  const result = run({ registry: { 'dice-3d@0.0.1': 'published' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.writes.length, 1);
  assert.ok(result.writes[0].cwd.endsWith('/packages/react'));
});
test('invalid tag, mode and credentials fail before registry access', () => {
  for (const options of [{ tag: 'v0.1.0' }, { mode: 'unknown' }, { mode: 'bootstrap' }, { token: 'unexpected' }, { mode: 'stage', token: 'unexpected' }]) {
    const result = run(options);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls.length, 0);
  }
});
test('check mode is offline and does not require bootstrap credentials', () => {
  const result = run({ mode: 'bootstrap', check: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 0);
});
