import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, launchApp, tempProfile } from './launch';

// VAI-303: hold Ctrl → fake mic → local OpenAI-compatible fake server → text on the clipboard.

const KEY = 'gsk-e2e-transcription-key';
const MODEL = 'whisper-large-v3-turbo';
const SPOKEN = 'The quarterly numbers look fine';

interface Hooks {
  tray(): { state: string; menu: string[] };
  lastNotification(): { title: string; body: string } | null;
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let keys: string;
let server: FakeAiServer;

async function start(ai: { baseUrl?: string; timeoutMs?: number; retries?: number } = {}) {
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
        dictation: { keepMicReadySeconds: 0 },
        ai: {
          asr: { baseUrl: ai.baseUrl ?? server.baseUrl, model: MODEL },
          llm: { baseUrl: '', model: '' },
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
    },
    FAKE_MIC_ARGS,
  ));
  await page.evaluate(
    (key) =>
      (window as unknown as { aiWorkflow: AiWorkflowApi }).aiWorkflow.secrets.set(
        'ai.asr.apiKey',
        key,
      ),
    KEY,
  );
  await app.evaluate(({ clipboard }) => clipboard.writeText('before'));
  await expect.poll(() => hook((h) => h.tray().menu[0])).toBe('Dictation: Idle');
}

test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  await server?.close();
  rmSync(profile, { recursive: true, force: true });
});

const hook = <T>(fn: (h: Hooks) => T) =>
  app.evaluate((_e, src) => {
    const h = (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest;
    return new Function('h', `return (${src})(h)`)(h) as T;
  }, fn.toString());
const tray = () => hook((h) => h.tray().state);
const notification = () => hook((h) => h.lastNotification());
const clipboardText = () => app.evaluate(({ clipboard }) => clipboard.readText());
const send = (...lines: string[]) => appendFileSync(keys, lines.map((l) => `${l}\n`).join(''));
const log = () => readFileSync(join(profile, 'logs', 'main.log'), 'utf8');

/** The fake mic beeps once a second: shorter recordings can be all silence (not sent). */
async function dictate(ms: number) {
  expect(ms).toBeGreaterThanOrEqual(1200);
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  await page.waitForTimeout(ms);
  send('CTRL_UP');
}

test('dictation is transcribed by the configured server and lands on the clipboard', async () => {
  await start();
  server.transcribe.delayMs = 1000; // long enough to see "Transcribing" in the tray
  await dictate(1500);
  await expect.poll(tray).toBe('transcribing');
  expect((await hook((h) => h.tray())).menu[0]).toBe('Dictation: Transcribing');

  await expect.poll(clipboardText).toBe(SPOKEN);
  await expect.poll(tray).toBe('idle');
  expect(await notification()).toEqual({
    title: 'Dictation ready',
    body: expect.stringMatching(/^Text copied\. Press (Ctrl\+V|⌘V) to paste it\.$/),
  });

  // One request: a WAV of the recording, the configured model, the saved key.
  expect(server.transcriptions).toHaveLength(1);
  const sent = server.transcriptions[0]!;
  expect(sent.model).toBe(MODEL);
  expect(sent.contentType).toMatch(/^multipart\/form-data; boundary=/);
  expect(sent.wavBytes).toBeGreaterThan(44 + 1.2 * 32_000);
  expect(sent.wavBytes).toBeLessThan(44 + 2.2 * 32_000);
  expect(server.authHeaders).toEqual([`Bearer ${KEY}`]);

  // The log has timing and size, never the text, audio or key.
  expect(log()).toMatch(
    /\[dictation\] Transcribed durationMs=\d+ bytes=\d+ latencyMs=\d+ attempts=1$/m,
  );
  expect(log()).not.toContain('quarterly');
  expect(log()).not.toContain(KEY);
});

test('timeout: clear message, clipboard untouched, back to idle', async () => {
  await start({ timeoutMs: 1000, retries: 2 });
  server.transcribe.delayMs = 4000;
  await dictate(1500);
  await expect
    .poll(notification, { timeout: 8_000 })
    .toEqual({ title: 'Dictation failed', body: expect.stringMatching(/did not answer in time/) });
  expect(await clipboardText()).toBe('before');
  await expect.poll(tray).toBe('idle');
  expect(server.transcriptions).toHaveLength(1); // a timeout is not retried
  expect(log()).toMatch(/\[dictation\] Transcription failed code=timeout attempts=1$/m);
});

test('server error: retried, then a clear message', async () => {
  await start({ retries: 1 });
  server.transcribe.status = 500;
  await dictate(1500);
  await expect
    .poll(notification, { timeout: 8_000 })
    .toEqual({ title: 'Dictation failed', body: expect.stringMatching(/had an error/) });
  expect(server.transcriptions).toHaveLength(2);
  expect(await clipboardText()).toBe('before');
  expect(log()).toMatch(/Transcription failed code=server-error status=500 attempts=2$/m);
});

test('no server configured: nothing is sent, the user is told where to set it up', async () => {
  await start({ baseUrl: '' });
  await dictate(1500);
  await expect
    .poll(notification)
    .toEqual({ title: 'Dictation failed', body: expect.stringMatching(/Settings → AI servers/) });
  expect(server.transcriptions).toHaveLength(0);
});
