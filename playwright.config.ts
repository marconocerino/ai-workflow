import { defineConfig } from '@playwright/test';

// End-to-end tests launch the real Electron app from the production build (`npm run build`).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
});
