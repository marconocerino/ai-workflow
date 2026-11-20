// Starts a packaged build with a throwaway profile and waits for the log lines that say the app
// started, its encrypted database opened (VAI-108) and the tray icon loaded (VAI-205). Playwright can't drive packaged builds
// (the Electron fuses block --inspect), so this reads our own log instead.
// Chromium switches: --user-data-dir keeps the real profile untouched; --use-mock-keychain
// avoids the macOS Keychain prompt for unsigned dev builds (Windows DPAPI never prompts).
// Usage: node scripts/smoke-packaged.mjs [app executable]   (default: this platform's build)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaultExecutable() {
  const release = path.join(root, 'release');
  if (process.platform === 'win32') return path.join(release, 'win-unpacked', 'AI Workflow.exe');
  if (process.platform === 'darwin') {
    const dir = readdirSync(release).find((d) => d.startsWith('mac'));
    return path.join(release, dir ?? 'mac', 'AI Workflow.app', 'Contents', 'MacOS', 'AI Workflow');
  }
  return path.join(release, 'linux-unpacked', 'ai-workflow');
}

const exe = process.argv[2] ?? defaultExecutable();
if (!existsSync(exe)) {
  console.error(`Not found: ${exe} (build it first)`);
  process.exit(1);
}

// The app archive may only hold the built app — never sources, tests, docs or tool settings.
const ALLOWED_TOP_LEVEL = new Set([
  'dist',
  'node_modules',
  'assets',
  'package.json',
  'resources',
  'THIRD_PARTY_NOTICES.md',
]);
const asarFile =
  process.platform === 'darwin'
    ? path.join(path.dirname(path.dirname(exe)), 'Resources', 'app.asar')
    : path.join(path.dirname(exe), 'resources', 'app.asar');
if (existsSync(asarFile)) {
  // @electron/asar comes with electron-builder.
  const require = createRequire(
    createRequire(import.meta.url).resolve('app-builder-lib/package.json'),
  );
  const asar = require('@electron/asar');
  const top = new Set(asar.listPackage(asarFile).map((p) => p.split(/[\\/]/)[1]));
  const extra = [...top].filter((t) => t && !ALLOWED_TOP_LEVEL.has(t));
  if (extra.length) {
    console.error(`app.asar contains files that must not ship: ${extra.join(', ')}`);
    process.exit(1);
  }
}
const profile = mkdtempSync(path.join(tmpdir(), 'aiw-smoke-'));
const logFile = path.join(profile, 'logs', 'main.log');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, [`--user-data-dir=${profile}`, '--use-mock-keychain'], {
  env,
  stdio: 'ignore',
});
const deadline = Date.now() + 30_000;

function finish(code, message) {
  clearInterval(timer);
  child.kill();
  (code === 0 ? console.log : console.error)(message);
  // Give the app a moment to exit before removing its profile.
  setTimeout(() => {
    rmSync(profile, { recursive: true, force: true });
    process.exit(code);
  }, 500);
}

const timer = setInterval(() => {
  const text = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
  const opened = text.match(/\[db\] Database opened status=(\w+) schema=(\d+)/);
  if (text.includes('Tray icon missing')) return finish(1, `tray icon missing\n${text}`);
  if (opened?.[1] === 'ok' && text.includes('[tray] Tray created')) {
    return finish(0, `ok: started, database status=ok schema=${opened[2]}, tray created`);
  }
  if (opened && opened[1] !== 'ok') return finish(1, `database status=${opened[1]}\n${text}`);
  if (child.exitCode !== null) return finish(1, `app exited (code ${child.exitCode})\n${text}`);
  if (Date.now() > deadline) return finish(1, `app did not start within 30 s\n${text}`);
}, 250);
