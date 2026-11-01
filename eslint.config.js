import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**', '.pack-verify/**'] },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['packages/react/**/*.{ts,tsx}', 'examples/react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The core must stay framework-free and SSR-safe: no UI framework imports,
    // and browser globals are only touched inside functions (enforced by the SSR test).
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', '@ticone_marsicano/dice-3d-react'] }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportDeclaration[source.value=/^[^.]/]', message: 'The core has no runtime dependencies.' },
      ],
    },
  },
);
