import AxeBuilder from '@axe-core/playwright';
import { type ElectronApplication, type Locator, type Page, expect, test } from '@playwright/test';
import { rmSync } from 'node:fs';
import { launchApp, tempProfile } from './launch';

let app: ElectronApplication;
let page: Page;
let profile: string;

test.beforeAll(async () => {
  profile = tempProfile();
  ({ app, page } = await launchApp(profile));
});
test.afterAll(async () => {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
});

async function openGallery() {
  await page.goto('app://renderer/gallery');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Interactive components on the gallery, by data-interactive id. */
const INTERACTIVE = [
  'button-primary',
  'button-secondary',
  'button-quiet',
  'button-danger',
  'button-icon-text',
  'button-icon',
  'input',
  'select',
  'textarea',
  'toggle',
  'checkbox',
  'options',
  'card-link',
  'chip-topic',
] as const;

/** Element whose look we compare (Material wraps inputs in a form field). */
function visual(id: string): Locator {
  const el = page.locator(`[data-interactive="${id}"]`);
  if (id === 'input' || id === 'textarea' || id === 'select') {
    return page.locator('mat-form-field').filter({ has: el });
  }
  if (id === 'options') return page.locator('[data-option="hold"]');
  return el;
}

/** The element that receives keyboard focus. */
function focusTarget(id: string): Locator {
  const el = page.locator(`[data-interactive="${id}"]`);
  if (id === 'toggle') return el.locator('button[role="switch"]');
  if (id === 'checkbox') return el.locator('input[type="checkbox"]');
  if (id === 'options') return page.locator('[data-option="hold"] input[type="radio"]');
  return el;
}

/** Computed look of an element and its subtree, incl. ::before/::after (Material state layers). */
function snapshot(locator: Locator): Promise<string> {
  return locator.evaluate((root) => {
    const props = [
      'background-color',
      'border-top-color',
      'border-top-width',
      'box-shadow',
      'color',
      'opacity',
      'outline-style',
      'outline-width',
      'outline-color',
      'transform',
    ];
    const nodes = [root, ...root.querySelectorAll('*')].slice(0, 80);
    return JSON.stringify(
      nodes.flatMap((n) =>
        [null, '::before', '::after'].map((pseudo) => {
          const s = getComputedStyle(n, pseudo);
          return props.map((p) => s.getPropertyValue(p)).join('|');
        }),
      ),
    );
  });
}

async function resetPointerAndFocus() {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(200);
}

test.describe('gallery', () => {
  test.beforeEach(openGallery);

  test('shows every component', async () => {
    for (const heading of [
      'Buttons',
      'Inputs and select',
      'Toggle and checkbox',
      'Option cards',
      'Cards',
      'Chips',
      'Key caps, agent avatars, badge',
      'Dictation bar',
      'Icons (Lucide)',
      'Section label',
    ]) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    for (const id of INTERACTIVE)
      await expect(page.locator(`[data-interactive="${id}"]`)).toHaveCount(1);
    await expect(page.locator('aiw-agent-avatar')).toHaveCount(12);
    await expect(page.locator('aiw-dictation-bar')).toHaveCount(3);
    await expect(page.locator('aiw-icon[role="img"], .icons aiw-icon')).not.toHaveCount(0);
  });

  for (const id of INTERACTIVE) {
    test(`${id}: hover and keyboard focus are visible`, async () => {
      await resetPointerAndFocus();
      const before = await snapshot(visual(id));

      await visual(id).hover();
      await page.waitForTimeout(250);
      expect(await snapshot(visual(id)), 'hover should change the look').not.toBe(before);

      await resetPointerAndFocus();
      // Keyboard focus: focus the previous element, then Tab into the target.
      await focusTarget(id).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
      await expect(focusTarget(id)).toBeFocused();
      expect(await snapshot(visual(id)), 'keyboard focus should change the look').not.toBe(before);
    });
  }

  test('disabled components cannot be focused or used', async () => {
    const disabled = page.locator('[data-disabled]');
    const count = await disabled.count();
    expect(count).toBeGreaterThanOrEqual(9);

    // Tab through the whole page; no disabled component may receive focus.
    await page.locator('h1').click();
    const reached = new Set<string>();
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const ids = await page.evaluate(() => {
        const a = document.activeElement;
        return {
          interactive: a?.closest('[data-interactive]')?.getAttribute('data-interactive') ?? null,
          disabled: a?.closest('[data-disabled]')?.getAttribute('data-disabled') ?? null,
        };
      });
      expect(ids.disabled, `focus reached disabled ${ids.disabled}`).toBeNull();
      if (ids.interactive) reached.add(ids.interactive);
    }
    // ...and every enabled component was reachable by Tab.
    expect([...reached].sort()).toEqual([...INTERACTIVE].sort());

    // Disabled buttons don't react to clicks.
    const counter = page.getByText(/Clicked \d+ times/);
    const text = await counter.textContent();
    await page.locator('[data-disabled="button-primary"]').click({ force: true });
    await page.locator('[data-disabled="chip-topic"]').click({ force: true });
    await expect(counter).toHaveText(text!);

    // Disabled toggle, checkbox and option don't change.
    await page.locator('[data-disabled="toggle"]').click({ force: true });
    await expect(page.locator('[data-disabled="toggle"] button[role="switch"]')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.locator('[data-disabled="option"]').click({ force: true });
    await expect(page.getByText('Selected: hold')).toBeVisible();
  });

  test('keyboard: buttons, chips, toggle, checkbox, option cards and select', async () => {
    const counter = page.getByText(/Clicked \d+ times/);
    await expect(counter).toHaveText('Clicked 0 times');

    await focusTarget('button-primary').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(counter).toHaveText('Clicked 2 times');

    await focusTarget('chip-topic').focus();
    await page.keyboard.press('Enter');
    await expect(counter).toHaveText('Clicked 3 times');

    await focusTarget('toggle').focus();
    await page.keyboard.press('Space');
    await expect(focusTarget('toggle')).toHaveAttribute('aria-checked', 'true');

    await focusTarget('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(focusTarget('checkbox')).toBeChecked();

    // Arrow keys move between option cards and skip the disabled one.
    await focusTarget('options').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText('Selected: toggle')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText('Selected: hold')).toBeVisible();

    // Select: open with Enter, choose with arrows, Esc closes without choosing.
    await focusTarget('select').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(focusTarget('select')).toContainText('Headset microphone');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(focusTarget('select')).toContainText('Headset microphone');
  });

  test('every button and control has an accessible name', async () => {
    const controls = page.locator(
      'button, [role="switch"], input, textarea, [role="combobox"], a[href]',
    );
    const count = await controls.count();
    expect(count).toBeGreaterThan(20);
    for (let i = 0; i < count; i++) {
      await expect(controls.nth(i)).toHaveAccessibleName(/\S/);
    }
  });
});

test('automated accessibility check (axe) passes on gallery, home and settings pages', async () => {
  for (const url of [
    'app://renderer/gallery',
    'app://renderer/',
    'app://renderer/settings/ai-servers',
    'app://renderer/settings/dictation',
    'app://renderer/settings/about',
    'app://renderer/settings/transcription',
  ]) {
    await page.goto(url);
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .setLegacyMode(true) // runs inside the page; Electron can't open helper pages
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map(
      (v) =>
        `${url} ${v.id}: ${v.help} — ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    );
    expect(summary).toEqual([]);
  }
});
