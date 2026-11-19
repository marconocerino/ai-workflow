import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchApp, tempProfile } from './launch';

const BUILD = join(ROOT, 'dist', 'renderer');

/** The lazy chunk file that contains a component, found by its selector. */
function chunkFor(selector: string): string {
  const file = readdirSync(BUILD).find(
    (f) => f.startsWith('chunk-') && readFileSync(join(BUILD, f), 'utf8').includes(`"${selector}"`),
  );
  if (!file) throw new Error(`No chunk contains ${selector}`);
  return file;
}

let app: ElectronApplication;
let page: Page;
let profile: string;
let requested: string[];

async function start(policy?: object) {
  profile = tempProfile();
  const env: Record<string, string> = {};
  if (policy) {
    const file = join(profile, 'policy.json');
    writeFileSync(file, JSON.stringify(policy));
    env['AIW_POLICY_FILE'] = file;
  }
  ({ app, page } = await launchApp(profile, env));
  requested = [];
  page.on('request', (r) => requested.push(r.url()));
}

test.afterEach(async () => {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
});

const HIDDEN_WORDS = /\b(meetings?|agents?|voiceprints?)\b/i;

test('default policy: meetings, agents and voiceprints leave no UI traces', async () => {
  await start();
  for (const url of [
    'app://renderer/',
    'app://renderer/settings/ai-servers',
    'app://renderer/settings/dictation',
    'app://renderer/settings/about',
    'app://renderer/settings/transcription',
  ]) {
    await page.goto(url);
    await page.locator('h1').waitFor();
    const text = await page.locator('body').innerText();
    expect(text, `visible text on ${url}`).not.toMatch(HIDDEN_WORDS);
    const labels = await page
      .locator('[aria-label], [title], a[href]')
      .evaluateAll((els) =>
        els.map((e) =>
          [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('href')].join(' '),
        ),
      );
    expect(labels.join(' '), `labels and links on ${url}`).not.toMatch(HIDDEN_WORDS);
  }

  // Typing the address doesn't open them either: the routes don't exist.
  for (const hidden of ['meetings', 'agents']) {
    await page.goto(`app://renderer/${hidden}`);
    await expect(page.getByRole('heading', { name: 'AI Workflow', exact: true })).toBeVisible();
    expect(page.url()).toBe('app://renderer/');
  }

  // Their code was never downloaded.
  const files = requested.map((u) => u.split('/').pop());
  expect(files).not.toContain(chunkFor('app-meetings'));
  expect(files).not.toContain(chunkFor('app-agents'));

  // The renderer can only read flags.
  const state = await page.evaluate(() =>
    (
      window as unknown as { aiWorkflow: { features: { get(): Promise<unknown> } } }
    ).aiWorkflow.features.get(),
  );
  expect(state).toEqual({
    flags: { meetings: false, agents: false, voiceprints: false },
    sources: ['defaults'],
  });
});

test('managed policy turns on meetings for this user; agents stay hidden', async () => {
  await start({ features: { meetings: true } });

  await expect(page.getByTestId('nav-meetings')).toBeVisible();
  await expect(page.getByTestId('nav-agents')).toHaveCount(0);

  await page.getByTestId('nav-meetings').click();
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  expect(page.url()).toBe('app://renderer/meetings');
  const axe = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await page.goto('app://renderer/agents');
  await expect(page.getByRole('heading', { name: 'AI Workflow', exact: true })).toBeVisible();
  expect(requested.map((u) => u.split('/').pop())).not.toContain(chunkFor('app-agents'));

  await app.close();
  const log = readFileSync(join(profile, 'logs', 'main.log'), 'utf8');
  expect(log).toContain('[policy] Features meetings=on agents=off voiceprints=off source=file');
});
