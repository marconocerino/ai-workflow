import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readZip } from '../electron/diagnostics/zip';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { launchApp, tempProfile } from './launch';

const KEY = 'sk-e2e-diagnostics-key-7f3a';
const LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (DEBUG|INFO |WARN |ERROR) \[[a-z-]+\] \S/;
const HEX_KEY = /\b[0-9a-f]{64}\b/i;

let server: FakeAiServer;
let profile: string;

test.beforeEach(async () => {
  server = await startFakeAiServer(KEY, ['qwen3-32b']);
  profile = tempProfile();
});
test.afterEach(async () => {
  await server.close();
  rmSync(profile, { recursive: true, force: true });
});

test('logs have levels and timestamps, never keys; export makes a zip of logs and settings', async () => {
  const exports = join(profile, 'exports');
  mkdirSync(exports);
  const { app, page } = await launchApp(profile, {
    AIW_DIAGNOSTICS_DIR: exports,
    AIW_LOG_LEVEL: 'debug',
  });

  // Use the key: save it and send it to the server in a request header.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('nav-ai-servers').click();
  await page.getByTestId('llm-base-url').fill(server.baseUrl);
  await page.getByTestId('llm-base-url').blur();
  await page.getByTestId('llm-model').fill('qwen3-32b');
  await page.getByTestId('llm-model').blur();
  await page.getByTestId('llm-key').fill(KEY);
  await page.getByTestId('llm-save-key').click();
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(/Connected/);

  // A renderer error that (wrongly) contains the key reaches the log, scrubbed.
  await page.evaluate((key) => {
    setTimeout(() => {
      throw new Error(`request failed for ${key}`);
    });
  }, KEY);

  // Export from Settings → Diagnostics.
  await page.getByTestId('nav-about').click();
  await expect(
    page.getByRole('heading', { name: 'About & diagnostics', exact: true }),
  ).toBeVisible();
  await page.getByTestId('export-diagnostics').click();
  await expect(page.getByTestId('export-status')).toContainText('Saved');
  await expect(page.getByTestId('export-status')).toContainText(
    /AI-Workflow-diagnostics-[\d-]+\.zip/,
  );
  await app.close();

  // Log files: readable lines with timestamp, level and scope.
  const logsDir = join(profile, 'logs');
  const logText = readdirSync(logsDir)
    .map((f) => readFileSync(join(logsDir, f), 'utf8'))
    .join('\n');
  const entries = logText.split('\n').filter((l) => l && !l.startsWith('    '));
  expect(entries.length).toBeGreaterThan(4);
  for (const l of entries) expect(l).toMatch(LINE);
  expect(logText).toContain('[app] Starting');
  expect(logText).toContain('[db] Database opened status=ok schema=1');
  expect(logText).toContain('[ai] Connection test service=llm result=ok');
  expect(logText).toContain('[renderer] Unexpected error in the window');
  expect(logText).toContain('request failed for [secret]');
  expect(logText).toContain('[diagnostics] Diagnostics exported');

  // Never the API key or the database key.
  expect(logText).not.toContain(KEY);
  expect(logText).not.toMatch(HEX_KEY);

  // The zip: logs + non-secret settings + app info + README, and nothing secret.
  const [zipName] = readdirSync(exports);
  const zip = readZip(readFileSync(join(exports, zipName)));
  const names = [...zip.keys()];
  expect(names.slice(0, 3)).toEqual(['README.txt', 'app-info.json', 'settings.json']);
  expect(names).toContain('logs/main.log');
  expect(names.every((n) => n.startsWith('logs/') || !n.includes('/'))).toBe(true);
  expect(names.some((n) => /secrets|\.db/.test(n))).toBe(false);

  const settings = JSON.parse(zip.get('settings.json')!.toString());
  expect(settings.ai.llm).toEqual({ baseUrl: server.baseUrl, model: 'qwen3-32b' });
  const info = JSON.parse(zip.get('app-info.json')!.toString());
  expect(info.keysSet).toEqual({ 'ai.asr.apiKey': false, 'ai.llm.apiKey': true });
  expect(info.database.status).toBe('ok');

  const everything = [...zip.values()].map((b) => b.toString('utf8')).join('\n');
  expect(everything).not.toContain(KEY);
  expect(everything).not.toMatch(HEX_KEY);
});
