// Test double for aiw-key-listener.exe (VAI-301): prints READY, then replays lines that the test
// appends to a control file. "EXIT <code>" makes it exit (to test crashes/restarts).
// Started by the app when AIW_KEY_LISTENER_SCRIPT points here (dev builds only).
import { existsSync, readFileSync } from 'node:fs';

const control = process.env.AIW_FAKE_KEYS_FILE;
let sent = 0;
let ready = false;

process.stdin.on('end', () => process.exit(0)); // like the real helper: exit when the app goes
process.stdin.resume();

setInterval(() => {
  const lines = control && existsSync(control) ? readFileSync(control, 'utf8').split('\n') : [];
  if (!ready) {
    if (lines.includes('NO_READY')) return;
    ready = true;
    process.stdout.write('READY\n');
  }
  for (; sent < lines.length - 1; sent++) {
    const line = lines[sent];
    const exit = /^EXIT (\d+)$/.exec(line);
    if (exit) process.exit(Number(exit[1]));
    if (line && line !== 'NO_READY') process.stdout.write(`${line}\n`);
  }
}, 15);
