import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, tempProfile } from './launch';

let profile: string;
test.beforeEach(() => {
  profile = tempProfile();
});
test.afterEach(() => {
  rmSync(profile, { recursive: true, force: true });
});

test('first run creates an encrypted database at the latest schema; restart keeps it', async () => {
  let { app, page } = await launchApp(profile);
  await expect(page.getByTestId('db-status')).toContainText('Encrypted · schema v1');
  await app.close();

  const file = join(profile, 'data', 'app.db');
  expect(existsSync(file)).toBe(true);
  const head = readFileSync(file).subarray(0, 16).toString('latin1');
  expect(head).not.toBe('SQLite format 3\0'); // encrypted: no plain SQLite header

  // The key is stored encrypted by the OS, never in plain text.
  const secrets = JSON.parse(readFileSync(join(profile, 'secrets.json'), 'utf8'));
  expect(Object.keys(secrets.secrets)).toContain('db.key');
  expect(secrets.secrets['db.key']).not.toMatch(/^[0-9a-f]{64}$/);

  ({ app, page } = await launchApp(profile));
  await expect(page.getByTestId('db-status')).toContainText('Encrypted · schema v1');
  await app.close();
  expect(readdirSync(join(profile, 'data')).filter((f) => f.includes('unreadable'))).toEqual([]);
});

test('the renderer cannot touch the database key', async () => {
  const { app, page } = await launchApp(profile);
  const result = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        aiWorkflow: { secrets: Record<string, (...a: unknown[]) => Promise<unknown>> };
      }
    ).aiWorkflow;
    const tryCall = (fn: () => Promise<unknown>) =>
      fn().then(
        () => 'allowed',
        () => 'refused',
      );
    return {
      has: await tryCall(() => api.secrets['has']!('db.key')),
      set: await tryCall(() => api.secrets['set']!('db.key', 'x')),
      clear: await tryCall(() => api.secrets['clear']!('db.key')),
    };
  });
  expect(result).toEqual({ has: 'refused', set: 'refused', clear: 'refused' });
  await expect(page.getByTestId('db-status')).toContainText('Encrypted');
  await app.close();
});
