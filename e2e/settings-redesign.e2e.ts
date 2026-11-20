import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchApp, tempProfile } from './launch';

const V1 = readFileSync(join(ROOT, 'electron/settings/fixtures/settings-v1.json'), 'utf8');
const KEY = 'sk-from-an-earlier-build-1234';

let app: ElectronApplication | undefined;
let page: Page;
let profile: string;

test.beforeEach(() => {
  profile = tempProfile();
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  chmodSync(profile, 0o700);
  rmSync(profile, { recursive: true, force: true });
});

async function start() {
  ({ app, page } = await launchApp(profile));
}
async function restart() {
  await app!.close();
  await start();
}
const settingsFile = () => JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));

const SECTIONS: [string, string][] = [
  ['nav-dictation', 'Dictation'],
  ['nav-transcription', 'Transcription'],
  ['nav-ai-servers', 'AI servers'],
  ['nav-ai-cleanup', 'AI cleanup'],
  ['nav-vocabulary', 'Vocabulary'],
  ['nav-style', 'Style per app'],
  ['nav-about', 'About & diagnostics'],
];

test('existing settings from an earlier build carry over unchanged', async () => {
  // An earlier build saved an API key; its settings file is v1 (no dictation section).
  await start();
  await page.goto('app://renderer/settings/ai-servers');
  await page.getByTestId('llm-key').fill(KEY);
  await page.getByTestId('llm-save-key').click();
  await expect(page.getByTestId('llm-key-status')).toHaveText('Saved');
  await app!.close();
  writeFileSync(join(profile, 'settings.json'), V1);

  await start();
  await page.goto('app://renderer/settings/ai-servers');
  const v1 = JSON.parse(V1).data.ai;
  await expect(page.getByTestId('asr-base-url')).toHaveValue(v1.asr.baseUrl);
  await expect(page.getByTestId('asr-model')).toHaveValue(v1.asr.model);
  await expect(page.getByTestId('llm-base-url')).toHaveValue(v1.llm.baseUrl);
  await expect(page.getByTestId('llm-model')).toHaveValue(v1.llm.model);
  await expect(page.getByTestId('timeout-seconds')).toHaveValue(String(v1.timeoutMs / 1000));
  await expect(page.getByTestId('retries')).toHaveValue(String(v1.retries));
  await expect(page.getByTestId('llm-key-status')).toHaveText('Saved');

  // The file was upgraded with every old value intact; new options got defaults.
  expect(settingsFile()).toEqual({
    version: 4,
    data: {
      dictation: {
        mode: 'hold',
        toggleShortcut: ['Ctrl', 'Shift', 'Space'],
        micDeviceId: '',
        keepMicReadySeconds: 10,
        cleanup: 'light',
      },
      ai: v1,
    },
  });
});

test('every section is reachable, one active at a time', async () => {
  await start();
  await page.getByTestId('nav-settings').click();
  await expect(page).toHaveURL('app://renderer/settings/dictation');
  for (const [testId, heading] of SECTIONS) {
    await page.getByTestId(testId).click();
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    const current = page.getByTestId('settings-nav').locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-testid', testId);
  }
  // Old address still works.
  await page.goto('app://renderer/settings/diagnostics');
  await expect(page.getByRole('heading', { level: 1, name: 'About & diagnostics' })).toBeVisible();
});

test('changes save automatically with a visible confirmation and survive a restart', async () => {
  await start();
  await page.goto('app://renderer/settings/dictation');
  const pill = page.getByTestId('save-status');
  await expect(pill).toHaveText(/Changes save automatically/);
  // (Key caps also carry screen-reader text, so match loosely.)
  await expect(page.getByTestId('dictation-status')).toContainText(/Hold\s*Ctrl.*to dictate/);

  // Keyboard: arrow to "Toggle" in the option cards.
  await page.locator('[data-option="hold"] input').focus();
  await page.keyboard.press('ArrowDown');
  await expect(pill).toHaveText(/Saved/);
  await expect(page.locator('[data-option="toggle"] input')).toBeChecked();
  await expect(page.getByTestId('dictation-status')).toContainText(
    /Press\s*Ctrl.*Space.*to dictate/,
  );
  await expect(page.getByRole('heading', { name: '1. Press' })).toBeVisible();
  expect(settingsFile().data.dictation.mode).toBe('toggle');

  // Another page starts fresh.
  await page.getByTestId('nav-ai-servers').click();
  await expect(pill).toHaveText(/Changes save automatically/);

  await restart();
  await page.goto('app://renderer/settings/dictation');
  await expect(page.locator('[data-option="toggle"] input')).toBeChecked();
});

test('a failed save is shown in the confirmation pill', async () => {
  test.skip(process.platform === 'win32', 'uses Unix file permissions');
  await start();
  await page.goto('app://renderer/settings/dictation');
  await page.getByTestId('dictation-mode').waitFor();
  chmodSync(profile, 0o500); // settings can't be written any more
  await page.locator('[data-option="toggle"]').click();
  await expect(page.getByTestId('save-status')).toHaveText(/Couldn't save/);
  await expect(page.getByTestId('dictation-error')).toBeVisible();
});

test('accessibility check passes on every settings page', async () => {
  await start();
  for (const [testId] of SECTIONS) {
    const path = testId.replace('nav-', '');
    await page.goto(`app://renderer/settings/${path}`);
    await page.locator('h1').waitFor();
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => `${path} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
