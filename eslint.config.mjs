// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'release/',
      '.angular/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'node_modules/',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // `app-` for app screens, `aiw-` for the shared UI kit (src/app/ui).
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['app', 'aiw'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: ['element', 'attribute'], prefix: ['app', 'aiw'], style: 'kebab-case' },
      ],
      // Never log transcripts, audio or keys — console use must be deliberate.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Main process: every promise must be awaited or handled (an unawaited secret save once
    // reported success before the key was stored). Type-aware, so electron/ only.
    files: ['electron/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './electron/tsconfig.spec.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
);
