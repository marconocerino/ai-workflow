import { type ElectronApplication, type Page, expect, test } from '@playwright/test';
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

const RED = 'rgb(255, 0, 0)';

/** Computed CSS property of the first element matching `selector`. */
function css(p: Page, selector: string, prop: string) {
  return p
    .locator(selector)
    .first()
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), prop);
}

async function setToken(p: Page, name: string, value: string | null) {
  await p.evaluate(
    ([n, v]) => {
      if (v === null) document.documentElement.style.removeProperty(n!);
      else document.documentElement.style.setProperty(n!, v);
    },
    [name, value] as const,
  );
}

test('changing one token updates every screen, Material components included', async () => {
  // Home
  await page.goto('app://renderer/');
  const homeBefore = await css(page, '[data-testid="refresh"]', 'background-color');
  await setToken(page, '--aiw-color-primary', '#ff0000');
  expect(await css(page, '[data-testid="refresh"]', 'background-color')).toBe(RED); // mat-flat-button
  await setToken(page, '--aiw-color-primary', null);
  expect(await css(page, '[data-testid="refresh"]', 'background-color')).toBe(homeBefore);

  // Settings
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('nav-ai-servers').click();
  await page.getByTestId('llm-base-url').waitFor();
  await setToken(page, '--aiw-color-primary', '#ff0000');
  expect(await css(page, '.logo', 'background-color')).toBe(RED); // our component
  expect(await css(page, '[data-testid="back-to-workspace"]', 'color')).toBe(RED); // link
  await page.getByTestId('llm-base-url').focus();
  expect(
    await css(page, '.mdc-text-field--focused .mdc-notched-outline__leading', 'border-color'),
  ).toBe(RED); // Material form field

  await setToken(page, '--aiw-color-active', '#ff0000');
  expect(await css(page, 'nav a.active', 'background-color')).toBe(RED);

  await setToken(page, '--aiw-color-surface', '#ff0000');
  expect(await css(page, '.aiw-card', 'background-color')).toBe(RED);

  for (const t of ['--aiw-color-primary', '--aiw-color-active', '--aiw-color-surface']) {
    await setToken(page, t, null);
  }
  await page.getByTestId('back-to-workspace').click();
});

test('Fraunces, Archivo and JetBrains Mono are bundled and used', async () => {
  await page.goto('app://renderer/');
  await page.locator('h1').waitFor();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      display: document.fonts.check('700 32px "Fraunces Variable"'),
      text: document.fonts.check('400 15px "Archivo Variable"'),
      mono: document.fonts.check('400 13px "JetBrains Mono Variable"'),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      h1: getComputedStyle(document.querySelector('h1')!).fontFamily,
      body: getComputedStyle(document.body).fontFamily,
      kbd: getComputedStyle(document.querySelector('kbd')!).fontFamily,
    };
  });
  expect(fonts.display && fonts.text && fonts.mono).toBe(true);
  expect(fonts.loaded).toEqual(
    expect.arrayContaining(['Fraunces Variable', 'Archivo Variable', 'JetBrains Mono Variable']),
  );
  expect(fonts.h1).toMatch(/^"Fraunces Variable"/);
  expect(fonts.body).toMatch(/^"Archivo Variable"/);
  expect(fonts.kbd).toMatch(/^"JetBrains Mono Variable"/);
});

/** Contrast of every visible text element against its nearest opaque background. */
async function lowContrastTexts(p: Page) {
  return p.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: r!, g: g!, b: b!, a: a! };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = (el: Element | null) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a >= 0.99) return c;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
      if (el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"]')) continue;
      // Material floating labels sit on the outline; their colour is checked via tokens.
      const fg = parse(style.color);
      if (!fg) continue;
      const bg = background(el);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi! + 0.05) / (lo! + 0.05);
      if (ratio < 4.5)
        out.push(
          `"${text.slice(0, 40)}" ${ratio.toFixed(2)}:1 (${style.color} on rgb(${bg.r}, ${bg.g}, ${bg.b}))`,
        );
    }
    return out;
  });
}

test('all visible text meets 4.5:1 on Home and Settings', async () => {
  await page.goto('app://renderer/');
  await page.getByTestId('app-version').waitFor();
  expect(await lowContrastTexts(page)).toEqual([]);

  // Self-check: a too-light text colour must be reported.
  await setToken(page, '--aiw-color-ink-muted', '#b5bdb0');
  expect((await lowContrastTexts(page)).length).toBeGreaterThan(0);
  await setToken(page, '--aiw-color-ink-muted', null);

  await page.getByTestId('nav-settings').click();
  await page.getByTestId('nav-ai-servers').click();
  await page.getByTestId('llm-base-url').waitFor();
  expect(await lowContrastTexts(page)).toEqual([]);

  // Error and result states too.
  await page.getByTestId('llm-base-url').fill('not a url');
  await page.getByTestId('llm-model').click();
  await page.getByTestId('asr-test').click();
  await page.getByTestId('asr-test-result').waitFor();
  expect(await lowContrastTexts(page)).toEqual([]);
});
