import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAKE_MIC_ARGS } from './fake-mic';
import { ROOT, launchApp, tempProfile } from './launch';

interface Hooks {
  tray(): { state: string; menu: string[] };
  audio(): { state: string; usingDefaultInstead: boolean; problem?: string };
  lastRecording(): { durationMs: number; peak: number } | null;
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let keys: string;

async function start(dictation: Record<string, unknown> = {}) {
  profile = tempProfile();
  keys = join(profile, 'keys.txt');
  writeFileSync(keys, '');
  if (Object.keys(dictation).length) {
    writeFileSync(
      join(profile, 'settings.json'),
      JSON.stringify({ version: 3, data: { dictation } }),
    );
  }
  ({ app, page } = await launchApp(
    profile,
    {
      AIW_KEY_LISTENER_SCRIPT: join(ROOT, 'e2e', 'fake-key-listener.mjs'),
      AIW_FAKE_KEYS_FILE: keys,
    },
    FAKE_MIC_ARGS,
  ));
  await expect.poll(() => hook((h) => h.tray().menu[0])).toBe('Dictation: Idle');
}
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  rmSync(profile, { recursive: true, force: true });
});

const hook = <T>(fn: (h: Hooks) => T) =>
  app.evaluate((_e, src) => {
    const h = (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest;
    return new Function('h', `return (${src})(h)`)(h) as T;
  }, fn.toString());
const tray = () => hook((h) => h.tray().state);
const mic = () => hook((h) => h.audio());
const last = () => hook((h) => h.lastRecording());
const send = (...lines: string[]) => appendFileSync(keys, lines.map((l) => `${l}\n`).join(''));
const log = () => readFileSync(join(profile, 'logs', 'main.log'), 'utf8');

test('hold Ctrl records the microphone; release delivers audio with sound in it', async () => {
  await start({ keepMicReadySeconds: 0 });
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  await page.waitForTimeout(1500);
  send('CTRL_UP');
  await expect.poll(last).not.toBeNull();
  const rec = (await last())!;
  expect(rec.durationMs).toBeGreaterThan(1200);
  expect(rec.durationMs).toBeLessThan(2000);
  expect(rec.peak).toBeGreaterThan(0.1); // the fake mic's beeps
  // Keep-ready off: mic closed right away.
  expect(await tray()).toBe('idle');
  expect((await mic()).state).toBe('closed');
  // Audio never in the log — only length and level.
  expect(log()).toMatch(/\[audio\] Recording finished durationMs=\d+ peakDb=-?\d+$/m);
  expect(log()).toMatch(/\[audio\] Microphone opened openMs=\d+ fellBack=false/);
});

test('a Ctrl shortcut opens the mic early but records nothing and closes it again', async () => {
  await start({ keepMicReadySeconds: 0 });
  send('CTRL_DOWN clean', 'OTHER');
  await page.waitForTimeout(400);
  send('CTRL_UP');
  await expect.poll(async () => (await mic()).state).toBe('closed');
  expect(await last()).toBeNull();
});

test('keep mic ready: "Listening" for the chosen time, then the mic closes', async () => {
  await start({ keepMicReadySeconds: 5 });
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  await page.waitForTimeout(500);
  send('CTRL_UP');
  await expect.poll(tray).toBe('listening');
  expect((await mic()).state).toBe('ready');
  // Dictating again while ready includes the pre-roll (no clipped first word).
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  await page.waitForTimeout(300);
  send('CTRL_UP');
  await expect.poll(async () => (await last())?.durationMs ?? 0).toBeGreaterThan(600);
  // Unused: after 5 s the mic closes and the buffer is dropped.
  await expect.poll(tray, { timeout: 8_000 }).toBe('idle');
  expect((await mic()).state).toBe('closed');
});

test('Settings: device list, choosing a device, keep-ready time; missing device falls back', async () => {
  await start({ micDeviceId: 'unplugged-headset', keepMicReadySeconds: 10 });
  // A missing device: recording still works, from System default.
  send('CTRL_DOWN clean');
  await expect.poll(tray).toBe('recording');
  send('CTRL_UP');
  await expect.poll(async () => (await mic()).usingDefaultInstead).toBe(true);
  expect(log()).toContain('Chosen microphone not found; using System default');

  await page.goto('app://renderer/settings/dictation');
  await expect(page.getByTestId('mic-missing')).toBeVisible();
  await page.getByTestId('mic-device').click();
  // System default, the two fake microphones, and the saved-but-missing one.
  await expect(page.getByRole('option')).toHaveText([
    'System default',
    'Fake Audio Input 1',
    'Fake Audio Input 2',
    'Not connected',
  ]);
  await page.getByRole('option', { name: 'Fake Audio Input 2' }).click();
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  await expect(page.getByTestId('mic-missing')).toHaveCount(0);
  const saved = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).data.dictation;
  expect(saved.micDeviceId).toMatch(/^[0-9a-f]{12}/);

  await page.getByTestId('keep-mic-ready').click();
  await page.getByRole('option', { name: '30 seconds' }).click();
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  expect(
    JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).data.dictation
      .keepMicReadySeconds,
  ).toBe(30);

  const axe = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test('only the hidden audio window may use the mic, and only for audio', async () => {
  await start();
  await expect.poll(() => app.windows().some((w) => w.url().endsWith('/audio-engine'))).toBe(true);
  const audioPage = app.windows().find((w) => w.url().endsWith('/audio-engine'))!;
  const tryMedia = (p: Page, constraints: MediaStreamConstraints) =>
    p.evaluate(
      (c) =>
        navigator.mediaDevices.getUserMedia(c).then(
          (s) => {
            s.getTracks().forEach((t) => t.stop());
            return 'allowed';
          },
          (e: Error) => e.name,
        ),
      constraints,
    );
  expect(await tryMedia(audioPage, { video: true })).toBe('NotAllowedError');
  expect(await tryMedia(audioPage, { audio: true, video: true })).toBe('NotAllowedError');
  expect(await tryMedia(page, { audio: true })).toBe('NotAllowedError');
  // The main window can't pose as the audio window either.
  const forged = await page.evaluate(() =>
    (
      window as unknown as { aiWorkflow: { audioEngine: { event(e: unknown): Promise<void> } } }
    ).aiWorkflow.audioEngine
      .event({ type: 'error', reason: 'blocked' })
      .then(
        () => 'accepted',
        (e: Error) => e.message,
      ),
  );
  expect(forged).toContain('Only the audio window');
  expect((await mic()).problem).toBeUndefined();
});
