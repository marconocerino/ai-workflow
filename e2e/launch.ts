import { type ElectronApplication, type Page, _electron as electron } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..');

/** A fresh, throwaway profile folder (settings, secrets) for one test run. */
export function tempProfile(): string {
  return mkdtempSync(join(tmpdir(), 'aiw-e2e-'));
}

/**
 * Launch the production build with an isolated profile and a mock macOS keychain
 * (no Keychain prompts; Windows uses DPAPI, which never prompts).
 */
export async function launchApp(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
  extraArgs: string[] = [],
): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env['AIW_DEV_SERVER_URL']; // always test the production build
  delete env['ELECTRON_RUN_AS_NODE'];
  env['AIW_USER_DATA_DIR'] = userDataDir;
  env['AIW_MOCK_KEYCHAIN'] = '1';
  env['AIW_E2E'] = '1'; // test hooks in the main process (dev builds only)
  Object.assign(env, extraEnv);

  const app = await electron.launch({ args: [ROOT, ...extraArgs], cwd: ROOT, env });
  const page = await mainWindow(app);
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/** The visible main window — not the hidden audio window (/audio-engine), whichever opens first. */
export async function mainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const found = app
      .windows()
      .find((p) => /^(app|http):/.test(p.url()) && !p.url().endsWith('/audio-engine'));
    if (found) return found;
    if (Date.now() > deadline) throw new Error('The main window did not open.');
    await new Promise((r) => setTimeout(r, 50));
  }
}
