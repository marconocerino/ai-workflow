import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, closeApp, launchApp, tempProfile } from './launch';

// VAI-304: hold Ctrl → fake mic → fake speech server → fake aiw-paste helper (paste at cursor).

const KEY = 'gsk-e2e-transcription-key';
const MODEL = 'whisper-large-v3-turbo';
/** The app names the paste key of the OS it runs on. */
const PASTE_KEY = process.platform === 'darwin' ? '⌘V' : 'Ctrl+V';
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

async function start(
  mode: 'pasted' | 'elevated' | 'crash' | 'no-permission',
  env: Record<string, string> = {},
) {
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
      AIW_PASTE_HELPER_SCRIPT: join(ROOT, 'e2e', 'fake-paste-helper.mjs'),
      AIW_FAKE_PASTE_LOG: pasteLog(),
      AIW_FAKE_PASTE_MODE: mode,
      ...env,
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
const notification = () => hook((h) => h.lastNotification());
const clipboardText = () => app.evaluate(({ clipboard }) => clipboard.readText());
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

test('the text is pasted at the cursor: no notification, clipboard untouched', async () => {
  await start('pasted');
  await dictate(1500);
  await expect.poll(pasted).toEqual([{ text: SPOKEN, args: 0 }]); // stdin, not the command line
  await expect.poll(tray).toBe('idle');
  expect(await notification()).toBeNull();
  expect(await clipboardText()).toBe('before');
  expect(log()).toMatch(/\[dictation\] Pasted clipboard=restored ms=\d+$/m);
  expect(log()).not.toContain('quarterly');
});

test('admin window: no paste, a notice says why (the helper leaves the text copied)', async () => {
  await start('elevated');
  await dictate(1500);
  await expect.poll(notification).toEqual({
    title: "Couldn't paste",
    body: `Can't type into an app running as administrator. Text copied — press ${PASTE_KEY}.`,
  });
  expect(log()).toMatch(/\[dictation\] Paste failed reason=elevated ms=\d+$/m);
});

test('helper crashes: the text stays on the clipboard with a notice', async () => {
  await start('crash');
  await dictate(1500);
  await expect.poll(clipboardText).toBe(SPOKEN);
  expect(await notification()).toEqual({
    title: "Couldn't paste",
    body: `Couldn't paste here. Text copied — press ${PASTE_KEY}.`,
  });
  await expect.poll(tray).toBe('idle');
});

test('macOS without Accessibility: Settings explains it; text copied with a notice', async () => {
  await start('no-permission', { AIW_FAKE_ACCESSIBILITY: '0' });
  await page.goto('app://renderer/settings/dictation');
  const note = page.getByTestId('permission-accessibility');
  await expect(note).toContainText('Accessibility');
  await expect(note.getByRole('button', { name: 'Open Accessibility settings' })).toBeVisible();

  await dictate(1500);
  await expect.poll(notification).toEqual({
    title: "Couldn't paste",
    body: expect.stringMatching(
      /^To paste automatically, allow Accessibility in System Settings \(see Settings → Dictation\)\. Text copied — press (⌘V|Ctrl\+V)\.$/,
    ),
  });
  expect(pasted()).toEqual([{ text: SPOKEN, args: 0 }]);
});
