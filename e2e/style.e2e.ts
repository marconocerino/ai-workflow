import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, closeApp, launchApp, tempProfile } from './launch';

// VAI-308: the cleanup style follows the app in front (fake helper's --front-app) and the rules.

const KEY = 'gsk-e2e-transcription-key';
const MODEL = 'whisper-large-v3-turbo';
const SPOKEN = 'um so the quarterly numbers uh look fine';
const CLEANED = 'So the quarterly numbers look fine.';
const LLM_MODEL = 'qwen3-32b';

interface Hooks {
  tray(): { state: string; menu: string[] };
  overlay(): { app: string | null };
  lastNotification(): { title: string; body: string } | null;
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let keys: string;
let server: FakeAiServer;

async function start(frontApp: string, cleanup: 'off' | 'light' | 'polished' = 'light') {
  const mode = 'pasted';
  const ai: { baseUrl?: string; timeoutMs?: number; retries?: number } = {};
  server = await startFakeAiServer(KEY, [MODEL]);
  server.transcribe.text = SPOKEN;
  profile = tempProfile();
  keys = join(profile, 'keys.txt');
  writeFileSync(keys, '');
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      version: 3,
      data: {
        dictation: { keepMicReadySeconds: 0, cleanup },
        ai: {
          asr: { baseUrl: ai.baseUrl ?? server.baseUrl, model: MODEL },
          llm: { baseUrl: server.baseUrl, model: LLM_MODEL },
          timeoutMs: ai.timeoutMs ?? 10_000,
          retries: ai.retries ?? 0,
        },
      },
    }),
  );
  ({ app, page } = await launchApp(
    profile,
    {
      AIW_KEY_LISTENER_SCRIPT: join(ROOT, 'e2e', 'fake-key-listener.mjs'),
      AIW_FAKE_KEYS_FILE: keys,
      AIW_PASTE_HELPER_SCRIPT: join(ROOT, 'e2e', 'fake-paste-helper.mjs'),
      AIW_FAKE_PASTE_LOG: pasteLog(),
      AIW_FAKE_PASTE_MODE: mode,
      AIW_FAKE_FRONT_APP: frontApp,
    },
    FAKE_MIC_ARGS,
  ));
  for (const name of ['ai.asr.apiKey', 'ai.llm.apiKey'] as const) {
    await page.evaluate(
      ([n, key]) =>
        (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.secrets.set(n, key),
      [name, KEY] as const,
    );
  }
  await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
  await expect.poll(() => hook((h) => h.tray().menu[0])).toBe('Dictation: Idle');
}

test.afterEach(async () => {
  await closeApp(app);
  await server?.close();
  rmSync(profile, { recursive: true, force: true });
});

const hook = <T>(fn: (h: Hooks) => T) =>
  app.evaluate((_e, src) => {
    const h = (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest;
    return new Function('h', `return (${src})(h)`)(h) as T;
  }, fn.toString());
const send = (...lines: string[]) => appendFileSync(keys, lines.map((l) => `${l}\n`).join(''));
const log = () => readFileSync(join(profile, 'logs', 'main.log'), 'utf8');
const pasteLog = () => join(profile, 'paste.log');
/** What the fake helper received: the text on stdin, and how many command-line arguments. */
const pasted = () =>
  existsSync(pasteLog())
    ? readFileSync(pasteLog(), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { text: string; args: number })
    : [];

/** The style part of the system prompt the fake LLM received, e.g. "professional"; null = Neutral. */
const sentStyle = (i = 0) =>
  /Style: (\w+)/.exec(server.chats[i]!.messages[0]!.content)?.[1] ?? null;
const chip = () =>
  app
    .windows()
    .find((w) => w.url().endsWith('/overlay'))!
    .getByTestId('target-app');

/** Hold Ctrl and check the chip while the bar is up, then let it paste. */
async function dictateAndReadChip(): Promise<string> {
  send('CTRL_DOWN clean');
  await expect.poll(async () => (await hook((h) => h.overlay())).app).not.toBeNull();
  const text = (await chip().textContent())!.trim();
  await page.waitForTimeout(1500);
  send('CTRL_UP');
  await expect.poll(pasted).toHaveLength(1);
  return text;
}

test('Outlook: Professional style, and the bar says "Outlook · Professional"', async () => {
  await start('OUTLOOK.EXE');
  server.chat.content = CLEANED;
  expect(await dictateAndReadChip()).toBe('Outlook · Professional');
  expect(sentStyle()).toBe('professional');
  expect(log()).toMatch(/Cleaned up level=light style=professional ms=\d+$/m);
  expect(log()).not.toMatch(/Outlook|OUTLOOK/); // the app name isn't logged either
});

test('Teams: Casual', async () => {
  await start('ms-teams.exe');
  server.chat.content = CLEANED;
  expect(await dictateAndReadChip()).toBe('Teams · Casual');
  expect(sentStyle()).toBe('casual');
});

test('an app without a rule uses Neutral: no style rules, no style in the bar', async () => {
  await start('Figma.exe');
  server.chat.content = CLEANED;
  expect(await dictateAndReadChip()).toBe('Figma');
  expect(sentStyle()).toBeNull();
});

test('cleanup off: no style shown or sent', async () => {
  await start('OUTLOOK.EXE', 'off');
  expect(await dictateAndReadChip()).toBe('Outlook');
  expect(server.chats).toHaveLength(0);
});

test('Settings → Style per app: a new rule is used for the next dictation', async () => {
  await start('Figma.exe');
  await page.goto('app://renderer/settings/style');
  await page.getByTestId('new-app').fill('Figma');
  await page.getByTestId('new-style').click();
  await page.getByRole('option', { name: 'Code' }).click();
  await page.getByTestId('add-rule').click();
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  await expect(page.getByTestId('style-rule').last()).toContainText('Figma');

  server.chat.content = CLEANED;
  expect(await dictateAndReadChip()).toBe('Figma · Code');
  expect(sentStyle()).toBe('code');
});
