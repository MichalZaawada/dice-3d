import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('server-side rendering safety', () => {
  it('imports without window or document and fails only when creating an instance', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    const library = await import('../src/index.js');
    expect(typeof library.createD20).toBe('function');
    expect(library.D20_NET_V1.faces[20]).toHaveLength(3);
    expect(() => library.createD20({} as HTMLElement)).toThrow(
      expect.objectContaining({ name: 'D20Error', code: 'WEBGL_UNAVAILABLE' }),
    );
  });
});

describe('package isolation', () => {
  it('core sources import only relative modules (no runtime dependencies, no React)', () => {
    for (const file of sourceFiles(srcDir)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)) {
        expect(match[1], `${file} imports ${match[1]}`).toMatch(/^\.\.?\//);
      }
    }
  });
});
