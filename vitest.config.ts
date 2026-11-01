import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Adapter tests use the core sources directly, so they do not depend on a prior build.
const coreSource = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.dom.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'core-dom',
          root: './packages/core',
          include: ['tests/**/*.dom.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias: { '@ticone_marsicano/dice-3d': coreSource } },
        test: {
          name: 'react',
          root: './packages/react',
          include: ['tests/**/*.test.tsx'],
          exclude: ['tests/**/*.ssr.test.tsx'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias: { '@ticone_marsicano/dice-3d': coreSource } },
        test: {
          name: 'react-ssr',
          root: './packages/react',
          include: ['tests/**/*.ssr.test.tsx'],
          environment: 'node',
        },
      },
    ],
  },
});
