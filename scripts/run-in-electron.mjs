// Run a Node script with Electron's own Node (ELECTRON_RUN_AS_NODE), so native modules built for
// Electron (the encrypted SQLite driver) load in tests exactly as in the app.
// Usage: node scripts/run-in-electron.mjs <script> [args…]
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron'); // path to the Electron binary
const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('Usage: node scripts/run-in-electron.mjs <script> [args…]');
  process.exit(2);
}
const result = spawnSync(electron, [script, ...args], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(result.status ?? 1);
