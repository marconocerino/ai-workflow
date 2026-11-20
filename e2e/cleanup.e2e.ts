import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, closeApp, launchApp, tempProfile } from './launch';

// VAI-307: hold Ctrl → fake mic → fake speech server → fake LLM cleanup → fake paste helper.

const KEY = 'gsk-e2e-transcription-key';
const MODEL = 'whisper-large-v3-turbo';
const SPOKEN = 'um so the quarterly numbers uh look fine';
const CLEANED = 'So the quarterly numbers look fine.';
const LLM_MODEL = 'qwen3-32b';

interface Hooks {
  tray(): { state: string; menu: string[] };
  lastNotification(): { title: string; body: string } | null;
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let keys: string;
let server: FakeAiServer;

async function start(cleanup: 'off' | 'light' | 'polished' = 'light') {
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
const tray = () => hook((h) => h.tray().state);
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

/** The fake mic beeps once a second: shorter recordings can be all silence (not sent). */
async function dictate(ms: number) {
  expect(ms).toBeGreaterThanOrEqual(1200);
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  await page.waitForTimeout(ms);
  send('CTRL_UP');
}

test('Light: the cleaned text is pasted; the LLM got the transcript and the Light rules', async () => {
  await start('light');
  server.chat.content = CLEANED;
  await dictate(1500);
  await expect.poll(pasted).toEqual([{ text: CLEANED, args: 0 }]);
  expect(server.chats).toHaveLength(1);
  const [system, user] = server.chats[0]!.messages;
  expect(server.chats[0]!.model).toBe(LLM_MODEL);
  expect(system!.content).toContain('Light cleanup');
  expect(user!.content).toBe(`<transcript>\n${SPOKEN}\n</transcript>`);
  expect(log()).toMatch(/\[dictation\] Cleaned up level=light ms=\d+$/m);
  expect(log()).not.toContain('quarterly');
});

test('Off: no LLM request, the text is pasted as heard', async () => {
  await start('off');
  await dictate(1500);
  await expect.poll(pasted).toEqual([{ text: SPOKEN, args: 0 }]);
  expect(server.chats).toHaveLength(0);
});

test('cleanup slower than 3 s: the raw text is pasted, without waiting longer', async () => {
  await start('light');
  server.chat.content = CLEANED;
  server.chat.delayMs = 6000;
  await dictate(1500);
  const released = Date.now();
  await expect.poll(pasted, { timeout: 8000 }).toEqual([{ text: SPOKEN, args: 0 }]);
  expect(Date.now() - released).toBeLessThan(5500);
  expect(log()).toMatch(/Cleanup skipped level=light reason=timeout ms=\d+$/m);
});

test('an LLM that adds facts is not trusted: the raw text is pasted', async () => {
  await start('light');
  server.chat.content = 'So the quarterly numbers look fine, up 12% per Sarah.'; // same length
  await dictate(1500);
  await expect.poll(pasted).toEqual([{ text: SPOKEN, args: 0 }]);
  expect(log()).toMatch(/Cleanup skipped level=light reason=added-words/);
});

test('Settings → AI cleanup: choosing Polished is saved and used', async () => {
  await start('light');
  await page.goto('app://renderer/settings/ai-cleanup');
  await page.locator('[data-option="polished"]').click();
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  server.chat.content = CLEANED;
  await dictate(1500);
  await expect.poll(pasted).toEqual([{ text: CLEANED, args: 0 }]);
  expect(server.chats[0]!.messages[0]!.content).toContain('Polished cleanup');
});
