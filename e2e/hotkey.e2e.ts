import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchApp, tempProfile } from './launch';

interface Hooks {
  tray(): { state: string; menu: string[] };
  hotkey(): { holdCtrl: string; toggleActive: boolean; mode: string };
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let keys: string;

test.beforeEach(async () => {
  profile = tempProfile();
  keys = join(profile, 'keys.txt');
  writeFileSync(keys, '');
  ({ app, page } = await launchApp(profile, {
    AIW_KEY_LISTENER_SCRIPT: join(ROOT, 'e2e', 'fake-key-listener.mjs'),
    AIW_FAKE_KEYS_FILE: keys,
  }));
});
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  rmSync(profile, { recursive: true, force: true });
});

const hooks = <T>(fn: (h: Hooks) => T) =>
  app.evaluate((_e, src) => {
    const h = (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest;
    return new Function('h', `return (${src})(h)`)(h) as T;
  }, fn.toString());
const trayState = () => hooks((h) => h.tray().state);
const hotkeyStatus = () => hooks((h) => h.hotkey());
const send = (...lines: string[]) => appendFileSync(keys, lines.map((l) => `${l}\n`).join(''));

test('hold Ctrl alone starts dictation, release stops; Ctrl shortcuts do not', async () => {
  await expect.poll(hotkeyStatus).toMatchObject({ holdCtrl: 'ready', toggleActive: false });
  await expect.poll(() => hooks((h) => h.tray().menu[0])).toBe('Dictation: Idle');

  send('CTRL_DOWN clean');
  await expect.poll(trayState).toBe('recording');
  expect(await hooks((h) => h.tray().menu[0])).toBe('Dictation: Recording');
  send('CTRL_UP');
  // The mic stays ready for 10 s by default (VAI-302): "Listening", not Idle.
  await expect.poll(trayState).toBe('listening');

  // Ctrl+C: another key within 120 ms → never starts, however long Ctrl stays down.
  send('CTRL_DOWN clean', 'OTHER');
  await page.waitForTimeout(400);
  expect(await trayState()).not.toBe('recording'); // still "Listening" from before, never recording
  send('CTRL_UP');

  // Settings shows it's ready.
  await page.goto('app://renderer/settings/dictation');
  await expect(page.getByTestId('dictation-status')).toContainText('Ready');
  await expect(page.getByTestId('dictation-status')).toContainText(/Hold\s*Ctrl/);

  // The log has start/stop but never key events.
  await app.close();
  const log = readFileSync(join(profile, 'logs', 'main.log'), 'utf8');
  expect(log).toContain('[hotkey] Dictation started source=hold');
  expect(log).toContain('[hotkey] Dictation stopped');
  expect(log).not.toMatch(/CTRL_DOWN|CTRL_UP|OTHER/);
});

test('if the keyboard hook keeps failing, the toggle shortcut takes over', async () => {
  await expect.poll(hotkeyStatus).toMatchObject({ holdCtrl: 'ready' });
  send('EXIT 1'); // every restart replays this → crashes repeatedly
  const log = () => readFileSync(join(profile, 'logs', 'main.log'), 'utf8');
  await expect
    .poll(log, { timeout: 10_000 })
    .toContain('keeps failing; using the toggle shortcut instead');
  expect(await hotkeyStatus()).toMatchObject({ holdCtrl: 'unavailable', toggleActive: true });
  await page.goto('app://renderer/settings/dictation');
  await expect(page.getByTestId('dictation-status')).toContainText('Ready (Hold Ctrl unavailable)');
  await expect(page.getByTestId('hold-unavailable')).toContainText('toggle shortcut below is used');
});

test('change the toggle shortcut in Settings', async () => {
  await page.goto('app://renderer/settings/dictation');
  await page.getByTestId('change-shortcut').click();
  await expect(page.getByTestId('shortcut-capture')).toBeFocused();
  await page.keyboard.press('Control+Alt+KeyK');
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/);
  await expect(page.getByTestId('toggle-shortcut')).toContainText('Ctrl plus Alt plus K');
  const settings = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));
  expect(settings.data.dictation.toggleShortcut).toEqual(['Ctrl', 'Alt', 'K']);

  // Switching to Toggle mode turns the watcher off and the shortcut on.
  await page.locator('[data-option="toggle"]').click();
  await expect.poll(hotkeyStatus).toMatchObject({ mode: 'toggle', toggleActive: true });
  await expect(page.getByTestId('dictation-status')).toContainText(/Press.*Alt.*K/);
});
