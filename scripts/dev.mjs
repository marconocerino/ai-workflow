// Dev runner for `npm start`: Angular dev server + tsc watch for electron/ + Electron.
// Cross-platform, no extra dependencies. Ctrl+C or closing the window stops everything.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildMacHelpers } from './build-mac-helpers.mjs';

const require = createRequire(import.meta.url);
const PORT = 4200;
const DEV_URL = `http://localhost:${PORT}`;

const ngBin = require.resolve('@angular/cli/bin/ng.js');
const tscBin = require.resolve('typescript/bin/tsc');
const electronBin = require('electron'); // path to the Electron binary

// Some hosts (e.g. VS Code terminals) set this, which turns Electron into plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const children = [];
const run = (cmd, args, extraEnv = {}) => {
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...env, ...extraEnv } });
  children.push(child);
  return child;
};
const stopAll = (code = 0) => {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
};
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

// 0. macOS: build the Hold-Ctrl and paste helpers if missing or changed (VAI-312). Without them
//    dictation still works with the toggle shortcut and the clipboard.
if (process.platform === 'darwin') {
  try {
    buildMacHelpers();
  } catch (e) {
    console.warn(`[dev] macOS helpers not built: ${e.message}`);
    console.warn('[dev] Hold Ctrl and paste at cursor are off; the toggle shortcut works.');
  }
}

// 1. Compile main + preload once, then keep watching. (Restart `npm start` after main changes.)
const first = spawnSync(process.execPath, [tscBin, '-p', 'electron/tsconfig.json'], {
  stdio: 'inherit',
});
if (first.status !== 0) process.exit(first.status ?? 1);
run(process.execPath, [tscBin, '-p', 'electron/tsconfig.json', '--watch', '--preserveWatchOutput']);

// 2. Angular dev server (renderer reloads live).
run(process.execPath, [ngBin, 'serve', '--port', String(PORT)]);

// 3. Wait for the dev server, then start Electron pointing at it.
async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not start on ${url}`);
}

try {
  await waitForServer(DEV_URL);
} catch (e) {
  console.error(e.message);
  stopAll(1);
}
const electron = run(electronBin, ['.'], { AIW_DEV_SERVER_URL: DEV_URL });
electron.on('exit', (code) => stopAll(code ?? 0));
