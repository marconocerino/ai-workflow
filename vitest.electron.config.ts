import { defineConfig } from 'vitest/config';

// Unit tests for the main process and shared code (Node environment).
// Renderer tests run through `ng test`. Types (incl. @ts-expect-error checks) are verified by
// `tsc -p electron/tsconfig.spec.json`, which `npm run test:electron` runs first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.spec.ts', 'shared/**/*.spec.ts', 'scripts/**/*.spec.mjs'],
  },
});
