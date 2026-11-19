import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { launchApp, tempProfile } from './launch';

const API_KEY = 'sk-e2e-should-never-be-plain-text-7f3a';

let profile: string;
test.beforeEach(() => {
  profile = tempProfile();
});
test.afterEach(() => {
  rmSync(profile, { recursive: true, force: true });
});

test('settings are saved as versioned JSON and survive a restart', async () => {
  let { app, page } = await launchApp(profile);
  const saved = await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.settings.update({
      ai: { llm: { baseUrl: 'https://llm.company.internal/v1', model: 'qwen3-32b' }, retries: 4 },
    }),
  );
  expect(saved.ai.llm).toEqual({ baseUrl: 'https://llm.company.internal/v1', model: 'qwen3-32b' });
  await app.close();

  const onDisk = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));
  expect(onDisk.version).toBe(2);
  expect(onDisk.data.ai.retries).toBe(4);

  ({ app, page } = await launchApp(profile));
  const reloaded = await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.settings.get(),
  );
  expect(reloaded.ai.llm.model).toBe('qwen3-32b');
  expect(reloaded.ai.retries).toBe(4);
  await app.close();
});

test('invalid settings from the renderer are rejected', async () => {
  const { app, page } = await launchApp(profile);
  const error = await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.settings
      .update({ ai: { llm: { baseUrl: 'file:///etc/passwd' } } })
      .then(
        () => 'accepted',
        (e: Error) => e.message,
      ),
  );
  expect(error).toContain('ai.llm.baseUrl');
  await app.close();
});

test('corrupt settings fall back to defaults without crashing', async () => {
  writeFileSync(join(profile, 'settings.json'), '{ this is not json');
  const { app, page } = await launchApp(profile);
  await expect(page.locator('h1')).toHaveText('AI Workflow'); // app started normally
  const settings = await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.settings.get(),
  );
  expect(settings.ai.retries).toBe(2);
  expect(settings.ai.llm.baseUrl).toBe('');
  expect(readdirSync(profile).some((f) => f.startsWith('settings.corrupt-'))).toBe(true);
  await app.close();
});

test('API key is encrypted on disk and can never be read back by the renderer', async () => {
  let { app, page } = await launchApp(profile);
  await page.evaluate(
    (key) =>
      (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.secrets.set(
        'ai.llm.apiKey',
        key,
      ),
    API_KEY,
  );
  const has = await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.secrets.has('ai.llm.apiKey'),
  );
  expect(has).toBe(true);

  // Nothing the renderer can reach returns the key.
  const exposed = await page.evaluate(() => {
    const api = (window as unknown as { aiWorkflow: Record<string, Record<string, unknown>> })
      .aiWorkflow;
    return Object.fromEntries(Object.entries(api).map(([k, v]) => [k, Object.keys(v).sort()]));
  });
  expect(exposed).toEqual({
    app: ['getInfo'],
    features: ['get'],
    settings: ['get', 'update'],
    secrets: ['clear', 'has', 'set'],
    ai: ['testConnection'],
    log: ['rendererError'],
    diagnostics: ['export', 'openLogs'],
  });
  await app.close();

  const raw = readFileSync(join(profile, 'secrets.json'), 'utf8');
  expect(raw).not.toContain(API_KEY);
  expect(Buffer.from(JSON.parse(raw).secrets['ai.llm.apiKey'], 'base64').toString()).not.toContain(
    API_KEY,
  );

  // Main can still decrypt it after a restart.
  ({ app, page } = await launchApp(profile));
  const stored = JSON.parse(raw).secrets['ai.llm.apiKey'] as string;
  const decrypted = await app.evaluate(
    ({ safeStorage }, b64) => safeStorage.decryptString(Buffer.from(b64, 'base64')),
    stored,
  );
  expect(decrypted).toBe(API_KEY);

  await page.evaluate(() =>
    (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.secrets.clear('ai.llm.apiKey'),
  );
  // The API key is gone; only the main-only database key remains.
  expect(
    Object.keys(JSON.parse(readFileSync(join(profile, 'secrets.json'), 'utf8')).secrets),
  ).toEqual(['db.key']);
  await app.close();
  expect(existsSync(join(profile, 'secrets.json'))).toBe(true);
});
