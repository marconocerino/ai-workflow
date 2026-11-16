import {
  type ElectronApplication,
  type Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const env = { ...process.env };
  delete env['AIW_DEV_SERVER_URL']; // always test the production build
  delete env['ELECTRON_RUN_AS_NODE'];
  app = await electron.launch({ args: [root], cwd: root, env });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('launches the main window with the product name', async () => {
  await expect(page).toHaveTitle('AI Workflow');
  await expect(page.locator('h1')).toHaveText('AI Workflow');
  expect(page.url()).toBe('app://renderer/');
});

test('renderer has no Node access', async () => {
  const globals = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    module: typeof (globalThis as Record<string, unknown>)['module'],
    Buffer: typeof (globalThis as Record<string, unknown>)['Buffer'],
    bridgeKeys: Object.keys((globalThis as Record<string, object>)['aiWorkflow'] ?? {}),
  }));
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
    bridgeKeys: ['app'],
  });
});

test('main window runs with the secure webPreferences', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences()!;
    return {
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
      sandbox: p.sandbox,
      webSecurity: p.webSecurity,
    };
  });
  expect(prefs).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });
});

test('typed IPC round trip: app:get-info shows the real app version', async () => {
  await expect(page.getByTestId('app-version')).toHaveText(pkg.version);
  await expect(page.getByTestId('app-platform')).toHaveText(process.platform);
  await page.getByTestId('refresh').click();
  await expect(page.getByTestId('app-version')).toHaveText(pkg.version);
});

test('blocks new windows and navigation away from the app', async () => {
  const opened = await page.evaluate(() => window.open('https://example.com') === null);
  expect(opened).toBe(true);
  expect(app.windows()).toHaveLength(1);

  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe('app://renderer/');
});

test('CSP blocks inline scripts', async () => {
  const ran = await page.evaluate(() => {
    (window as unknown as Record<string, unknown>)['__inline'] = false;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = true';
    document.head.appendChild(s);
    return (window as unknown as Record<string, unknown>)['__inline'];
  });
  expect(ran).toBe(false);
});
