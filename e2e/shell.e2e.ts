import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, tempProfile } from './launch';

let app: ElectronApplication;
let page: Page;
let profile: string;

async function start(features?: object) {
  profile = tempProfile();
  const env: Record<string, string> = {};
  if (features) {
    writeFileSync(join(profile, 'policy.json'), JSON.stringify({ features }));
    env['AIW_POLICY_FILE'] = join(profile, 'policy.json');
  }
  ({ app, page } = await launchApp(profile, env));
  await page.getByTestId('main-nav').waitFor();
}

test.afterEach(async () => {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
});

const nav = () => page.getByTestId('main-nav');
const current = () => nav().locator('a[aria-current="page"]');

async function expectSection(testId: string, heading: string, url: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(current()).toHaveCount(1);
  await expect(current()).toHaveAttribute('data-testid', testId);
  await expect(page.getByTestId(testId)).toHaveClass(/active/);
}

test('routes between all sections with one active item; back and forward work', async () => {
  await start({ meetings: true, agents: true });
  // Accessible names don't include the hidden unread badge.
  await expect(page.getByTestId('nav-agents')).toHaveAccessibleName('Agent chats');
  await expect(nav().locator('a .label')).toHaveText([
    'Home',
    'Meetings',
    'Agent chats',
    'Dictations',
  ]);
  await expectSection('nav-home', 'AI Workflow', 'app://renderer/');

  await page.getByTestId('nav-meetings').click();
  await expectSection('nav-meetings', 'Meetings', 'app://renderer/meetings');
  await page.getByTestId('nav-agents').click();
  await expectSection('nav-agents', 'Agent chats', 'app://renderer/agents');
  await page.getByTestId('nav-dictations').click();
  await expectSection('nav-dictations', 'Dictations', 'app://renderer/dictations');

  await page.goBack();
  await expectSection('nav-agents', 'Agent chats', 'app://renderer/agents');
  await page.goForward();
  await expectSection('nav-dictations', 'Dictations', 'app://renderer/dictations');

  // Settings has its own layout; "Back to workspace" returns home.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByRole('heading', { name: 'AI servers' })).toBeVisible();
  await expect(page.getByTestId('main-nav')).toHaveCount(0);
  await page.getByTestId('back-to-workspace').click();
  await expectSection('nav-home', 'AI Workflow', 'app://renderer/');

  // The company badge leads to the AI server settings.
  await page.getByTestId('company-badge').click();
  expect(page.url()).toBe('app://renderer/settings/ai-servers');
});

test('agent roster shows each agent with its status', async () => {
  await start({ agents: true });
  const roster = page.getByTestId('agent-roster');
  await expect(roster.getByRole('heading', { name: 'Your agents' })).toBeVisible();
  await expect(roster.getByRole('listitem')).toHaveText([
    /Notetaker\s*Idle/,
    /Researcher\s*Idle/,
    /Writer\s*Idle/,
    /Scheduler\s*Idle/,
  ]);
  await expect(page.getByTestId('company-badge')).toHaveText(/Runs on your company's AI servers/);
});

test('keyboard only: Tab through the sidebar, Enter opens a section', async () => {
  await start({ meetings: true });
  await page.getByTestId('nav-home').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('nav-meetings')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('nav-dictations')).toBeFocused();
  await page.keyboard.press('Enter');
  await expectSection('nav-dictations', 'Dictations', 'app://renderer/dictations');
  // Focus ring is visible.
  const outline = await page
    .getByTestId('nav-dictations')
    .evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('default flags: only Home and Dictations; accessibility check passes', async () => {
  await start();
  await expect(nav().locator('a .label')).toHaveText(['Home', 'Dictations']);
  await expect(page.getByTestId('agent-roster')).toHaveCount(0);
  await expect(page.getByTestId('ctrl-hint')).toHaveText(
    /^\s*Hold\s*Ctrl\s*anywhere to dictate\s*$/,
  );

  for (const url of ['app://renderer/', 'app://renderer/dictations']) {
    await page.goto(url);
    await page.locator('h1').waitFor();
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => `${url} ${v.id}`)).toEqual([]);
  }
});

test('all flags on: accessibility check passes on every section', async () => {
  await start({ meetings: true, agents: true });
  for (const url of ['app://renderer/', 'app://renderer/meetings', 'app://renderer/agents']) {
    await page.goto(url);
    await page.locator('h1').waitFor();
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => `${url} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
