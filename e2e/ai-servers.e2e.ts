import { type Page, expect, test } from '@playwright/test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { launchApp, tempProfile } from './launch';

const GOOD_KEY = 'sk-e2e-good-key-9c1d';
let server: FakeAiServer;
let profile: string;

test.beforeEach(async () => {
  server = await startFakeAiServer(GOOD_KEY, ['qwen3-32b', 'qwen3-asr']);
  profile = tempProfile();
});
test.afterEach(async () => {
  await server.close();
  rmSync(profile, { recursive: true, force: true });
});

async function openSettings(page: Page) {
  await page.getByTestId('open-settings').click();
  await expect(page.getByRole('heading', { name: 'AI servers' })).toBeVisible();
  expect(page.url()).toBe('app://renderer/settings/ai-servers');
}

async function fill(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.blur();
}

test('configure the LLM server, save a key and test the connection', async () => {
  let { app, page } = await launchApp(profile);
  await openSettings(page);

  await fill(page, 'llm-base-url', server.baseUrl);
  await fill(page, 'llm-model', 'qwen3-32b');
  await expect(page.getByTestId('save-status')).toContainText('Changes save automatically');

  // No key yet → server refuses.
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(/This server needs an API key/);

  // Wrong key → rejected.
  await page.getByTestId('llm-key').fill('sk-wrong');
  await page.getByTestId('llm-save-key').click();
  await expect(page.getByTestId('llm-key-status')).toHaveText('Saved');
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(/rejected the API key/);

  // Replace with the right key → connected.
  await page.getByTestId('llm-replace-key').click();
  await page.getByTestId('llm-key').fill(GOOD_KEY);
  await page.getByTestId('llm-save-key').click();
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(/✓\s*Connected \(\d+ ms\)/);

  // Model the server doesn't have.
  await fill(page, 'llm-model', 'qwen3-999b');
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(
    /model "qwen3-999b" isn't available\. Available: qwen3-32b, qwen3-asr/,
  );

  // The key only ever went to the configured server, as a Bearer header.
  expect(server.authHeaders.at(-1)).toBe(`Bearer ${GOOD_KEY}`);
  await app.close();

  // Nothing secret in plain text on disk; settings persisted.
  expect(readFileSync(join(profile, 'secrets.json'), 'utf8')).not.toContain(GOOD_KEY);
  const saved = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));
  expect(saved.data.ai.llm).toEqual({ baseUrl: server.baseUrl, model: 'qwen3-999b' });

  // After a restart: values are back, the key is "Saved" but never shown.
  ({ app, page } = await launchApp(profile));
  await openSettings(page);
  await expect(page.getByTestId('llm-base-url')).toHaveValue(server.baseUrl);
  await expect(page.getByTestId('llm-key-status')).toHaveText('Saved');
  await expect(page.getByTestId('llm-key')).toHaveCount(0);
  expect(await page.content()).not.toContain(GOOD_KEY);

  // Remove the key.
  await page.getByTestId('llm-remove-key').click();
  await expect(page.getByTestId('llm-key-status')).toHaveText('Not set');
  await app.close();
});

test('invalid values show an error and are not saved', async () => {
  const { app, page } = await launchApp(profile);
  await openSettings(page);

  await fill(page, 'llm-base-url', 'ftp://files.company');
  await expect(page.getByTestId('llm-base-url-error')).toContainText('http:// or https://');

  await fill(page, 'retries', '50');
  await expect(page.getByText('Must be at most 10.')).toBeVisible();
  await app.close();

  // Nothing was written.
  expect(() => readFileSync(join(profile, 'settings.json'), 'utf8')).toThrow();
});

test('unreachable and unconfigured servers give clear messages', async () => {
  const { app, page } = await launchApp(profile);
  await openSettings(page);

  await page.getByTestId('asr-test').click();
  await expect(page.getByTestId('asr-test-result')).toHaveText(/Enter the server URL first/);

  await fill(page, 'asr-base-url', 'http://127.0.0.1:1/v1');
  await page.getByTestId('asr-test').click();
  await expect(page.getByTestId('asr-test-result')).toHaveText(/Could not reach the server/);
  await app.close();
});

test('redirects are refused, so the key never reaches another host', async () => {
  const { createServer } = await import('node:http');
  const redirector = createServer((_req, res) => {
    res.writeHead(302, { Location: `${server.baseUrl}/models` });
    res.end();
  });
  await new Promise<void>((resolve) => redirector.listen(0, '127.0.0.1', resolve));
  const port = (redirector.address() as { port: number }).port;

  const { app, page } = await launchApp(profile);
  await openSettings(page);
  await fill(page, 'llm-base-url', `http://127.0.0.1:${port}/v1`);
  await page.getByTestId('llm-key').fill(GOOD_KEY);
  await page.getByTestId('llm-save-key').click();
  await page.getByTestId('llm-test').click();
  await expect(page.getByTestId('llm-test-result')).toHaveText(/Could not reach the server/);
  expect(server.authHeaders).toEqual([]); // the redirect target never got a request
  await app.close();
  await new Promise((resolve) => redirector.close(resolve));
});
