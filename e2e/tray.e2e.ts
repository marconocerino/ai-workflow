import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { rmSync } from 'node:fs';
import { launchApp, tempProfile } from './launch';

interface TrayInfo {
  state: string;
  tooltip: string;
  menu: string[];
}
interface Hooks {
  tray(): TrayInfo;
  clickTray(label: string): void;
  setDictationState(state: string): void;
}

let app: ElectronApplication;
let page: Page;
let profile: string;

test.beforeEach(async () => {
  profile = tempProfile();
  ({ app, page } = await launchApp(profile));
});
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  rmSync(profile, { recursive: true, force: true });
});

const tray = () =>
  app.evaluate(() => (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest.tray());
const clickTray = (label: string) =>
  app.evaluate(
    (_e, l) => (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest.clickTray(l),
    label,
  );
const setState = (state: string) =>
  app.evaluate(
    (_e, s) => (globalThis as unknown as { __aiwTest: Hooks }).__aiwTest.setDictationState(s),
    state,
  );
const windowVisible = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible()));

test('tray shows idle, listening and recording', async () => {
  expect(await tray()).toEqual({
    state: 'idle',
    tooltip: 'AI Workflow — Idle',
    menu: [
      'Dictation: Idle', // the toggle shortcut works here (macOS dev / no helper)
      '---',
      'Open AI Workflow',
      'Settings',
      '---',
      'Quit AI Workflow',
    ],
  });
  await setState('listening');
  expect((await tray()).tooltip).toBe('AI Workflow — Listening');
  await setState('recording');
  expect((await tray()).tooltip).toBe('AI Workflow — Recording');
  await setState('idle');
  expect((await tray()).tooltip).toBe('AI Workflow — Idle');
});

test('closing the window keeps the app running in the tray', async () => {
  await page.locator('h1').waitFor();
  expect(await windowVisible()).toEqual([true]);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(windowVisible).toEqual([false]); // hidden, not destroyed
  expect((await tray()).state).toBe('idle'); // app still running

  await clickTray('Open AI Workflow');
  await expect.poll(windowVisible).toEqual([true]);
  await expect(page.getByRole('heading', { name: 'AI Workflow', exact: true })).toBeVisible();

  await clickTray('Settings');
  await expect(page).toHaveURL('app://renderer/settings/dictation');
});

test('tray "Quit" ends the app', async () => {
  const closed = new Promise<void>((resolve) => app.once('close', () => resolve()));
  await clickTray('Quit AI Workflow');
  await closed;
});

test('start at sign-in: only in the installed app (disabled with a note here)', async () => {
  await page.goto('app://renderer/settings/dictation');
  const toggle = page.getByTestId('open-at-login').getByRole('switch');
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAccessibleName('Open AI Workflow when I sign in');
  await expect(page.getByTestId('open-at-login-note')).toHaveText(
    'Available in the installed app, not when running from source.',
  );
  // The main process refuses too, whatever the page sends.
  const result = await page.evaluate(() =>
    (
      window as unknown as { aiWorkflow: { startup: { set(v: boolean): Promise<unknown> } } }
    ).aiWorkflow.startup
      .set(true)
      .then(
        () => 'set',
        (e: Error) => e.message,
      ),
  );
  expect(result).toContain('only available in the installed app');
});
