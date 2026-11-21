import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, closeApp, launchApp, tempProfile } from './launch';

// VAI-309: custom vocabulary from Settings reaches speech-to-text (prompt) and cleanup.

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

const cleanupPromptSent = (i: number) => server.chats[i]!.messages[0]!.content;

test('words added in Settings (Enter, comma, pasted list) are sent as hints; removed ones are not', async () => {
  await start('light');
  server.chat.content = CLEANED;
  await page.goto('app://renderer/settings/vocabulary');
  const input = page.getByTestId('vocab-input');
  await input.fill('Siobhan');
  await input.press('Enter');
  await input.fill('AIWF');
  await input.press(',');
  // Paste a list (a real paste event with clipboard data).
  await input.focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text', 'Kubernetes\nkubectl; Grafana');
    document
      .querySelector('[data-testid="vocab-input"]')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
  });
  await expect(page.getByTestId('vocab-word')).toHaveCount(5);
  await expect(page.getByTestId('vocab-count')).toContainText('5 of 200');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);

  await dictate(1500);
  await expect.poll(pasted).toHaveLength(1);
  expect(server.transcriptions[0]!.prompt).toBe('Siobhan, AIWF, Kubernetes, kubectl, Grafana');
  expect(cleanupPromptSent(0)).toContain(
    'spell it exactly like this: Siobhan, AIWF, Kubernetes, kubectl, Grafana.',
  );
  expect(log()).not.toMatch(/Siobhan|Grafana/); // words are never logged

  // Remove one with ✕ and the last one with Backspace twice (focus chip, then delete).
  await page.getByRole('button', { name: 'Remove AIWF' }).click();
  await input.click();
  await page.keyboard.press('Backspace'); // empty input: focuses the last chip
  await page.keyboard.press('Backspace'); // removes it
  await expect(page.getByTestId('vocab-word')).toHaveCount(3);
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);

  await dictate(1500);
  await expect.poll(pasted).toHaveLength(2);
  expect(server.transcriptions[1]!.prompt).toBe('Siobhan, Kubernetes, kubectl');
  expect(cleanupPromptSent(1)).not.toContain('Grafana');
});

test('no vocabulary: no prompt hint is sent at all', async () => {
  await start('light');
  server.chat.content = CLEANED;
  await dictate(1500);
  await expect.poll(pasted).toHaveLength(1);
  expect(server.transcriptions[0]!.prompt).toBeNull();
  expect(cleanupPromptSent(0)).not.toContain('Vocabulary:');
});
