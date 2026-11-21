import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiWorkflowApi } from '../shared/ipc-contract';
import { type FakeAiServer, startFakeAiServer } from './fake-ai-server';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, closeApp, launchApp, tempProfile } from './launch';

// VAI-305: the floating dictation bar while recording and transcribing (fake mic, keys, server, helper).

const KEY = 'gsk-e2e-transcription-key';
const MODEL = 'whisper-large-v3-turbo';
const SPOKEN = 'The quarterly numbers look fine';

interface Hooks {
  tray(): { state: string; menu: string[] };
  overlay(): {
    phase: string;
    app: string | null;
    showMs: number | null;
    peakLevel: number;
    visible: boolean;
    focusable: boolean;
    focused: boolean;
  };
  focusedWindowId(): number | null;
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
      AIW_FAKE_FRONT_APP: 'OUTLOOK.EXE',
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
const send = (...lines: string[]) => appendFileSync(keys, lines.map((l) => `${l}\n`).join(''));
const pasteLog = () => join(profile, 'paste.log');
/** What the fake helper received: the text on stdin, and how many command-line arguments. */
const pasted = () =>
  existsSync(pasteLog())
    ? readFileSync(pasteLog(), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { text: string; args: number })
    : [];

const overlay = () => hook((h) => h.overlay());
/** The overlay window's page (hidden windows are still reachable). */
const overlayPage = () => app.windows().find((w) => w.url().endsWith('/overlay'))!;

test('the bar appears within 100 ms without taking focus, shows level and app, then goes', async () => {
  await start('pasted');
  server.transcribe.delayMs = 1000; // time to see "Transcribing…"
  const focusedBefore = await hook((h) => h.focusedWindowId());
  expect(await overlay()).toMatchObject({ phase: 'hidden', visible: false, focusable: false });

  send('CTRL_DOWN clean');
  await expect.poll(async () => (await overlay()).visible).toBe(true);
  const shown = await overlay();
  expect(shown.phase).toBe('recording');
  expect(shown.showMs).not.toBeNull();
  expect(shown.showMs!).toBeLessThan(100);
  expect(shown.focused).toBe(false);
  expect(await hook((h) => h.focusedWindowId())).toBe(focusedBefore); // focus never moved

  const bar = overlayPage().locator('aiw-dictation-bar');
  await expect(bar).toContainText('Listening…');
  // App name (never a title), plus its cleanup style (VAI-308).
  await expect(bar.getByTestId('target-app')).toHaveText('Outlook · Email');
  // The fake mic beeps once a second (short beeps, so read the loudest level sent so far).
  await expect
    .poll(async () => (await overlay()).peakLevel, { timeout: 3000 })
    .toBeGreaterThan(0.1);
  await expect(bar.getByTestId('level')).toHaveAttribute('data-level', /^\d\.\d\d$/);
  const a11y = await new AxeBuilder({ page: overlayPage() })
    .setLegacyMode(true) // runs inside the page; Electron can't open helper pages
    .include('aiw-dictation-bar')
    .analyze();
  expect(a11y.violations).toEqual([]);

  await page.waitForTimeout(800);
  send('CTRL_UP');
  await expect(bar).toContainText('Transcribing…');
  expect((await overlay()).visible).toBe(true); // no flicker through "idle"
  await expect.poll(pasted).toEqual([{ text: SPOKEN, args: 0 }]);
  await expect.poll(async () => (await overlay()).visible).toBe(false);
  expect((await overlay()).phase).toBe('hidden');
  // The overlay never took focus. (Not "focus unchanged" here: on a machine in use another app
  // may take focus during the ~3 s; the check right after showing the bar covers that.)
  expect((await overlay()).focused).toBe(false);
});

test('a Ctrl shortcut after recording started cancels: the bar hides at once', async () => {
  await start('pasted');
  send('CTRL_DOWN clean');
  await expect.poll(async () => (await overlay()).visible).toBe(true);
  await page.waitForTimeout(300);
  send('OTHER', 'CTRL_UP'); // e.g. Ctrl+C after all
  await expect.poll(async () => (await overlay()).visible).toBe(false);
  expect(server.transcriptions).toHaveLength(0);
});
